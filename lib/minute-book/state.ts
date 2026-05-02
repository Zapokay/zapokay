/**
 * Three-state model for minute-book checklist items.
 *
 * State derivation:
 *   - source='uploaded'  AND satisfied=true → 'téléversé'
 *   - source='generated' AND satisfied=true → 'généré'
 *   - satisfied=false                       → 'missing'
 *
 * Edge case (data-drift resilience): if satisfied=true but source is null —
 * possible on older rows where `documents.source` was never set — default to
 * 'téléversé'. This is the most permissive interpretation: assume the user's
 * record is complete unless explicitly tagged 'generated'. The inverse
 * default would silently demote legitimately uploaded docs to amber (généré)
 * whenever `source` is missing.
 *
 * TODO: backfill `documents.source` for rows where it's null, then this
 * fallback can be tightened (or removed). Tracked under pre-launch
 * test-data cleanup.
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
}

/**
 * Derive the three-state classification for a checklist item.
 * See module docstring for the full mapping (including the source=null
 * data-drift fallback).
 */
export function getDocumentState(item: StateInput): DocumentState {
  if (!item.satisfied) return 'missing';
  if (item.source === 'generated') return 'généré';
  // source === 'uploaded' OR source is null/undefined (drift fallback)
  return 'téléversé';
}
