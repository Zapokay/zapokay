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
import { Archive, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface Props {
  total: number;
  uploaded: number;
  generated: number;
  /**
   * Documents that are missing AND actionable now. NO LONGER "every missing row" —
   * the ones whose window has not opened moved to `upcoming` below.
   */
  missing: number;
  /**
   * Missing, but the obligation's window has not opened: an annual resolution on a
   * fiscal year that is still running, a REQ update before its closure, a federal
   * return before its anniversary. Computed once in the completeness engine and passed
   * in — this component still calculates nothing.
   */
  upcoming: number;
  archived: number;
}

export default function InventoryLine({ total, uploaded, generated, missing, upcoming, archived }: Props) {
  const tMB = useTranslations('minuteBook');
  return (
    <div className="flex items-center gap-3 text-xs text-[var(--text-body)] mt-3 flex-wrap">
      {/* icons UNTOUCHED (Aria); counts + labels only.
          ── THIS NOTE USED TO READ: "3 active states (Final + To-sign + To-generate)
             sum to Total; Archived separate." ──
          FALSE SINCE 2026-08-16: there are FOUR. "À venir" was carved out of
          To-generate, because a red cross on a document that cannot legitimately exist
          yet told a company in perfect order that it had thirteen failings on its first
          day. The sum still closes and Archived is still separate:
             Final + To-sign + To-generate + Upcoming === Total
          Kept rather than rewritten: the count in a comment is exactly the kind of fact
          that goes stale silently, and seeing which number it used to be is the warning.

          ⚠️ Clock is the ONE new icon and `--text-muted` the ONE colour choice —
          deliberately a token, never a literal, so Aria's revision is a single line
          here and nothing else in the lot. */}
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
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        {upcoming} {tMB('completeness.legendUpcoming')}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1.5">
        <Archive className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--row-state-archive)' }} aria-hidden="true" />
        {archived} {tMB('completeness.legendArchive')}
      </span>
    </div>
  );
}
