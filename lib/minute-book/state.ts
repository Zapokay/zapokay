/**
 * Three-state model for minute-book checklist items.
 *
 * State derivation:
 *   - source='uploaded'  AND satisfied=true AND is_finalized=true   → 'téléversé'
 *   - source='uploaded'  AND satisfied=true AND is_finalized=false  → 'généré'   (Phase B B5: WIP upload)
 *   - source='generated' AND satisfied=true                         → 'généré'
 *   - satisfied=false                                               → 'missing'
 *
 * Phase B B5 unified the "needs signature" semantic. An uploaded WIP
 * (is_finalized=false) is treated as in-progress and re-buckets to 'généré'
 * — same weight (0.5) and same amber visual as a generated draft. The user-
 * facing label flips to "Non signé" / "Unsigned" via the row badge; the
 * underlying state model stays three-bucket so STATE_WEIGHT and CompletionBar
 * coloring continue to work without further branching.
 *
 * Edge cases (data-drift resilience):
 *   - source=null + satisfied=true: defaults to 'téléversé'. Most permissive
 *     interpretation: assume the user's record is complete unless explicitly
 *     tagged 'generated'. The inverse would silently demote legitimately
 *     uploaded docs to amber whenever `source` is missing.
 *   - is_finalized=null/undefined + source='uploaded': also defaults to
 *     'téléversé'. Pre-Phase-B rows have no is_finalized column value
 *     (migration sets default false on new inserts only — but historic rows
 *     written before B1 retain whatever the column default produced at
 *     migration time, which is FALSE per the migration). New code reading
 *     these rows should pass the actual is_finalized value through; the
 *     null/undefined fallback exists only for code paths that haven't been
 *     updated to thread the field yet.
 *
 * TODO: backfill `documents.source` for rows where it's null, then the
 * source-null fallback can be tightened (or removed). Tracked under
 * pre-launch test-data cleanup.
 */
export type DocumentState = 'téléversé' | 'généré' | 'missing';

/**
 * Weights for the page-level completeness percentage:
 *   téléversé = 1.0  (signed and uploaded back — truly done)
 *   généré    = 0.5  (generated, awaiting signature)
 *   missing   = 0.0
 *
 * Section-level "X/Y" displays still use simple counts (X = téléversé+généré,
 * Y = total). Only the page-level percentage is weighted.
 */
export const STATE_WEIGHT: Readonly<Record<DocumentState, number>> = {
  'téléversé': 1.0,
  'généré': 0.5,
  'missing': 0.0,
};

interface StateInput {
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  /**
   * Phase B B5 — when source='uploaded' and is_finalized is explicitly false,
   * the row re-buckets to 'généré' (WIP upload, awaiting certification).
   * Null/undefined falls back to the most permissive interpretation
   * ('téléversé') for callers that don't yet thread the field.
   */
  is_finalized?: boolean | null;
  can_generate?: boolean | null;
}

/**
 * Derive the three-state classification for a checklist item.
 * See module docstring for the full mapping (including data-drift fallbacks).
 */
export function getDocumentState(item: StateInput): DocumentState {
  if (!item.satisfied) return 'missing';
  if (item.source === 'generated') return 'généré';
  // source === 'uploaded' (or null/undefined drift fallback): split on is_finalized.
  // Explicit false → WIP upload, treated as 'généré'. Anything else (true,
  // null, undefined) → 'téléversé'.
  // Upload-only docs (can_generate === false) are complete on upload — nothing to sign
  // (REQ annual update = online transmission + accusé). is_finalized irrelevant for upload-only.
  if (item.source === 'uploaded' && item.is_finalized === false && item.can_generate === false) return 'téléversé';
  if (item.source === 'uploaded' && item.is_finalized === false) return 'généré';
  return 'téléversé';
}

/**
 * Adapter for ChecklistItem-shaped inputs from /api/minute-book/completeness.
 * The API contract exposes is_finalized as `document_is_finalized` (sibling of
 * `document_id`, `document_file_url`) while getDocumentState reads
 * `is_finalized`. This helper does the field-name remap so consumers don't
 * have to remember the asymmetry.
 *
 * Phase B B5-fix — added after visual gate caught CompletionBar and
 * RequirementSection consuming ChecklistItem without the inline adapter,
 * surfacing WIP rows as 'téléversé' via the helper's drift fallback.
 *
 * Structurally typed (not importing ChecklistItem) to keep state.ts free of
 * route-layer dependencies — any caller passing a `{ satisfied, source,
 * document_is_finalized }` shape benefits, not just the API consumers.
 */
export function getStateForChecklistItem(item: {
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  document_is_finalized?: boolean | null;
  can_generate?: boolean | null;
}): DocumentState {
  return getDocumentState({
    satisfied: item.satisfied,
    source: item.source,
    is_finalized: item.document_is_finalized,
    can_generate: item.can_generate,
  });
}
