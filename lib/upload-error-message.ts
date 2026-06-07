/**
 * Tier 3 #151 — single source of truth for upload-error copy.
 *
 * Maps an upload failure (the `error` code returned by /api/documents/upload
 * and/or the HTTP status) to a key in the `documents` i18n namespace. The
 * caller resolves the key through its own next-intl translator scoped to
 * `documents` (e.g. `t(uploadErrorMessageKey(result.error, res.status))`),
 * so this helper stays PURE — no hooks, no locale, no formatting.
 *
 * Returns a BARE key (e.g. 'onlyPdf'), not a namespaced path, because every
 * upload surface already resolves under the `documents` namespace.
 *
 * Mapping (see route.ts error vocabulary):
 *   - 'NON_PDF_REJECTED'          → 'onlyPdf'        (400 — magic-byte gate)
 *   - 'FILE_TOO_LARGE'            → 'tooLarge'       (400 — > 20 MB)
 *   - status 403 / 'Forbidden'    → 'forbidden'      (cross-tenant / ownership)
 *   - status 401 / 'Unauthorized' → 'sessionExpired' (no/expired session)
 *   - anything else (incl. raw    → 'uploadFailed'   (generic fallback)
 *     Supabase storage/db messages, 500s, missing params)
 */
export function uploadErrorMessageKey(errorCode?: string, status?: number): string {
  if (errorCode === 'NON_PDF_REJECTED') return 'onlyPdf';
  if (errorCode === 'FILE_TOO_LARGE') return 'tooLarge';
  if (status === 403 || errorCode === 'Forbidden') return 'forbidden';
  if (status === 401 || errorCode === 'Unauthorized') return 'sessionExpired';
  return 'uploadFailed';
}
