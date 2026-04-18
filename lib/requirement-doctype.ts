/**
 * Map a `minute_book_requirements.requirement_key` (plus its section as a fallback
 * signal) to the vault-side `document_type` used in the `documents` table.
 *
 * Why this exists:
 *   The `minute_book_requirements` table does not carry a `document_type` column,
 *   but the vault form + upload pipeline need one. Sprint 9H Phase 4b.1 extracts
 *   this classifier so the completeness API and the shared upload helper both
 *   use a single source of truth.
 *
 * Mapping rules (substring match on requirement_key, in priority order):
 *   - contains `statuts`                                → 'statuts'
 *   - contains `reglement_interieur`                    → 'autre'   (no good vault-type fit)
 *   - contains `declaration_initiale`                   → 'rapport'
 *   - contains `souscription` or `share_subscription`   → 'autre'   (standalone signed form)
 *   - contains `acceptation_mandat` or
 *              `director_acceptance`                    → 'autre'   (consent form)
 *   - contains `auditor_waiver`                         → 'autre'   (consent form)
 *   - contains `shareholder_resolution` or
 *              `resolution_actionnaires`                → 'pv'      (shareholder PVs)
 *   - contains `board_resolution` or `resolution_ca`    → 'resolution'
 *
 * Fallback (when no substring rule matches), keyed on `section`:
 *   - 'statuts'     → 'statuts'
 *   - 'resolutions' → 'resolution'   (lossy: cannot distinguish board vs shareholder from section alone)
 *   - 'registres'   → 'registre'
 *   - 'avis'        → 'rapport'
 *   - anything else → 'autre'
 */

export type VaultDocType =
  | 'statuts'
  | 'resolution'
  | 'pv'
  | 'registre'
  | 'rapport'
  | 'autre';

export function requirementToDocType(
  requirementKey: string,
  section: string | null | undefined
): VaultDocType {
  const k = requirementKey.toLowerCase();

  // Priority-ordered substring rules — more specific first.
  if (k.includes('statuts')) return 'statuts';
  if (k.includes('reglement_interieur')) return 'autre';
  if (k.includes('declaration_initiale')) return 'rapport';
  if (k.includes('souscription') || k.includes('share_subscription')) return 'autre';
  if (k.includes('acceptation_mandat') || k.includes('director_acceptance')) return 'autre';
  if (k.includes('auditor_waiver')) return 'autre';
  if (k.includes('shareholder_resolution') || k.includes('resolution_actionnaires')) return 'pv';
  if (k.includes('board_resolution') || k.includes('resolution_ca')) return 'resolution';

  // Fallback on section.
  switch (section) {
    case 'statuts':
      return 'statuts';
    case 'resolutions':
      return 'resolution';
    case 'registres':
      return 'registre';
    case 'avis':
      return 'rapport';
    default:
      return 'autre';
  }
}
