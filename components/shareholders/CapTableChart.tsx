'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ShareholdingWithDetails,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface CapTableChartProps {
  shareholdings: ShareholdingWithDetails[];
  totalIssued: number;
}

interface OwnerSlice {
  personId: string;
  name: string;
  quantity: number;
  pct: number;
  color: string;
}

// =============================================================================
// Color palette (amber-centric, works on light + dark)
// =============================================================================

const SLICE_COLORS = [
  '#f59e0b', // amber-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
];

// =============================================================================
// Component
// =============================================================================

export default function CapTableChart({
  shareholdings,
  totalIssued,
}: CapTableChartProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  // ---- Aggregate by person --------------------------------------------------
  const slices: OwnerSlice[] = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number }>();

    shareholdings.forEach((sh) => {
      const existing = map.get(sh.person_id);
      if (existing) {
        existing.quantity += sh.quantity;
      } else {
        map.set(sh.person_id, {
          name: sh.person.full_name,
          quantity: sh.quantity,
        });
      }
    });

    let colorIdx = 0;
    const result: OwnerSlice[] = [];
    map.forEach((val, personId) => {
      result.push({
        personId,
        name: val.name,
        quantity: val.quantity,
        pct: totalIssued > 0 ? Math.round((val.quantity / totalIssued) * 100) : 0,
        color: SLICE_COLORS[colorIdx % SLICE_COLORS.length],
      });
      colorIdx++;
    });

    // Sort descending by quantity
    result.sort((a, b) => b.quantity - a.quantity);
    return result;
  }, [shareholdings, totalIssued]);

  // ---- SVG donut math -------------------------------------------------------
  const SIZE = 140;
  const STROKE = 28;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // Build arcs
  const arcs = useMemo(() => {
    const result: { offset: number; length: number; color: string }[] = [];
    let cumulative = 0;

    slices.forEach((slice) => {
      const fraction = totalIssued > 0 ? slice.quantity / totalIssued : 0;
      const length = CIRCUMFERENCE * fraction;
      const offset = CIRCUMFERENCE * cumulative;
      result.push({ offset, length, color: slice.color });
      cumulative += fraction;
    });

    return result;
  }, [slices, totalIssued, CIRCUMFERENCE]);

  if (slices.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Header */}
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {locale === 'fr' ? 'Tableau de capitalisation' : 'Cap Table'}
      </h3>

      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {/* Donut chart */}
        <div className="relative shrink-0">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="-rotate-90"
          >
            {/* Background ring */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-zinc-100 dark:text-zinc-700"
            />
            {/* Slices */}
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
                strokeLinecap="butt"
                className="transition-all duration-500"
              />
            ))}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {totalIssued.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}
            </span>
            <span className="text-[10px] text-zinc-400">
              {locale === 'fr' ? 'actions' : 'shares'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {slices.map((slice) => (
            <div key={slice.personId} className="flex items-center gap-3">
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {slice.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {slice.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                  {locale === 'fr' ? 'actions' : 'shares'} · {slice.pct}%
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {slice.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Total + class summary */}
      {shareholdings.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? 'Total émis' : 'Total issued'} :{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {totalIssued.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
              {locale === 'fr' ? 'actions' : 'shares'}
            </span>
            {' · '}
            {locale === 'fr' ? 'Classe' : 'Class'} :{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {shareholdings[0].share_class.name}
              {shareholdings[0].share_class.voting_rights
                ? locale === 'fr' ? ' (votantes)' : ' (voting)'
                : ''}
              {!shareholdings[0].share_class.max_quantity
                ? locale === 'fr' ? ', illimitées' : ', unlimited'
                : ''}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

