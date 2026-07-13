'use client';

/**
 * Status verdict — the "suis-je correct?" headline above the A3 board. Renders one of
 * 3 states + metrics, both sourced from the page's completeness liveness aggregates.
 * Presentational; palette MIRRORS the board (--lv-* / --success-*) so verdict +
 * board read as one system. Copy is placeholder, Harvey-pending — see
 * messages/*.json → dashboard.statusVerdict._pendingLawyer.
 */

import { useTranslations } from 'next-intl';
import { CircleCheck, AlertTriangle, AlertCircle, type LucideIcon } from 'lucide-react';

type Verdict = 'en_regle' | 'attention' | 'defaut_prolonge';

interface Props {
  verdict: Verdict;
  // Display numbers — currently HARDCODED placeholders from the page, NOT wired to
  // real data (pending completeness verification). count = en_regle/defaut single
  // metric; missing + overdue = attention's two metrics.
  count?: number;
  missing?: number;
  overdue?: number;
}

const SORA = { fontFamily: 'Sora, sans-serif' } as const;

// Per-state icon + palette (mirrors the board). Full literal class strings (Tailwind JIT).
// attention uses AlertTriangle (action-needed) — intentionally NOT the calm AlertCircle
// used for defaut_prolonge (Aria: amber = act now, charbon = grave-but-calm).
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

function Metric({ value, label, accent, muted = false }: { value: number; label: string; accent: string; muted?: boolean }) {
  // muted = subordinate secondary metric (Sora 700 15px, muted) vs the primary
  // (Sora 800 20px, accent). accent is ignored when muted.
  const valueCls = muted
    ? 'text-[15px] font-bold text-[var(--text-muted)]'
    : `text-[20px] font-extrabold ${accent}`;
  return (
    <div className="shrink-0 text-center">
      <div className={`${valueCls} leading-none`} style={SORA}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.05em] mt-[3px] text-[var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}

export default function StatusVerdict({ verdict, count = 0, missing = 0, overdue = 0 }: Props) {
  const t = useTranslations('dashboard.statusVerdict');

  const s = STATE[verdict];
  const Icon = s.Icon;

  return (
    <div className={`w-full flex items-center gap-4 rounded-[14px] border px-5 py-[18px] ${s.card}`}>
      <span className={`w-12 h-12 rounded-full border-2 inline-flex items-center justify-center shrink-0 ${s.ring} ${s.accent}`}>
        <Icon className="w-[26px] h-[26px]" />
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-[17px] font-bold leading-[1.25] ${s.accent}`} style={SORA}>
          {t(`${verdict}.title`)}
        </div>
        <div className="text-[12.5px] leading-[1.45] mt-[3px] text-[var(--text-body)]">
          {t(`${verdict}.support`, { missing, overdue })}
        </div>
      </div>
      {verdict === 'attention' ? (
        <div className="flex items-center gap-4 shrink-0">
          <Metric value={missing} label={t('attention.metricLabelMissing')} accent={s.accent} />
          <Metric value={overdue} label={t('attention.metricLabelOverdue')} accent={s.accent} />
        </div>
      ) : verdict === 'defaut_prolonge' ? (
        <div className="flex items-center gap-3 shrink-0">
          <Metric value={count} label={t('defaut_prolonge.metricLabel')} accent={s.accent} />
          {overdue > 0 && (
            <Metric value={overdue} label={t('defaut_prolonge.metricLabelRegularize')} accent={s.accent} muted />
          )}
        </div>
      ) : (
        <Metric value={count} label={t(`${verdict}.metricLabel`)} accent={s.accent} />
      )}
    </div>
  );
}
