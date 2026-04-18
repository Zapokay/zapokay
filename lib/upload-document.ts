/**
 * Shared document upload pipeline — used by:
 *   - components/documents/UploadZone.tsx       (Coffre-fort / vault form)
 *   - components/minute-book/* silent upload    (Sprint 9H Phase 4b.4 — TODO)
 *
 * Responsibilities:
 *   1. ASCII-safe storage key (via toStorageSafeName)
 *   2. Upload the file to the `documents` bucket
 *   3. Derive minute_book_section (via existing getMinuteBookSection logic)
 *   4. Insert the document row
 *   5. On DB failure, roll back the storage object
 *   6. Log 'document_uploaded' activity on success
 *
 * This helper deliberately takes a `SupabaseClient` so it stays runtime-agnostic
 * (works with both browser and server clients).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import { toStorageSafeName } from '@/lib/storage-key';
import { logActivity } from '@/lib/activity-log';

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
}

export type UploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

/**
 * Derive minute_book_section either from the explicit requirement (preferred)
 * or fall back to the vault docType. Pre-existing logic from UploadZone.tsx.
 */
function resolveMinuteBookSection(
  requirementKey: string | null,
  docType: string,
  requirements: ChecklistItem[]
): string | null {
  if (requirementKey) {
    const req = requirements.find(r => r.requirement_key === requirementKey);
    if (req?.section) return req.section;
  }
  const fallback: Record<string, string> = {
    statuts: 'statuts',
    resolution: 'resolutions',
    pv: 'resolutions',
    registre: 'registres',
    rapport: 'avis',
    autre: 'statuts',
  };
  return fallback[docType] ?? null;
}

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
  } = params;

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

  // 3. Resolve minute_book_section.
  const minuteBookSection = resolveMinuteBookSection(requirementKey, docType, requirements);

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
      ...(requirementKey ? { requirement_key: requirementKey } : {}),
      ...(requirementYear !== null ? { requirement_year: requirementYear } : {}),
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

  // 5. Activity log (non-fatal if it fails).
  try {
    await logActivity(
      supabase,
      companyId,
      userId,
      'document_uploaded',
      `Document téléversé : ${title.trim()}`,
      `Document uploaded: ${title.trim()}`,
      { document_id: insertedDoc.id, document_type: docType }
    );
  } catch (logErr) {
    console.warn('[uploadDocument] Activity log failed (non-fatal):', logErr);
  }

  return { ok: true, documentId: insertedDoc.id };
}
