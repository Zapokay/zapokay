'use client';

/**
 * A3 board — one row. Hero (rank 1) + normal variants. Presentational only:
 * consumes a RankedObligation + the pure lookups in a3-presentation.ts. Two
 * INDEPENDENT axes (status vs. liveness; verb visual vs. verb label) and the
 * remediate row treatment, per docs/design/zapokay_a3_board.html §2/§2B/§3/§11.
 */

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Upload, Sparkles, Landmark, HelpCircle } from 'lucide-react';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import { useRowUpload } from '@/components/documents/useRowUpload';
import { useEventGenerate } from '@/components/lifecycle/useEventGenerate';
import { fileObligation } from '@/components/lifecycle/fileObligation';
import { ObligationMarker } from '@/components/ui/ObligationMarker';
import { ObligationModal } from '@/components/ui/ObligationModal';
import { useObligationModalContent } from '@/components/ui/useObligationModalContent';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import DescriptionTooltip from '@/components/ui/DescriptionTooltip';
import type { RankedObligation } from '@/lib/obligations/rank';
import { formatDate } from '@/lib/utils';
import {
  STATUS_CHIP,
  TIER_BADGE,
  VERB_TREATMENT,
  VERB_LABEL,
  CONSULT,
  ICONS,
  resolveTitle,
} from './a3-presentation';

// tone → Tailwind cluster. FULL literal strings (Tailwind JIT needs them verbatim;
// dynamic `var(--st-${tone})` would not be scanned).
const STATUS_TONE_CLASS: Record<string, string> = {
  open:  'text-[var(--st-open)] bg-[var(--st-open-bg)] border-[var(--st-open-bd)]',
  final: 'text-[var(--st-final)] bg-[var(--st-final-bg)] border-[var(--st-final-bd)]',
  soon:  'text-[var(--st-soon)] bg-[var(--st-soon-bg)] border-[var(--st-soon-bd)]',
  over:  'text-[var(--st-over)] bg-[var(--st-over-bg)] border-[var(--st-over-bd)] font-bold',
};
const TIER_TONE_CLASS: Record<string, string> = {
  regularize: 'text-[var(--lv-regularize)] bg-[var(--lv-regularize-bg)] border-[var(--lv-regularize-bd)]',
  remediate:  'text-[var(--lv-remediate)] bg-[var(--lv-remediate-bg)] border-[var(--lv-remediate-bd)]',
};

const SORA = { fontFamily: 'Sora, sans-serif' } as const;

interface Props {
  obligation: RankedObligation;
  hero?: boolean;
  companyId: string;
  documentLanguage: 'fr' | 'en';
  framework: 'LSA' | 'CBCA';
  addToast: (message: string, type: 'success' | 'error') => void;
}

export default function A3Item({
  obligation: o,
  hero = false,
  companyId,
  documentLanguage,
  framework,
  addToast,
}: Props) {
  const locale = useLocale();
  const t = useTranslations('dashboard.a3Board');
  const tReq = useTranslations('requirementRow');
  const tDocs = useTranslations('documents');
  const tEvents = useTranslations('events');
  const tObl = useTranslations('obligationNotice');
  // Generalized how-to modal (mirrors EventActRow). Content is per-obligation:
  // body ← descriptionFr/En, legalRef ← statutoryBasis; falls back to the fixed
  // art. 41 copy for rows that carry neither.
  const buildObligationContent = useObligationModalContent();
  const router = useRouter();
  // Generate success -> re-run the RSC so the board re-ranks. The Completeness page's
  // onGenerated is a silent fetchData refetch; router.refresh() is the RSC equivalent.
  const handleGenerated = () => router.refresh();

  // Row upload/replace via the shared hook (B-1). requirementRef = fetch-on-demand:
  // the board lacks the ChecklistItem, so the hook fetches it by requirementKey+year.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openUpload, modalElement } = useRowUpload({
    companyId,
    framework,
    locale,
    preferredLanguage: documentLanguage,
    addToast,
  });
  // A-3 — event-row generate via the shared A-1 hook. Its eventRef branch fetches
  // the act by eventLink, so the board carries only the link, not the full act.
  const { openGenerate, dialogElement } = useEventGenerate({
    companyId,
    locale,
    preferredLanguage: documentLanguage,
    addToast,
  });
  // B-2 — the "J'ai fait la déclaration" confirm + browser-client RLS write, for
  // an event Stage-2 (file_externally) row. On confirm → insert event_filings →
  // router.refresh() (re-runs the RSC so the filed item drops off the board).
  const [fileConfirmOpen, setFileConfirmOpen] = useState(false);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // "Comment faire ?" how-to modal open state.
  const [obligationOpen, setObligationOpen] = useState(false);
  async function handleFileObligation() {
    if (!o.eventLink) return;
    setFiling(true);
    setFileError(null);
    try {
      await fileObligation({ companyId, eventLink: o.eventLink });
      setFileConfirmOpen(false);
      router.refresh();
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setFiling(false);
    }
  }
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    // Event rows carry eventLink (no requirementKey) → eventRef upload source;
    // completeness rows keep the requirementRef path byte-identical.
    if (o.source === 'event' && o.eventLink) {
      await openUpload({
        file: f,
        source: { kind: 'eventRef', eventLink: o.eventLink },
        onSuccess: () => router.refresh(),
      });
      return;
    }
    if (!o.requirementKey) return;
    await openUpload({
      file: f,
      source: { kind: 'requirementRef', requirementKey: o.requirementKey, year: o.year },
      onSuccess: () => router.refresh(),
    });
  }

  // Hero-trap guard (§11): only a `live` item may render as the hero. The ranker
  // sorts live > regularize > remediate so rank 1 is always live — assert it here
  // too and fail safe to a normal row if violated.
  const asHero = hero && o.liveness === 'live';
  if (hero && !asHero) {
    console.warn(
      `[A3Item] hero requested for non-live obligation ${o.id} (liveness=${o.liveness}); rendering as normal item.`,
    );
  }

  const isRemediate = o.liveness === 'remediate';
  const isRegularize = o.liveness === 'regularize';
  const isFoundational = o.source === 'completeness' && o.year === null;
  const title = resolveTitle(o, locale, t);
  // #149 — description follows UI locale (catalog chrome), mirroring RequirementRow.
  const description = locale === 'en' ? o.descriptionEn : o.descriptionFr;

  // ── state chip — Complétude parity for completeness rows: to_finalize shows
  //    "À signer" (documents.toSignBadge); empty (open) shows NO chip. Non-
  //    completeness rows keep their board status chip. Remediate/satisfied → none.
  //    The tier badge (below) is the ranking layer and is unaffected. ──
  // A-3 — document rows (completeness AND event) share the Complétude chip
  // grammar: empty (open) → no chip; généré (to_finalize) → "À signer". Event
  // Stage-2 (file_externally) rows carry a filing-clock status (due_soon/overdue),
  // not to_finalize, so they keep their board status chip.
  const showsDocChip = o.source === 'completeness' || o.source === 'event';
  // Inline the guard (not via an intermediate boolean) so TS narrows o.status to
  // exclude 'satisfied' when indexing STATUS_CHIP. Document empty (open) → no chip.
  const statusSpec =
    isRemediate || o.status === 'satisfied' || (showsDocChip && o.status === 'open')
      ? null
      : STATUS_CHIP[o.status];
  const StatusIcon = statusSpec?.Icon;
  const stateChipLabel = statusSpec
    ? showsDocChip && o.status === 'to_finalize'
      ? tDocs('toSignBadge')
      : t(statusSpec.labelKey)
    : '';
  const statusChip =
    statusSpec && StatusIcon ? (
      <span
        className={`inline-flex items-center gap-[5px] text-[11px] font-semibold px-[9px] py-[3px] rounded-full leading-[1.3] border ${STATUS_TONE_CLASS[statusSpec.tone]}`}
      >
        <StatusIcon className="w-3 h-3 shrink-0" />
        {stateChipLabel}
      </span>
    ) : null;

  // ── liveness tier badge — regularize (+ status) or remediate (replaces status) ──
  const tierSpec = isRemediate
    ? TIER_BADGE.remediate
    : isRegularize
      ? TIER_BADGE.regularize
      : null;
  const TierIcon = tierSpec?.Icon;
  const tierBadge =
    tierSpec && TierIcon ? (
      <span
        className={`inline-flex items-center gap-[5px] text-[10.5px] font-bold px-[9px] py-[2px] rounded-full leading-[1.3] tracking-[0.01em] border ${TIER_TONE_CLASS[tierSpec.tone]}`}
      >
        <TierIcon className="w-3 h-3 shrink-0" />
        {t(tierSpec.labelKey)}
      </span>
    ) : null;

  // ── verb — three branches: remediate → Consult (unchanged); completeness rows
  //    (requirementKey present) → Complétude's per-state button SET wired to real
  //    actions; everything else (file_externally etc.) → the single exposure-styled
  //    verb. SET labels source from Complétude's keys (requirementRow.*, and the
  //    GenerateDocumentButton default) so the board can't drift. ──
  const actBase =
    'inline-flex items-center gap-1.5 font-semibold rounded-[9px] whitespace-nowrap';
  // A-3 — the per-state button SET (Upload/Generate/Regenerate/Replace) now drives
  // completeness rows AND event rows (Stage 1). Event Stage-2 rows (file_externally)
  // fall through to the static-verb branch below — that IS the filing treatment.
  const canRowUpload =
    (o.source === 'completeness' && o.requirementKey != null) ||
    (o.source === 'event' && o.eventLink != null && o.actionKind !== 'file_externally');
  let verbButton: React.ReactNode = null;
  if (isRemediate) {
    const ConsultIcon = CONSULT.Icon;
    verbButton = (
      <button
        className={`${actBase} cursor-default text-[12px] px-3.5 py-[7px] bg-transparent text-[var(--lv-remediate)] border-[1.5px] border-[var(--lv-remediate-bd)]`}
      >
        <ConsultIcon className="w-3.5 h-3.5" />
        {t(CONSULT.labelKey)}
      </button>
    );
  } else if (canRowUpload) {
    // Per-state SET (mirrors RequirementRow): empty → [Upload, Generate]; généré →
    // [Upload, Regenerate]; uploaded-WIP → [Replace]. docSource (EDIT 1) distinguishes
    // généré from uploaded-WIP. Replace drops the canUpload gate (an uploaded row is
    // replaceable by definition), matching RequirementRow.
    const noDoc = !o.docSource;
    const isGenerated = o.docSource === 'generated';
    const isUploadedWip = o.docSource === 'uploaded';
    // Hero (rank 1): Téléverser/Remplacer = SOLID amber primary; the secondary
    // (Générer/Régénérer) = amber-BORDER outline (amber family). Non-hero: plain
    // dual-outline (Complétude parity). No dedicated --amber-border token exists;
    // --amber-400 (the solid amber) is reused as the border color — Aria to confirm.
    const setBase = `${actBase} cursor-pointer text-[12px] px-3.5 py-[7px] border-[1.5px] transition-colors`;
    const uploadCls = asHero
      ? `${setBase} bg-[var(--amber-400)] text-[var(--navy-900)] border-transparent hover:bg-[var(--amber-hover)] active:opacity-90`
      : `${setBase} bg-transparent text-[var(--text-heading)] border-[var(--card-border)] hover:bg-[var(--hover)]`;
    const genCls = asHero
      ? `${setBase} bg-transparent text-[var(--text-heading)] border-[var(--amber-400)] hover:bg-[var(--warning-bg)] hover:text-[var(--warning-text)] active:opacity-90`
      : `${setBase} bg-transparent text-[var(--text-heading)] border-[var(--card-border)] hover:bg-[var(--hover)]`;

    const uploadBtn = isUploadedWip
      ? { show: true, label: tReq('replace') }
      : (noDoc || isGenerated)
        ? { show: o.canUpload ?? false, label: tReq('uploadButton') }
        : { show: false, label: '' };
    const genBtn = noDoc
      ? { show: o.canGenerate ?? false, label: undefined as string | undefined }
      : isGenerated
        ? { show: o.canGenerate ?? false, label: tReq('regenerate') as string | undefined }
        : { show: false, label: undefined as string | undefined };

    // Event rows route Générer to useEventGenerate (Engine B — /generate-lifecycle),
    // NOT GenerateDocumentButton (requirement-keyed → /generate-item). Captured as a
    // const local so TS narrows it to non-null inside the onClick closure.
    const eventLink = o.source === 'event' ? o.eventLink ?? null : null;

    verbButton = (
      <>
        {uploadBtn.show && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className={uploadCls}>
            <Upload className="w-3.5 h-3.5" />
            {uploadBtn.label}
          </button>
        )}
        {genBtn.show && o.requirementKey && (
          <GenerateDocumentButton
            companyId={companyId}
            requirementKey={o.requirementKey}
            year={o.year}
            documentLanguage={documentLanguage}
            onSuccess={handleGenerated}
            locale={locale}
            label={genBtn.label}
            className={genCls}
          />
        )}
        {genBtn.show && eventLink && (
          <button
            type="button"
            onClick={() =>
              openGenerate({
                source: { kind: 'eventRef', eventLink },
                onSuccess: handleGenerated,
              })
            }
            className={genCls}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {genBtn.label ?? tEvents('generate')}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {modalElement}
        {dialogElement}
      </>
    );
  } else if (o.actionKind === 'file_externally' && o.source === 'event' && o.eventLink != null) {
    // B-2 — event Stage-2 filing: render BOTH the static obligation verb AND the
    // report-done action, matching every other row (obligation named + action
    // button). The static charbon verb states the task ("Déclarer au gouvernement",
    // byte-identical to what the DEADLINE row still shows); the outline button is
    // how you report it done. The DEADLINE feeder's file_externally row has no
    // eventLink → excluded here → it keeps ONLY the static verb via the else-branch.
    const fileVerb = VERB_LABEL[o.actionKind]; // file_externally → Landmark + verb.file_externally
    const scale = asHero ? 'text-[13px] px-[18px] py-[9px]' : 'text-[12px] px-3.5 py-[7px]';
    // Static verb: exposure is 'external' here → the gov charbon treatment, identical
    // to the else-branch's VERB_TREATMENT==='gov' arm.
    const staticCls = `${actBase} cursor-default ${scale} bg-[var(--act-gov-bg)] text-[var(--act-gov-fg)] border-none`;
    // Action button: the board's own row-button outline (uploadCls/genCls family),
    // so it matches the Upload/Generate buttons on sibling rows.
    const fileCls = `${actBase} cursor-pointer ${scale} border-[1.5px] bg-transparent text-[var(--text-heading)] border-[var(--card-border)] hover:bg-[var(--hover)] transition-colors`;
    const FileVerbIcon = fileVerb?.Icon;
    verbButton = (
      <>
        {fileVerb && FileVerbIcon && (
          <button className={staticCls}>
            <FileVerbIcon className="w-3.5 h-3.5" />
            {t(fileVerb.labelKey)}
          </button>
        )}
        <button type="button" onClick={() => setFileConfirmOpen(true)} className={fileCls}>
          <Landmark className="w-3.5 h-3.5" />
          {tObl('filing.button')}
        </button>
        <ConfirmDialog
          open={fileConfirmOpen}
          onClose={() => setFileConfirmOpen(false)}
          title={tObl('filing.confirmTitle')}
          body={tObl('filing.confirmBody')}
          confirmLabel={tObl('filing.confirm')}
          cancelLabel={tObl('filing.cancel')}
          onConfirm={handleFileObligation}
          loading={filing}
          error={fileError}
        />
      </>
    );
  } else {
    const verb = VERB_LABEL[o.actionKind];
    if (!verb) {
      // review / none — no emitter today (defensive).
      console.warn(
        `[A3Item] no verb label for actionKind=${o.actionKind} (${o.id}); no action button rendered.`,
      );
    } else {
      const VerbIcon = verb.Icon;
      // Aria ruling: fill color follows EXPOSURE (legal kind); hero is SCALE only.
      // External = solid charbon always (never amber, even as hero); internal =
      // amber when hero, outline otherwise.
      const scale = asHero ? 'text-[13px] px-[18px] py-[9px]' : 'text-[12px] px-3.5 py-[7px]';
      const cls =
        VERB_TREATMENT[o.exposure] === 'gov'
          ? `${actBase} cursor-default ${scale} bg-[var(--act-gov-bg)] text-[var(--act-gov-fg)] border-none`
          : asHero
            ? `${actBase} cursor-default ${scale} bg-[var(--amber-400)] text-[var(--navy-900)] border-none`
            : `${actBase} cursor-default ${scale} bg-transparent text-[var(--text-heading)] border-[1.5px] border-[var(--card-border)]`;
      verbButton = (
        <button className={cls}>
          <VerbIcon className="w-3.5 h-3.5" />
          {t(verb.labelKey)}
        </button>
      );
    }
  }

  // ── THE filing predicate — what the row IS, not which feeder/stage made it.
  //    A row is a "filing row" when satisfying it needs a government filing
  //    OUTSIDE ZapOkay (hasFiling) AND it carries a deadline to state. Gates all
  //    three filing affordances below (marker, due-line suppression, how-to pill)
  //    so the merged REQ row (source 'completeness') and a Stage-1 roster event
  //    (source 'event', exposure 'internal') render IDENTICALLY. Deliberately does
  //    NOT read `exposure` (which drives ranking) or `source`. ──
  const isFilingRow = o.hasFiling === true && o.dueDate != null;

  // ── "Comment faire ?" pill — replaces the old static guide-i. INTERACTIVE:
  //    opens the generalized ObligationModal (how to file this obligation).
  //    Shown on filing rows; never on remediate (that row is "consult a pro"). The
  //    modal's data (dueDate / statutoryBasis / descriptionFr-En) is already on
  //    the obligation; content falls back to the fixed art. 41 copy when absent. ──
  const showHowTo = isFilingRow && !isRemediate;
  const howToPill = showHowTo ? (
    <button
      type="button"
      onClick={() => setObligationOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-body)] hover:border-[var(--amber-400)] transition-colors shrink-0"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      {t('howToFile')}
    </button>
  ) : null;
  const obligationModalEl = obligationOpen ? (
    <ObligationModal
      open={obligationOpen}
      onClose={() => setObligationOpen(false)}
      {...buildObligationContent({
        subtitle: title,
        deadline: o.dueDate
          ? formatDate(o.dueDate, locale, { day: 'numeric', month: 'short', year: 'numeric' })
          : '',
        body: description,
        legalRef: o.statutoryBasis,
      })}
    />
  ) : null;

  // ── dependency indicator — reads hasDependencies; the lit branch is wired but
  //    inert in v1 (always false). Cools on remediate rows. ──
  const depSize = asHero ? 'w-9 h-9' : 'w-[30px] h-[30px]';
  const depOpacity = isRemediate ? 'opacity-[0.35]' : 'opacity-50';
  const DepDimmed = ICONS.depDimmed;
  const DepLit = ICONS.depLit;
  const dep = o.hasDependencies ? (
    <span
      className={`${depSize} rounded-lg inline-flex items-center justify-center shrink-0 relative text-[var(--amber-600)] border border-[var(--amber-200)] bg-[var(--amber-50)] ${isRemediate ? 'opacity-[0.35]' : ''}`}
    >
      <DepLit className="w-[15px] h-[15px]" />
    </span>
  ) : (
    <span
      className={`${depSize} rounded-lg inline-flex items-center justify-center shrink-0 border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] ${depOpacity}`}
    >
      <DepDimmed className="w-[15px] h-[15px]" />
    </span>
  );

  // ── filing marker (A-3) — DISPLAY-ONLY, shown on any FILING row (isFilingRow):
  //    the merged REQ annual-update row AND roster event rows, from Stage 1 onward,
  //    driven by the deadline carried on the obligation, independent of feeder or
  //    button stage. Part B makes it interactive ("J'ai fait la déclaration").
  //    Share events / internal rows carry no filing → no marker. ──
  const filingMarker =
    isFilingRow && o.dueDate ? ( // `&& o.dueDate` narrows string|null → string for TS; isFilingRow already implies it
      <ObligationMarker
        interactive={false}
        label={tObl('marker.label')}
        deadline={formatDate(o.dueDate, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
      />
    ) : null;

  // ── due line — a date (with past-due prefix when overdue), else a foundation tag.
  //    FILING rows show the filing marker (above) instead of this plain line, so the
  //    date isn't stated twice — suppress the due line for them. Filing-required
  //    wins over the plain past-due date line; the Overdue statusChip is separate
  //    (driven by status, rendered elsewhere) and stays regardless. ──
  const DueIcon = ICONS.due;
  const FoundationIcon = ICONS.foundation;
  let dueLine: React.ReactNode = null;
  if (isFilingRow) {
    dueLine = null; // handled by filingMarker
  } else if (o.dueDate) {
    const dateStr = formatDate(o.dueDate, locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const overdue = o.status === 'overdue';
    dueLine = (
      <span
        className={`text-[11px] inline-flex items-center gap-1 ${overdue ? 'text-[var(--st-over)] font-semibold' : 'text-[var(--text-muted)]'}`}
      >
        <DueIcon className="w-[11px] h-[11px]" />
        {overdue ? `${t('due.pastDue')} · ${dateStr}` : dateStr}
      </span>
    );
  } else if (isFoundational) {
    dueLine = (
      <span className="text-[11px] inline-flex items-center gap-1 text-[var(--text-muted)]">
        <FoundationIcon className="w-[11px] h-[11px]" />
        {t(asHero ? 'foundationPriority' : 'foundationTag')}
      </span>
    );
  }

  // ── HERO layout (rank 1) — distinct visual treatment, not just first row. ──
  if (asHero) {
    const HeroBadgeIcon = ICONS.heroBadge;
    return (
      <div className="mb-[9px] flex flex-col gap-0 p-[18px] rounded-[14px] border-[1.5px] border-[var(--amber-400)] bg-[linear-gradient(180deg,var(--amber-50),var(--card-bg)_60%)] dark:bg-[linear-gradient(180deg,rgba(245,185,30,0.08),var(--card-bg)_60%)] shadow-[0_3px_14px_rgba(245,185,30,0.12)]">
        <div className="flex items-center gap-[9px] mb-[11px]">
          <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold tracking-[0.08em] uppercase text-[var(--navy-900)] bg-[var(--amber-400)] px-2.5 py-[3px] rounded-full">
            <HeroBadgeIcon className="w-3 h-3" />
            {t('hero.badge')}
          </span>
          {statusChip}
        </div>
        <div className="flex items-start gap-1.5 mb-1">
          <div
            className="text-[17px] font-bold text-[var(--text-heading)] leading-[1.3]"
            style={SORA}
          >
            {title}
          </div>
          {!showHowTo && <DescriptionTooltip description={description} />}
        </div>
        <div className="flex items-center gap-[9px] mt-[11px] mb-[15px] flex-wrap">
          {dueLine}
          {filingMarker}
        </div>
        <div className="flex items-center gap-[9px] flex-wrap">
          {verbButton}
          {howToPill}
          {dep}
        </div>
        {obligationModalEl}
      </div>
    );
  }

  // ── NORMAL layout (rank 2–5) ──
  return (
    <div
      className={`mb-[9px] flex gap-3 items-start rounded-xl px-3.5 py-[13px] border ${
        isRemediate
          ? 'bg-[var(--lv-remediate-row)] border-[var(--lv-remediate-bd)]'
          : 'bg-[var(--card-bg)] border-[var(--card-border)]'
      }`}
    >
      <span
        className={`w-[22px] h-[22px] rounded-[7px] text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-px ${
          isRemediate
            ? 'bg-[var(--lv-remediate-bg)] text-[var(--lv-remediate)]'
            : 'bg-[var(--hover)] text-[var(--text-muted)]'
        }`}
        style={SORA}
      >
        {o.rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <div
            className={`text-[13px] font-semibold leading-[1.35] ${isRemediate ? 'text-[var(--text-body)]' : 'text-[var(--text-heading)]'}`}
          >
            {title}
          </div>
          {!showHowTo && <DescriptionTooltip description={description} />}
        </div>
        <div className="flex items-center gap-2 mt-[7px] flex-wrap">
          {tierBadge}
          {statusChip}
          {dueLine}
          {filingMarker}
        </div>
        <div className="flex items-center gap-[7px] mt-[11px] flex-wrap">
          {verbButton}
          {howToPill}
        </div>
        {obligationModalEl}
      </div>
      {dep}
    </div>
  );
}
