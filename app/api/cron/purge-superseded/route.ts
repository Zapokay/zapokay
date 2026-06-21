export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * #135 Part 3 — daily hard-purge of aged superseded documents + their Storage PDFs.
 *
 * Scheduled by Vercel Cron (vercel.json, `0 4 * * *`), NOT pg_cron (absent on this
 * project). Vercel Cron issues a GET with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * GO-FORWARD ONLY (locked scope A): only rows with a non-NULL `superseded_at`
 * older than the 10-day buffer are eligible. The legacy pre-Part3 rows
 * (superseded_at = NULL) are NEVER matched here — they are cleaned by the
 * separate test-data purge.
 *
 * Order is STORAGE-FIRST, then CONDITIONAL row-delete: we remove the Storage
 * objects first, and only delete the rows whose object is confirmed gone (or
 * was intentionally kept because it is still shared with a live row, or never
 * had an object). A row whose object genuinely failed to remove is left in
 * place and retried on the next run — we never orphan a Storage object by
 * deleting its only row before the object is gone.
 */

const BUFFER_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

interface EligibleRow {
  id: string;
  file_url: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // ---------- AUTH: Vercel Cron bearer secret ----------
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    // ---------- Service-role admin client (env-guarded, matches generate-item) ----------
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
    }
    const supabaseAdmin = createServiceClient();

    // ---------- 1. Select eligible rows (go-forward only) ----------
    const cutoff = new Date(Date.now() - BUFFER_MS).toISOString();
    const { data: eligibleData, error: selectError } = await supabaseAdmin
      .from('documents')
      .select('id, file_url')
      .eq('status', 'superseded')
      .not('superseded_at', 'is', null)
      .lt('superseded_at', cutoff);

    if (selectError) {
      console.error('[#135 purge] eligible select failed:', selectError);
      return NextResponse.json({ purged: 0, error: selectError.message }, { status: 200 });
    }

    const eligible = (eligibleData ?? []) as EligibleRow[];
    if (eligible.length === 0) {
      return NextResponse.json({ purged: 0, message: 'nothing eligible' }, { status: 200 });
    }

    // ---------- 2. Delete-set safety: never remove an object a live row still uses ----------
    const distinctPaths = Array.from(
      new Set(eligible.map((r) => r.file_url).filter((u): u is string => !!u)),
    );

    const stillReferenced = new Set<string>();
    if (distinctPaths.length > 0) {
      const { data: refData, error: refError } = await supabaseAdmin
        .from('documents')
        .select('file_url')
        .neq('status', 'superseded')
        .in('file_url', distinctPaths);
      if (refError) {
        // Can't prove safety → don't risk orphaning a live PDF. Bail without deleting.
        console.error('[#135 purge] reference check failed:', refError);
        return NextResponse.json({ purged: 0, error: refError.message }, { status: 200 });
      }
      for (const row of refData ?? []) {
        if (row.file_url) stillReferenced.add(row.file_url);
      }
    }

    // Paths safe to physically remove = eligible distinct paths NOT shared with a live row.
    const safePaths = distinctPaths.filter((p) => !stillReferenced.has(p));

    // ---------- 3. STORAGE-FIRST removal ----------
    // remove() succeeds wholesale (silently ignoring already-absent keys) or errors
    // wholesale. A total error means delete NO rows this run (retry next run).
    let objectsRemoved = 0;
    const confirmedGone = new Set<string>();
    if (safePaths.length > 0) {
      const { data: removed, error: storageError } = await supabaseAdmin.storage
        .from('documents')
        .remove(safePaths);
      if (storageError) {
        console.error('[#135 purge] storage remove failed (no rows deleted):', storageError);
        return NextResponse.json({ purged: 0, error: storageError.message }, { status: 200 });
      }
      objectsRemoved = removed?.length ?? 0;
      // Call succeeded → every safe path is now absent (removed OR already-absent = gone).
      for (const p of safePaths) confirmedGone.add(p);
    }

    // ---------- 4. CONDITIONAL row-delete ----------
    // A row is deletable when its object is no longer a liability:
    //   (a) no file_url            → nothing to remove
    //   (b) still-referenced path  → object intentionally KEPT (shared with a live row),
    //                                but the aged-out superseded ROW is still purged
    //   (c) confirmed-gone path    → object removed or already-absent
    // The ONLY rows we keep are those whose object genuinely failed to remove.
    const rowIdsToDelete: string[] = [];
    for (const r of eligible) {
      const deletable =
        !r.file_url ||
        stillReferenced.has(r.file_url) ||
        confirmedGone.has(r.file_url);
      if (deletable) rowIdsToDelete.push(r.id);
    }
    const skippedFailures = eligible.length - rowIdsToDelete.length;

    let rowsDeleted = 0;
    if (rowIdsToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('documents')
        .delete()
        .in('id', rowIdsToDelete);
      if (deleteError) {
        console.error('[#135 purge] row delete failed:', deleteError);
        return NextResponse.json(
          { eligible: eligible.length, objectsRemoved, rowsDeleted: 0, error: deleteError.message },
          { status: 200 },
        );
      }
      rowsDeleted = rowIdsToDelete.length;
    }

    const summary = {
      eligible: eligible.length,
      objectsRemoved,
      rowsDeleted,
      skippedFailures,
    };
    console.log('[#135 purge] done:', summary);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    console.error('[#135 purge] unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
