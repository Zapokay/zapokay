/**
 * Shared document upload pipeline — ONE caller, measured 2026-08-23:
 *   - app/api/documents/upload/route.ts  (BOTH UI paths POST to it; neither
 *     UploadDocumentModal nor CompletenessPage calls this helper directly)
 *
 * Responsibilities:
 *   1. ASCII-safe storage key (via toStorageSafeName)
 *   2. Upload the file to the `documents` bucket
 *   3. Derive minute_book_section (via existing getMinuteBookSection logic)
 *   4. Insert the document row
 *   5. On DB failure, roll back the storage object
 *   6. Log 'document_uploaded' activity on success
 *
 * Runtime: the SupabaseClient is INJECTED by the caller, so this helper is
 * client-agnostic —
 *   - browser callers (UploadDocumentModal, CompletenessPage) pass a session
 *     client; for them the PDF magic-number gate below is client-side
 *     defense-in-depth (catches misnamed files past the HTML `accept` attr and
 *     the MIME-string check, but a motivated user can bypass the browser path);
 *   - the /api/documents/upload route passes a service-role admin client, after
 *     it has already auth-gated the user, validated company ownership, and run
 *     the authoritative %PDF byte + size checks server-side (Brief 2a).
 * The gate below remains defense-in-depth regardless of caller — it is NOT the
 * authoritative server check; the route owns that. The byte check is shared via
 * lib/pdf-magic.ts so the two copies cannot drift.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import { toStorageSafeName } from '@/lib/storage-key';
import { resolveMinuteBookSection, isMinuteBookSection } from '@/lib/minute-book-section';
import { logActivity } from '@/lib/activity-log';
import { isPdfBytes } from '@/lib/pdf-magic';

export interface UploadDocumentParams {
  file: File;
  companyId: string;
  userId: string;
  supabaseClient: SupabaseClient;
  title: string;
  docType: string;
  language: string;
  docYear: number | null;
  requirementKey: string | null;
  requirementYear: number | null;
  framework: 'LSA' | 'CBCA';
  /** Requirements list from /api/minute-book/completeness — used to resolve minute_book_section. */
  requirements: ChecklistItem[];
  /**
   * A2c — the section the USER picked in the import form. Honoured over the
   * derived one, but only if it is one of the nine: anything else falls back
   * to resolution rather than reaching the insert and failing the CHECK.
   */
  minuteBookSection?: string | null;
  /**
   * A2b — the user picked "Documents fondateurs" in the fiscal-year field. It
   * needs its own field because 'none' cannot ride on `docYear` (see the
   * docblock in lib/minute-book-section.ts).
   */
  noFiscalYear?: boolean;
  /**
   * User-certified "final and signed" flag (Phase B). When true, the document
   * is treated as canonical for Binder views (Phase C). Defaults to false:
   * preserves the safety property that anything uncertified is provisional.
   */
  isFinalized?: boolean;
  /**
   * Phase B B4 — when set, this is a *replace* operation: the new file is
   * uploaded and inserted first; on success, the old documents row + its
   * storage object are deleted. Insert-then-delete is the safer sequence —
   * if the new upload fails, the old doc remains intact. Cleanup failures
   * after the new doc commits are non-fatal (logged as orphans). No UNIQUE
   * constraint on (company_id, requirement_key, document_year) was found
   * in migrations as of 2026-05-06, so two rows briefly coexist between
   * insert and delete; a hidden prod constraint would surface as a 23505
   * unique_violation on insert and the helper would return ok:false with
   * the old doc untouched.
   */
  replaceDocumentId?: string;
  /**
   * Brief 2 — lifecycle event-row upload. When provided, after the documents
   * row inserts, an event_documents link row is written at the 4-col grain
   * (document_id, event_type, event_id, event_phase) so the uploaded doc
   * satisfies the lifecycle act exactly as a generated one does. ADDITIVE:
   * every requirement-path caller omits this and behaves identically. Mirrors
   * the generate orchestrator's link write incl. compensating delete (if the
   * link insert fails the just-inserted doc is removed). Written BEFORE the
   * replaceDocumentId cleanup below, so a link failure rolls back the NEW doc
   * and leaves the replace target intact.
   */
  eventLink?: { event_type: string; event_id: string; event_phase: string };
  /**
   * A2a — the requirements this document DECLARES it covers. One requirement_documents
   * row per entry, in a SINGLE multi-row insert (atomic in Postgres, so no partial
   * state). The caller ALSO copies the first entry into the scalar requirement_key /
   * requirement_year: the double write is the point — the seven scalar readers must
   * see no difference, which is what allows switching them over one at a time.
   * VAULT PATH ONLY (Max's ruling, 2026-08-23). Row mode deliberately omits it: its
   * link would be an exact copy of the scalar, so it carries zero information, and
   * A4's backfill of the 83 historical rows covers that path anyway.
   */
  requirementLinks?: { requirement_key: string; requirement_year: number | null }[];
}

export type UploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

/**
 * Derive minute_book_section either from the explicit requirement (preferred)
 * or fall back to the vault docType. Pre-existing logic from UploadZone.tsx.
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<UploadResult> {
  const {
    file,
    companyId,
    userId,
    supabaseClient: supabase,
    title,
    docType,
    language,
    docYear,
    requirementKey,
    requirementYear,
    framework,
    requirements,
    minuteBookSection: explicitSection,
    noFiscalYear = false,
    isFinalized = false,
    replaceDocumentId,
    eventLink,
    requirementLinks,
  } = params;

  // Layer C: PDF magic-number gate (defense-in-depth — see docstring).
  // Shared byte check (lib/pdf-magic.ts) — same source of truth as the
  // authoritative server-side check in /api/documents/upload.
  const headBytes = await file.slice(0, 4).arrayBuffer();
  if (!isPdfBytes(headBytes)) {
    return { ok: false, error: 'NON_PDF_REJECTED' };
  }

  // 1. Sanitize filename + build storage key.
  const safeName = toStorageSafeName(file.name);
  const storagePath = `${companyId}/${Date.now()}-${safeName}`;

  // 2. Upload to Storage.
  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType: file.type || 'application/pdf', upsert: false });

  if (storageError) {
    console.error('[uploadDocument] Storage upload failed:', storageError);
    return { ok: false, error: storageError.message };
  }

  // 3. Resolve minute_book_section. The user's explicit pick wins when it is
  //    one of the nine; absent, empty or unknown derives as before.
  const minuteBookSection = isMinuteBookSection(explicitSection)
    ? explicitSection
    : resolveMinuteBookSection(requirementKey, docType, requirements, noFiscalYear);

  // 4. Insert the document row. Store the relative storage key in file_url
  //    (see lib/storage-path.ts — consumers normalize either shape, producers
  //    should prefer the relative key).
  const { data: insertedDoc, error: dbError } = await supabase
    .from('documents')
    .insert({
      company_id: companyId,
      title: title.trim(),
      document_type: docType,
      document_year: docYear,
      file_url: storagePath,
      // Preserve the user's original filename (with accents/spaces) for display
      // on download. The sanitized key used in Storage lives in `file_url`.
      file_name: file.name,
      language,
      framework,
      uploaded_at: new Date().toISOString(),
      source: 'uploaded',
      is_finalized: isFinalized,
      // A8-1 — le scalaire n'est plus écrit. La couverture vit exclusivement
      // dans `requirement_documents`, insérée au bloc 4c plus bas, qui lit
      // `requirementLinks` et non ces deux variables.
      // `documents.requirement_key` n'a plus aucun lecteur depuis `e3e7617`
      // et n'a plus aucun écrivain depuis ce lot.
      // ⚠️ Ne pas la ressusciter : « la première exigence » n'a jamais été
      // une désignation de l'utilisateur, seulement l'ordre dans lequel le
      // catalogue est émis (E1).
      ...(minuteBookSection ? { minute_book_section: minuteBookSection } : {}),
    })
    .select('id')
    .single();

  if (dbError || !insertedDoc) {
    console.error('[uploadDocument] DB insert failed:', dbError);
    // Rollback: remove the orphaned storage object.
    await supabase.storage.from('documents').remove([storagePath]);
    return { ok: false, error: dbError?.message ?? 'Document insert failed' };
  }

  // 4b. Event-document link (Brief 2 — lifecycle event rows). Mirrors the
  //     generate orchestrator's pattern (lib/pdf/generate-lifecycle-document.ts)
  //     including the compensating delete. Runs BEFORE the replace cleanup
  //     below: if the link insert fails we remove the just-inserted doc +
  //     storage and return, so the replaceDocumentId target (if any) is left
  //     intact rather than deleted-then-orphaned.
  if (eventLink) {
    const { error: linkError } = await supabase
      .from('event_documents')
      .insert({
        document_id: insertedDoc.id,
        event_type: eventLink.event_type,
        event_id: eventLink.event_id,
        event_phase: eventLink.event_phase,
        company_id: companyId,
      });
    if (linkError) {
      console.error('[uploadDocument] event_documents link insert failed; rolling back doc:', linkError);
      await supabase.from('documents').delete().eq('id', insertedDoc.id);
      await supabase.storage.from('documents').remove([storagePath]);
      return { ok: false, error: linkError.message };
    }
  }

  // 4c. Requirement links (A2a) — the coverage the user DECLARED. Same placement
  //     rule and same compensation shape as 4b above, for the same reason: a link
  //     failure must roll back the NEW doc and leave the replace target intact.
  //     ONE insert of N rows — Postgres makes it atomic, so there is no half-linked
  //     document to reconcile. The two nude awaits in 4b are left as they are; THIS
  //     block reads its own cleanup errors, because an orphan is worth a log line.
  if (requirementLinks && requirementLinks.length > 0) {
    const { error: reqLinkError } = await supabase
      .from('requirement_documents')
      .insert(
        requirementLinks.map((link) => ({
          document_id: insertedDoc.id,
          company_id: companyId,
          requirement_key: link.requirement_key,
          requirement_year: link.requirement_year,
          // NEVER the column DEFAULT: an omission passes tsc AND the insert,
          // producing a plausible value nobody would look at twice.
          origin: 'declared',
        })),
      );
    if (reqLinkError) {
      console.error(
        '[uploadDocument] requirement_documents insert failed; rolling back doc:',
        reqLinkError,
      );
      const { error: rollbackDocErr } = await supabase
        .from('documents')
        .delete()
        .eq('id', insertedDoc.id);
      if (rollbackDocErr) {
        console.error(
          '[uploadDocument] rollback FAILED — orphan documents row left behind:',
          insertedDoc.id,
          rollbackDocErr,
        );
      }
      const { error: rollbackStorageErr } = await supabase.storage
        .from('documents')
        .remove([storagePath]);
      if (rollbackStorageErr) {
        console.error(
          '[uploadDocument] rollback FAILED — orphan storage object left behind:',
          storagePath,
          rollbackStorageErr,
        );
      }
      return { ok: false, error: reqLinkError.message };
    }
  }

  // 5. Replace retire (Part 4, #135) — runs only on insert success. The new
  //    doc is committed above; flip the replaced row to 'superseded' + stamp
  //    superseded_at so the Part-3 cron purge reclaims it (row + storage
  //    object) after the 10-day buffer. We deliberately do NOT delete the
  //    storage object here — the superseded row still references its file_url
  //    until the buffer elapses. Non-fatal: a failure leaves the old row
  //    active (a lingering duplicate), never blocks the user's new doc. This
  //    is a user-confirmed replace, so it intentionally supersedes finals too
  //    (no is_finalized guard — that guard belongs to auto-supersede only).
  //    ⚠️ CE BLOC DOIT RESTER APRÈS L'INSERT. Il l'est (insert :168, ici :~290),
  //    et trois sorties anticipées l'en séparent (:199, :222, :272). Le déplacer
  //    avant l'insert, en croyant ranger, transformerait un remplacement raté en
  //    PERTE SÈCHE : l'ancien au rancart et aucun nouveau. C'est l'ordre inverse
  //    de generatePdfDocument, qui évince AVANT d'insérer — et c'est pour ça que
  //    lui doit garder (status/is_finalized/signature_status) là où nous pouvons
  //    écraser un final signé : ici le neuf existe déjà quand l'ancien part.
  if (replaceDocumentId) {
    // ⚠️ `.eq('company_id')` — LA GARDE DE LOCATAIRE, ET ELLE EST INDISPENSABLE ICI.
    // Ce client est SERVICE-ROLE (route:224), donc la politique `documents_update_own`
    // ne s'applique PAS. Et `replaceDocumentId` vient du CLIENT : sans cette clause,
    // un identifiant forgé mettait au rancart le document d'une autre société.
    // Les deux autres sites de mise au rancart ont déjà cette garde — celui-ci
    // était le seul dont l'id n'est pas calculé côté serveur, et le seul sans garde.
    // ⚠️ On n'ajoute PAS status/is_finalized/signature_status : ce remplacement est
    // CONFIRMÉ par l'utilisateur et doit pouvoir écraser un final signé.
    const { data: flipped, error: supersedeErr } = await supabase
      .from('documents')
      .update({ status: 'superseded', superseded_at: new Date().toISOString() })
      .eq('id', replaceDocumentId)
      .eq('company_id', companyId)
      // `.select()` fait passer PostgREST en `Prefer: return=representation` : on
      // apprend QUELLES lignes ont bougé, pas seulement s'il y a eu une erreur.
      // ⚠️ Valide parce que ce client est service-role. Sur un client de SESSION,
      // la politique SELECT re-filtrerait ce retour et pourrait masquer une ligne
      // pourtant modifiée — le compte ci-dessous mentirait alors dans ce sens.
      .select('id');
    if (supersedeErr) {
      console.error(
        '[uploadDocument] Replace supersede failed (old doc left active):',
        replaceDocumentId,
        supersedeErr,
      );
    } else if ((flipped ?? []).length !== 1) {
      // Pas une erreur SQL : un REFUS SILENCIEUX. La garde a filtré l'identifiant,
      // donc il ne désigne aucun document de cette société. Sans cette branche, on
      // aurait troqué un trou silencieux contre un refus silencieux.
      console.error(
        '[uploadDocument] Replace supersede matched no row — id étranger à la société ?',
        { replaceDocumentId, companyId, lignesModifiees: (flipped ?? []).length },
      );
    }
  }

  // 6. Activity log (non-fatal if it fails).
  try {
    const trimmedTitle = title.trim();
    const fySuffixFr = docYear !== null ? ` — Exercice ${docYear}` : '';
    const fySuffixEn = docYear !== null ? ` — Fiscal Year ${docYear}` : '';
    await logActivity(
      supabase,
      companyId,
      userId,
      'document_uploaded',
      `Document téléversé : ${trimmedTitle}${fySuffixFr}`,
      `Document uploaded: ${trimmedTitle}${fySuffixEn}`,
      { document_id: insertedDoc.id, document_type: docType }
    );
  } catch (logErr) {
    console.warn('[uploadDocument] Activity log failed (non-fatal):', logErr);
  }

  return { ok: true, documentId: insertedDoc.id };
}
