'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, XCircle, Upload } from 'lucide-react';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import DescriptionTooltip from '@/components/ui/DescriptionTooltip';
import { getDocumentState } from '@/lib/minute-book/state';
import { mustBlockGeneration, mustBlockUpload } from '@/lib/fiscal-year-open';
import { formatDate } from '@/lib/utils';

interface RequirementRowProps {
  requirementKey: string;
  titleFr: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  /**
   * Phase B B5 — distinguishes signed-final uploads (green check, no badge)
   * from WIP uploads (amber half-circle + "Non signé" badge). Null/undefined
   * falls back to "treat as final" per the data-drift rule documented in
   * lib/minute-book/state.ts.
   */
  documentIsFinalized?: boolean | null;
  canUpload: boolean;
  canGenerate: boolean;
  year: number | null;
  /**
   * The END of the fiscal year `year` names, bare ISO `YYYY-MM-DD`, threaded
   * from CompletenessPage's `data.fiscalYears` through RequirementSection. ONE
   * date, already resolved for this row's year — the section does not search.
   *
   * Absent/null on foundational rows (`year === null`), which never need it:
   * mustBlockGeneration returns on its first branch before reading any date.
   */
  fiscalYearEndDate?: string | null;
  /**
   * The window axis, stamped by the completeness engine and read off the row's own
   * ChecklistItem — NOT a section-level prop. Unlike `fiscalYearEndDate`, which the
   * section resolves once per year, this varies per row (a section can hold both an
   * annual resolution and the federal return, on different clocks).
   *
   * Only 'upcoming' changes anything here: it swaps the red cross for a clock.
   */
  availability?: 'open' | 'upcoming';
  companyId?: string;
  /**
   * Locale forwarded from CompletenessPage → RequirementSection. Drives
   * GenerateDocumentButton's bilingual labels. The row's own UI strings
   * use useTranslations() and pick up locale from next-intl context.
   */
  locale: 'fr' | 'en';
  /**
   * #75 — the document's GENERATION language (Two-Layer model: the doc's stored
   * language if it exists, else the user's preferred_language). DISTINCT from
   * `locale` (UI chrome). Threaded into GenerateDocumentButton.documentLanguage
   * so generated/regenerated resolutions render in the correct language.
   */
  documentLanguage: 'fr' | 'en';
  onFileSelected?: (file: File, requirementKey: string, year: number | null) => Promise<void>;
  onGenerated?: () => void;
}

export default function RequirementRow({
  requirementKey,
  titleFr,
  descriptionFr,
  descriptionEn,
  satisfied,
  source,
  documentIsFinalized,
  canUpload,
  canGenerate,
  year,
  fiscalYearEndDate,
  availability,
  companyId,
  locale,
  documentLanguage,
  onFileSelected,
  onGenerated,
}: RequirementRowProps) {
  const t = useTranslations('requirementRow');
  const tDocs = useTranslations('documents');
  // #149 — the requirement description is catalog CHROME (the seed provides both
  // description_fr AND description_en), so it follows the UI locale — unlike the
  // document title above, which follows the doc's generation language (Two-Layer).
  const description = locale === 'en' ? descriptionEn : descriptionFr;
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase B B5 — delegate three-state classification to lib/minute-book/state.ts
  // so this row stays in lockstep with CompletionBar / CompletenessPage / API
  // rather than re-deriving the rules inline. The booleans below are pure
  // adapters from the canonical state to the row's two visual concerns:
  // icon (3-way) and badge (binary "needs signature").
  const state = getDocumentState({ satisfied, source, is_finalized: documentIsFinalized, can_generate: canGenerate });
  const isSignedFinal = state === 'téléversé';
  const isUnsigned = state === 'généré'; // generated OR uploaded-WIP

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset the input value so the SAME file can be re-selected after an error
    // (browsers suppress onChange for identical filenames otherwise).
    e.target.value = '';
    if (!f || !onFileSelected) return;
    setIsUploading(true);
    try {
      await onFileSelected(f, requirementKey, year);
    } finally {
      setIsUploading(false);
    }
  }

  // Shared button class for the file-input triggers (Téléverser / Remplacer)
  // and the Generate/Regenerate button (passed via GenerateDocumentButton's
  // className override). Keeping a single string avoids drift between the
  // empty-state, generated, and uploaded button surfaces.
  const buttonClass =
    'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
  // ── THE DISABLED-HOVER NEUTRALIZERS, ON THE GATED BUTTONS. ──
  //
  // ⚠️ THIS COMMENT USED TO READ "ON THE GENERATE BUTTON ALONE", and said that
  // buttonClass was shared with Téléverser and Remplacer "which this gate never
  // disables — uploading a real document is never a false entry". THAT RULE WAS
  // REVERSED ON 2026-08-15, deliberately: on an OPEN fiscal year we know no
  // legitimate annual resolution can exist (art. 155(1)a) CBCA anchors financial
  // statements on CLOSED periods), so accepting the upload lets the user file a
  // false entry in their own book. Upload is now gated too — see mustBlockUpload.
  //
  // ⚠️ IT STILL DOES NOT BELONG ON `buttonClass`. That string stays the plain
  // shared base; this is the derived variant the gate's buttons wear. Keeping the
  // two separate is what lets a future reader disable a button WITHOUT inheriting
  // this gate's styling decisions. Same call, same reason, as genCls vs setBase on
  // the board (A3Item).
  //
  // ⚠️ WHY THEY ARE NEEDED AT ALL — found by eye on 2026-08-15, not by a gate:
  // `disabled:opacity-60` dims the button but `hover:text-[var(--text-heading)]`
  // still fires on a disabled button, so word and icon LIGHTEN under the pointer.
  // A control that answers the mouse says "click me"; an inert one that says it is
  // the interface lie this whole lot exists to remove. No automated check can see
  // this: tsc does not read CSS and hover does not exist in a build.
  //
  // The hover target is `--text-body` — buttonClass's REST colour. A disabled
  // hover must return the resting state, never introduce a third colour. The
  // Sparkles icon inherits currentColor, so the text rule carries it too.
  //
  // Specificity, computed not assumed:
  //   `.hover\:text-[…]:hover`                     → (0,2,0)
  //   `.disabled\:hover\:text-[…]:disabled:hover`  → (0,3,0)  ← wins
  // The extra pseudo-class decides it; source order is not involved, and no
  // `!important` is needed.
  const gatedButtonClass = `${buttonClass} disabled:hover:bg-transparent disabled:hover:text-[var(--text-body)]`;

  // ── THE FISCAL-YEAR GATE — computed ONCE, read by both generate surfaces. ──
  //
  // An annual resolution APPROVES financial statements. Generated while the
  // fiscal year is still open, it approves statements that do not exist yet —
  // art. 493 al. 2 LSAQ, a false entry in a company book. `canGenerate` above is
  // a static property of the document TYPE and has never known which YEAR it was
  // asked about; mustBlockGeneration is that missing half. Foundational rows
  // (year === null) are never blocked: they record facts that already happened.
  //
  // ⚠️ The button stays RENDERED and goes inert — never hidden. A vanished
  // button reads as a broken product; a greyed one with its reason beside it
  // reads as an answer. `buttonClass` already carries disabled:opacity-60.
  const generationBlocked = mustBlockGeneration(year, fiscalYearEndDate);
  // Upload joins the gate (2026-08-15). `eventLink` is left undefined ON PURPOSE
  // and it is not an omission: this component only ever renders catalog
  // requirement rows — `requirementKey` is typed non-nullable above, and lifecycle
  // acts have their own component (EventActRow). The act exclusion cannot fire
  // here, and saying so with `undefined` is more honest than threading a value
  // that is always absent.
  const uploadBlocked = mustBlockUpload(requirementKey, year, fiscalYearEndDate);
  // The reason is a FACT, never an instruction: it states when the document
  // becomes available, and asks the user for nothing. Plain sibling <span>,
  // visible without hover — the row's own idiom for "no action here yet"
  // (see t('notAvailable') below).
  //
  // ⚠️ KEYED ON `uploadBlocked`, NOT ON `generationBlocked`, AND ONE NOTE PER ROW.
  // The two agree on every row that renders a generate button (a generate button
  // needs can_generate, which the anniversary-clocked federal return does not
  // have). They differ on exactly one row — that federal return — where upload
  // stays LIVE and generationBlocked is meaningless because no generate button is
  // rendered. Keying the note on generation would print "available after
  // 31 December" beside a perfectly clickable Téléverser.
  //
  // Rendered ONCE per state branch, after the buttons, never inside a button's
  // own fragment: a row showing both Téléverser and Régénérer would otherwise
  // carry the same sentence twice.
  const blockedNote =
    uploadBlocked && fiscalYearEndDate ? (
      <span className="text-xs text-[var(--text-muted)]">
        {t('generateUnavailableUntil', { date: formatDate(fiscalYearEndDate, locale) })}
      </span>
    ) : null;

  return (
    <div className="group flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--card-bg)] transition-colors">
      {/* Left side: icon + title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* ── THE FOURTH STATE, AND WHY IT HAD TO EXIST. ──
            Until 2026-08-16 this ternary opened on `!satisfied` alone, so "the document
            does not exist" and "the document is late" were THE SAME PIXEL. A company in
            perfect order on its first day — Fixture Cap, incorporated 2026-03-02, zero
            overdue rows measured — was shown thirteen red crosses.
            A row whose window has not opened is not a failing: it is a date. Clock,
            muted, same icon and same token as InventoryLine's "À venir" case, so Aria
            revises two lines in this whole lot and nothing else.
            ⚠️ The red branch below is UNCHANGED and must stay so: a missing document on
            an OPEN window is exactly what it always was. */}
        {!satisfied && availability === 'upcoming' ? (
          <Clock className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        ) : !satisfied ? (
          <XCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
        ) : isSignedFinal ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 flex-shrink-0 text-amber-500"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
          </svg>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-sm ${
              satisfied ? 'text-[var(--text-muted)]' : 'text-[var(--text-body)] font-medium'
            }`}
          >
            {titleFr}
          </span>
          <DescriptionTooltip description={description} />
        </div>
      </div>

      {/*
        Right side — Phase B B5 reachability fix.

        Badge: surfaces "Non signé" / "Unsigned" on rows where the document
        exists but isn't a signed final (generated rows AND uploaded-WIP
        rows). Signed finals show no badge — the green check icon carries
        the signal.

        Action buttons (per option 3):
          - Empty (!satisfied)            → Téléverser, Générer, or notAvailable
          - Generated (uploaded=false)    → Téléverser + Régénérer
          - Uploaded (any finalized)      → Remplacer  (B4 destructive flow)

        The Remplacer button intentionally drops the `canUpload` gate: a row
        whose `source` is 'uploaded' is by definition replaceable, and
        gating would re-introduce the reachability bug this batch fixes
        on requirements where canUpload toggled false after upload.
      */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {isUnsigned && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)]">
            {tDocs('toSignBadge')}
          </span>
        )}

        {/* Empty state */}
        {!satisfied && (
          <>
            {canUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || uploadBlocked}
                className={gatedButtonClass}
              >
                <Upload className="h-3.5 w-3.5" />
                {isUploading ? t('uploadingButton') : t('uploadButton')}
              </button>
            )}
            {canGenerate && companyId && (
              <GenerateDocumentButton
                companyId={companyId}
                requirementKey={requirementKey}
                year={year}
                onSuccess={onGenerated}
                locale={locale}
                documentLanguage={documentLanguage}
                className={gatedButtonClass}
                disabled={generationBlocked}
              />
            )}
            {blockedNote}
            {!canUpload && !canGenerate && (
              <span className="text-xs text-[var(--text-muted)]">
                {t('notAvailable')}
              </span>
            )}
          </>
        )}

        {/* Generated — Téléverser (signed) + Régénérer (replace template) */}
        {satisfied && source === 'generated' && (
          <>
            {canUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || uploadBlocked}
                className={gatedButtonClass}
              >
                <Upload className="h-3.5 w-3.5" />
                {isUploading ? t('uploadingButton') : t('uploadButton')}
              </button>
            )}
            {canGenerate && companyId && (
              <GenerateDocumentButton
                companyId={companyId}
                requirementKey={requirementKey}
                year={year}
                onSuccess={onGenerated}
                locale={locale}
                documentLanguage={documentLanguage}
                label={t('regenerate')}
                className={gatedButtonClass}
                disabled={generationBlocked}
              />
            )}
            {blockedNote}
          </>
        )}

        {/* Uploaded (any finalized state) — single Remplacer button */}
        {satisfied && source === 'uploaded' && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || uploadBlocked}
              className={gatedButtonClass}
            >
              <Upload className="h-3.5 w-3.5" />
              {isUploading ? t('uploadingButton') : t('replace')}
            </button>
            {blockedNote}
          </>
        )}

        {/* Single hidden file input shared across all surfaces — only one
            button is visible at a time per row state, so a single ref is
            sufficient and avoids ref-index gymnastics. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

    </div>
  );
}
