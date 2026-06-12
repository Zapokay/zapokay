/**
 * #6 (I18N-API-ERRORS-1) — single source of truth for generate-item error copy.
 *
 * Mirrors lib/upload-error-message.ts (the #4 pattern). Maps a structured error
 * CODE returned by /api/minute-book/generate-item (and/or the HTTP status) to a
 * key in the `generate` i18n namespace. The caller resolves the key through its
 * own next-intl translator scoped to `generate`
 * (e.g. `t(generateErrorMessageKey(data.error, res.status))`), so this helper
 * stays PURE — no hooks, no locale, no formatting.
 *
 * Returns a BARE key (e.g. 'cannotGenerate'), not a namespaced path.
 *
 * The route returns STRUCTURED CODES only (never inline FR/EN):
 *   - 'MISSING_PARAMS'        → 'missingParams'    (400 — companyId/requirementKey absent)
 *   - 'UNAUTHORIZED'          → 'sessionExpired'   (401 — no/expired session)
 *   - 'SERVER_MISCONFIGURED'  → 'serverError'      (500 — Supabase env missing)
 *   - 'CANNOT_GENERATE'       → 'cannotGenerate'   (400 — not auto-generatable)
 *   - 'COMPANY_NOT_FOUND'     → 'companyNotFound'  (404 — company lookup failed)
 *   - 'GENERATION_FAILED'     → 'generationFailed' (500 — upload/DB write failed)
 *   - 'INTERNAL_ERROR' / any  → 'generationFailed' (500 — uncaught + fallback)
 */
export function generateErrorMessageKey(errorCode?: string, status?: number): string {
  if (errorCode === 'MISSING_PARAMS') return 'missingParams';
  if (errorCode === 'SERVER_MISCONFIGURED') return 'serverError';
  if (errorCode === 'CANNOT_GENERATE') return 'cannotGenerate';
  if (errorCode === 'COMPANY_NOT_FOUND') return 'companyNotFound';
  if (status === 401 || errorCode === 'UNAUTHORIZED') return 'sessionExpired';
  return 'generationFailed';
}
