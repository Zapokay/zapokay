'use client';

/**
 * A3 board — one row. Hero (rank 1) + normal variants. Presentational only:
 * consumes a RankedObligation + the pure lookups in a3-presentation.ts. Two
 * INDEPENDENT axes (status vs. liveness; verb visual vs. verb label) and the
 * remediate row treatment, per docs/design/zapokay_a3_board.html §2/§2B/§3/§11.
 */

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
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
}

export default function A3Item({ obligation: o, hero = false, companyId, documentLanguage }: Props) {
  const locale = useLocale();
  const t = useTranslations('dashboard.a3Board');
  const router = useRouter();
  // Generate success -> re-run the RSC so the board re-ranks. The Completeness page's
  // onGenerated is a silent fetchData refetch; router.refresh() is the RSC equivalent.
  const handleGenerated = () => router.refresh();

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

  // ── status chip — suppressed on remediate (liveness outranks status) ──
  const statusSpec =
    !isRemediate && o.status !== 'satisfied' ? STATUS_CHIP[o.status] : null;
  const StatusIcon = statusSpec?.Icon;
  const statusChip =
    statusSpec && StatusIcon ? (
      <span
        className={`inline-flex items-center gap-[5px] text-[11px] font-semibold px-[9px] py-[3px] rounded-full leading-[1.3] border ${STATUS_TONE_CLASS[statusSpec.tone]}`}
      >
        <StatusIcon className="w-3 h-3 shrink-0" />
        {t(statusSpec.labelKey)}
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

  // ── verb — remediate overrides with the consult action-state; otherwise two
  //    independent lookups (visual ← exposure, label ← actionKind). ──
  const actBase =
    'inline-flex items-center gap-1.5 font-semibold rounded-[9px] whitespace-nowrap cursor-default';
  let verbButton: React.ReactNode = null;
  if (isRemediate) {
    const ConsultIcon = CONSULT.Icon;
    verbButton = (
      <button
        className={`${actBase} text-[12px] px-3.5 py-[7px] bg-transparent text-[var(--lv-remediate)] border-[1.5px] border-[var(--lv-remediate-bd)]`}
      >
        <ConsultIcon className="w-3.5 h-3.5" />
        {t(CONSULT.labelKey)}
      </button>
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
      // amber when hero, outline otherwise. Non-hero behavior unchanged.
      const scale = asHero ? 'text-[13px] px-[18px] py-[9px]' : 'text-[12px] px-3.5 py-[7px]';
      const cls =
        VERB_TREATMENT[o.exposure] === 'gov'
          ? `${actBase} ${scale} bg-[var(--act-gov-bg)] text-[var(--act-gov-fg)] border-none`
          : asHero
            ? `${actBase} ${scale} bg-[var(--amber-400)] text-[var(--navy-900)] border-none`
            : `${actBase} ${scale} bg-transparent text-[var(--text-heading)] border-[1.5px] border-[var(--card-border)]`;
      verbButton =
        o.actionKind === 'generate' && o.requirementKey ? (
          <GenerateDocumentButton
            companyId={companyId}
            requirementKey={o.requirementKey}
            year={o.year}
            documentLanguage={documentLanguage}
            onSuccess={handleGenerated}
            locale={locale}
            label={t(verb.labelKey)}
            className={cls}
          />
        ) : (
          <button className={cls}>
            <VerbIcon className="w-3.5 h-3.5" />
            {t(verb.labelKey)}
          </button>
        );
    }
  }

  // ── guide-i (static, non-functional; how-to modal is a deferred follow-up) —
  //    external / government items only, never on remediate (no gov action). ──
  const GuideIcon = ICONS.guide;
  const guideIcon =
    o.exposure === 'external' && !isRemediate ? (
      <span
        className="w-7 h-7 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--navy-600)] dark:text-[#9EB8DC] inline-flex items-center justify-center shrink-0"
        title={t('guideLabel')}
        aria-label={t('guideLabel')}
      >
        <GuideIcon className="w-[15px] h-[15px]" />
      </span>
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

  // ── due line — a date (with past-due prefix when overdue), else a foundation tag ──
  const DueIcon = ICONS.due;
  const FoundationIcon = ICONS.foundation;
  let dueLine: React.ReactNode = null;
  if (o.dueDate) {
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
          <DescriptionTooltip description={description} />
        </div>
        <div className="flex items-center gap-[9px] mt-[11px] mb-[15px] flex-wrap">
          {dueLine}
        </div>
        <div className="flex items-center gap-[9px]">
          {verbButton}
          {guideIcon}
          {dep}
        </div>
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
          <DescriptionTooltip description={description} />
        </div>
        <div className="flex items-center gap-2 mt-[7px] flex-wrap">
          {tierBadge}
          {statusChip}
          {dueLine}
        </div>
        <div className="flex items-center gap-[7px] mt-[11px]">
          {verbButton}
          {guideIcon}
        </div>
      </div>
      {dep}
    </div>
  );
}
