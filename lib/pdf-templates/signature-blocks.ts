import { escapeHtml } from './base-layout';

/**
 * Atom 3 Slice 4 — grouped entity signature blocks (spec §4.2.1).
 *
 * Discriminated union replacing the legacy flat `Signatory`. The whole
 * generation chain (signatories route → modal → button → generate-item →
 * generatePdfDocument → here) carries `SignatoryBlock[]` end-to-end — no
 * parallel flat type survives.
 *
 *   individual → one name line (role under name), current behavior preserved.
 *   entity     → entity legal name header + one « Par :/Per: » line per signer,
 *                ordered by display_order. `signers: []` renders the D3
 *                zero-signatory hand-fill line.
 *
 * `roleLabel` arrives already localized + verbatim-for-custom from the route
 * (lib/i18n/lifecycle-labels SIGNATORY_ROLE_LABELS); this renderer only owns
 * the Par:/Per: chrome + section label, keyed off the document `language`.
 */
export interface IndividualSignatoryBlock {
  type: 'individual';
  id: string;
  name: string;
  role: string;
}

export interface EntitySigner {
  id: string;
  name: string;
  roleLabel: string;
}

export interface EntitySignatoryBlock {
  type: 'entity';
  entityId: string;
  legalName: string;
  entityType: 'corporation' | 'trust';
  /** Ordered by display_order. Empty = zero-signatory entity (D3 blank line). */
  signers: EntitySigner[];
}

export type SignatoryBlock = IndividualSignatoryBlock | EntitySignatoryBlock;

export function signatureBlocksHTML(
  signatories: SignatoryBlock[],
  language: 'fr' | 'en' | 'bilingual'
): string {
  if (signatories.length === 0) return '';

  const dateLabel = 'Date';
  // §5: Par: (FR) / Per: (EN). 'bilingual' never reaches generation per §9.1
  // (per-locale render); fall back to FR chrome to keep the two callers safe.
  const perLabel = language === 'en' ? 'Per' : 'Par';

  function renderIndividual(s: IndividualSignatoryBlock): string {
    return `
      <div class="sig-entry">
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(s.name)}</div>
        <div class="sig-title">${escapeHtml(s.role)}</div>
        <div class="sig-date">${dateLabel}: _______________</div>
      </div>`;
  }

  // Entity blocks intentionally omit the per-block Date line: spec §4.2.1
  // trust/corporate shapes show only the legal-name header + Par: lines.
  function renderEntity(s: EntitySignatoryBlock): string {
    const header = `<div class="sig-entity-name">${escapeHtml(s.legalName)}</div>`;
    const parLines =
      s.signers.length > 0
        ? s.signers
            .map(
              (sg) => `
        <div class="sig-par">
          <div class="sig-par-line"><span class="sig-par-label">${perLabel} :</span><span class="sig-line-inline"></span></div>
          <div class="sig-par-name">${escapeHtml(sg.name)}, ${escapeHtml(sg.roleLabel)}</div>
        </div>`
            )
            .join('')
        : // D3 — zero-signatory entity: one blank hand-fill line.
          `
        <div class="sig-par">
          <div class="sig-par-line">${perLabel} : ________________, ________________</div>
        </div>`;
    return `
      <div class="sig-entry sig-entry-entity">
        ${header}${parLines}
      </div>`;
  }

  function renderEntry(s: SignatoryBlock): string {
    return s.type === 'entity' ? renderEntity(s) : renderIndividual(s);
  }

  const mid = Math.ceil(signatories.length / 2);
  const leftCol = signatories.slice(0, mid);
  const rightCol = signatories.slice(mid);

  const sectionLabel =
    language === 'en' ? 'Authorized Signatures' : 'Signatures autorisées';

  return `
    <div class="signatures-keep"><div class="signatures">
      <div class="sig-col">
        <div class="sig-label">${sectionLabel}</div>
        ${leftCol.map(renderEntry).join('')}
      </div>
      ${rightCol.length > 0 ? `
      <div class="sig-col">
        <div class="sig-label">&nbsp;</div>
        ${rightCol.map(renderEntry).join('')}
      </div>` : ''}
    </div></div>`;
}
