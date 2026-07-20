'use client';

/**
 * A3 board -- "What to do now". The top-5 ranked obligations (rank 1 = hero),
 * with a completeness progress mini-bar and a route-out to Completeness for the
 * rest. Presentational: the server page assembles the engine chain and passes
 * `ranked` + `progress` down. Design: docs/design/zapokay_a3_board.html sec 1/5.
 */

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { RankedObligation } from '@/lib/obligations/rank';
import { ICONS } from './a3-presentation';
import A3Item from './A3Item';

interface Props {
  ranked: RankedObligation[];
  progress: { done: number; total: number };
  companyId: string;
  documentLanguage: 'fr' | 'en';
}

const SORA = { fontFamily: 'Sora, sans-serif' } as const;

export default function A3Board({ ranked, progress, companyId, documentLanguage }: Props) {
  const locale = useLocale();
  const t = useTranslations('dashboard.a3Board');

  const top = ranked.slice(0, 5);
  const remaining = Math.max(0, ranked.length - 5);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const ShowMoreIcon = ICONS.showMore;
  const ArrowIcon = ICONS.arrow;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* board-head */}
      <div className="flex items-center gap-2.5 mb-[15px]">
        <div>
          <div className="text-[16px] font-bold text-[var(--text-heading)]" style={SORA}>
            {t('title')}
          </div>
          <div className="text-[11.5px] text-[var(--text-muted)] mt-px">{t('subtitle')}</div>
        </div>
        <div className="ml-auto flex items-center gap-[7px] text-[11px] text-[var(--text-muted)]">
          <span>
            {progress.done}/{progress.total}
          </span>
          <span className="w-16 h-[5px] rounded-[3px] bg-[var(--card-border)] overflow-hidden">
            <span className="block h-full bg-[var(--amber-400)] rounded-[3px]" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>
      {/* top-5 (rank 1 = hero) */}
      {top.map((o, i) => (
        <A3Item key={o.id} obligation={o} hero={i === 0} companyId={companyId} documentLanguage={documentLanguage} />
      ))}

      {/* show-more: route out to Completeness (never expands in place) */}
      {remaining > 0 && (
        <Link
          href={`/${locale}/dashboard/minute-book/completeness`}
          className="w-full mt-3 p-[11px] border border-dashed border-[var(--card-border)] rounded-[10px] bg-transparent text-[12.5px] font-semibold text-[var(--text-body)] flex items-center justify-center gap-[7px] hover:bg-[var(--hover)] hover:border-[var(--text-muted)]"
        >
          <ShowMoreIcon className="w-3.5 h-3.5" />
          {t('showMore', { count: remaining })}
          <ArrowIcon className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
