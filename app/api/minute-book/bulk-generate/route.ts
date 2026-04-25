/**
 * Sprint 9H — Phase 4d Stream 2.
 *
 * Bulk-generate endpoint powering the Minute Book "Rattrapage groupé" modal.
 * Thin fan-out over the unified generatePdfDocument pipeline (Stream 1):
 *   - Auth once, resolve active company once.
 *   - Validate body shape (items[] length 1..10, per-item YYYY-MM-DD date).
 *   - Run up to 3 items in parallel; allSettled semantics (failures do not
 *     abort the batch).
 *   - Preserve request order in the results array.
 *
 * Activity logging is handled inside generatePdfDocument (one
 * `document_generated` event per successful item). No "bulk" event.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { generatePdfDocument } from '@/lib/pdf/generatePdfDocument';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BulkItem {
  requirementKey: string;
  fiscalYear: number;
  resolutionDate: string; // YYYY-MM-DD
}

export type BulkErrorCode = 'not_found' | 'cannot_generate' | 'internal';

export type BulkGenerateResult =
  | {
      ok: true;
      documentId: string;
      fileName: string;
      title: string;
      requirementKey: string;
      fiscalYear: number;
    }
  | {
      ok: false;
      error: string;
      errorCode: BulkErrorCode;
      requirementKey: string;
      fiscalYear: number;
    };

const MAX_ITEMS = 10;
const CONCURRENCY = 3;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/*  Body validation                                                    */
/* ------------------------------------------------------------------ */

function validateItems(
  raw: unknown,
): { ok: true; items: BulkItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'items doit être un tableau.' };
  }
  if (raw.length < 1 || raw.length > MAX_ITEMS) {
    return {
      ok: false,
      error: `items doit contenir entre 1 et ${MAX_ITEMS} entrées.`,
    };
  }
  const out: BulkItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Entrée invalide.' };
    }
    const it = entry as Partial<BulkItem>;
    if (typeof it.requirementKey !== 'string' || it.requirementKey.length === 0) {
      return { ok: false, error: 'requirementKey requis.' };
    }
    if (typeof it.fiscalYear !== 'number' || !Number.isInteger(it.fiscalYear)) {
      return { ok: false, error: 'fiscalYear doit être un entier.' };
    }
    if (typeof it.resolutionDate !== 'string' || !DATE_REGEX.test(it.resolutionDate)) {
      return {
        ok: false,
        error: 'resolutionDate doit être au format YYYY-MM-DD.',
      };
    }
    out.push({
      requirementKey: it.requirementKey,
      fiscalYear: it.fiscalYear,
      resolutionDate: it.resolutionDate,
    });
  }
  return { ok: true, items: out };
}

/* ------------------------------------------------------------------ */
/*  Concurrency-limited runner                                         */
/* ------------------------------------------------------------------ */

/**
 * Runs `worker` across `items` with at most `limit` in flight. Preserves
 * request order in the returned array. The worker is expected to NEVER
 * throw (it should convert failures into result values) — this keeps the
 * batch allSettled-semantic without requiring a rejection handler here.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => pump()));
  return results;
}

/* ------------------------------------------------------------------ */
/*  POST                                                                */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    /* ---------- Parse + validate body ---------- */
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Corps JSON invalide.' },
        { status: 400 },
      );
    }
    const validation = validateItems((body as { items?: unknown }).items);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }
    const items = validation.items;

    /* ---------- Auth ---------- */
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    /* ---------- Resolve user's active company (same query as page.tsx) ---------- */
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();
    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Aucune société trouvée.' },
        { status: 404 },
      );
    }

    /* ---------- Service-role admin client for generation pipeline ---------- */
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Configuration Supabase manquante.' },
        { status: 500 },
      );
    }
    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

    /* ---------- Fan out, concurrency-limited, order-preserving ---------- */
    const results: BulkGenerateResult[] = await runWithConcurrency(
      items,
      CONCURRENCY,
      async (item): Promise<BulkGenerateResult> => {
        try {
          const res = await generatePdfDocument({
            supabaseAdmin,
            userId: user.id,
            companyId: company.id,
            requirementKey: item.requirementKey,
            year: item.fiscalYear,
            resolutionDate: item.resolutionDate,
          });
          if (res.ok) {
            return {
              ok: true,
              documentId: res.documentId,
              fileName: res.fileName,
              title: res.title,
              requirementKey: item.requirementKey,
              fiscalYear: item.fiscalYear,
            };
          }
          const errorCode: BulkErrorCode =
            res.canGenerate === false
              ? 'cannot_generate'
              : res.notFound
                ? 'not_found'
                : 'internal';
          return {
            ok: false,
            error: res.error,
            errorCode,
            requirementKey: item.requirementKey,
            fiscalYear: item.fiscalYear,
          };
        } catch (err) {
          console.error('[bulk-generate] Item failed:', err);
          return {
            ok: false,
            error: 'Erreur interne lors de la génération.',
            errorCode: 'internal',
            requirementKey: item.requirementKey,
            fiscalYear: item.fiscalYear,
          };
        }
      },
    );

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[bulk-generate] Full error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
