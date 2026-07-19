'use client';

/**
 * Inventory line (Dom's "line 2") — the middle layer between the status verdict
 * and the A3 board / above the Complétude sections. Presentational: renders the
 * 5 inventory counts (Total · Final · À signer · À générer · Classé aux archives)
 * with their Aria icons. Extracted verbatim from CompletenessPage's inline block
 * so Complétude + the dashboard render IDENTICALLY (one component, both pages).
 * Values come from props; labels + icons + order are owned here.
 */

import { useTranslations } from 'next-intl';
import { Archive, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  total: number;
  uploaded: number;
  generated: number;
  missing: number;
  archived: number;
}

export default function InventoryLine({ total, uploaded, generated, missing, archived }: Props) {
  const tMB = useTranslations('minuteBook');
  return (
    <div className="flex items-center gap-3 text-xs text-[var(--text-body)] mt-3 flex-wrap">
      {/* icons UNTOUCHED (Aria); counts + labels only. 3 active states
          (Final + To-sign + To-generate) sum to Total; Archived separate. */}
      <span className="font-semibold text-[var(--text-body)]">
        {tMB('completeness.total')}: {total}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
        {uploaded} {tMB('completeness.legendSignedUploaded')}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
        </svg>
        {generated} {tMB('completeness.legendToSign')}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1.5">
        <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
        {missing} {tMB('completeness.legendToGenerate')}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1.5">
        <Archive className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--row-state-archive)' }} aria-hidden="true" />
        {archived} {tMB('completeness.legendArchive')}
      </span>
    </div>
  );
}
