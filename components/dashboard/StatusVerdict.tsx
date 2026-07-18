'use client';

/**
 * Status verdict — the compliance headline above the A3 board. One of 3 states,
 * each: an icon, a two-part title (state LABEL · warm GLOSS), a support line, and
 * ONE number = that state's own tier (en_regle -> upcoming, attention ->
 * regularize, defaut_prolonge -> prolonged), captioned by that number's tier
 * (Option C — words match the Complétude chips). Numbers are the page's COMBINED
 * (requirements + events) aggregates, so the verdict matches Complétude. Copy is
 * lawyer-pending YELLOW — see messages/*.json -> dashboard.statusVerdict._pendingLawyer.
 */

import { useTranslations } from 'next-intl';
import { CircleCheck, AlertTriangle, AlertCircle, type LucideIcon } from 'lucide-react';

type Verdict = 'en_regle' | 'attention' | 'defaut_prolonge';

interface Props {
  verdict: Verdict;
  upcoming?: number;
  regularize?: number;
  prolonged?: number;
}

const SORA = { fontFamily: 'Sora, sans-serif' } as const;

const STATE: Record<Verdict, { Icon: LucideIcon; card: string; ring: string; accent: string }> = {
  en_regle: {
    Icon: CircleCheck,
    card: 'bg-[var(--success-bg)] border-[var(--success-border)]',
    ring: 'border-[var(--success-border)]',
    accent: 'text-[var(--success-text)]',
  },
  attention: {
    Icon: AlertTriangle,
    card: 'bg-[var(--lv-regularize-bg)] border-[var(--lv-regularize-bd)]',
    ring: 'border-[var(--lv-regularize-bd)]',
    accent: 'text-[var(--lv-regularize)]',
  },
  defaut_prolonge: {
    Icon: AlertCircle,
    card: 'bg-[var(--lv-remediate-bg)] border-[var(--lv-remediate-bd)]',
    ring: 'border-[var(--lv-remediate-bd)]',
    accent: 'text-[var(--lv-remediate)]',
  },
};

export default function StatusVerdict({ verdict, upcoming = 0, regularize = 0, prolonged = 0 }: Props) {
  const t = useTranslations('dashboard.statusVerdict');
  const s = STATE[verdict];
  const Icon = s.Icon;
  const metricValue = verdict === 'en_regle' ? upcoming : verdict === 'attention' ? regularize : prolonged;
  const caption = verdict === 'en_regle' ? t('en_regle.upcomingCaption') : t(`${verdict}.label`);

  return (
    <div className={`w-full flex items-center gap-4 rounded-[14px] border px-5 py-[18px] ${s.card}`}>
      <span className={`w-12 h-12 rounded-full border-2 inline-flex items-center justify-center shrink-0 ${s.ring} ${s.accent}`}>
        <Icon className="w-[26px] h-[26px]" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[17px] leading-[1.25]" style={SORA}>
          <span className={`font-bold ${s.accent}`}>{t(`${verdict}.label`)}</span>
          <span className="text-[var(--text-muted)] font-normal"> · </span>
          <span className={`font-medium ${s.accent} opacity-80`}>{t(`${verdict}.gloss`)}</span>
        </div>
        <div className="text-[12.5px] leading-[1.45] mt-[3px] text-[var(--text-body)]">
          {t(`${verdict}.support`)}
        </div>
      </div>
      <div className="shrink-0 text-center">
        <div className={`text-[26px] font-extrabold leading-none ${s.accent}`} style={SORA}>
          {metricValue}
        </div>
        <div className="text-[9px] uppercase tracking-[0.05em] mt-[4px] text-[var(--text-muted)]">
          {caption}
        </div>
      </div>
    </div>
  );
}
