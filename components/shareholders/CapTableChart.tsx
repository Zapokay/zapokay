'use client';

import { useMemo, useEffect, useState } from 'react';
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
// Color palette — muted in dark mode
// =============================================================================

const SLICE_COLORS_LIGHT = [
  '#f59e0b', // amber-500
  '#6B8FAD', // muted steel-blue
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
];

const SLICE_COLORS_DARK = [
  '#D4A020', // muted amber
  '#6B8FAD', // muted steel-blue
  '#3A9E75', // muted emerald
  '#7B5FBF', // muted violet
  '#C44060', // muted rose
  '#1A9BB0', // muted cyan
  '#B83F8A', // muted pink
  '#6B9C12', // muted lime
];

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// =============================================================================
// Component
// =============================================================================

export default function CapTableChart({
  shareholdings,
  totalIssued,
}: CapTableChartProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const isDark = useIsDark();
  const SLICE_COLORS = isDark ? SLICE_COLORS_DARK : SLICE_COLORS_LIGHT;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareholdings, totalIssued, isDark]);

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
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
      {/* Header */}
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
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
              stroke="var(--card-border)"
              strokeWidth={STROKE}
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
            <span className="text-lg font-bold text-[var(--text-heading)]">
              {totalIssued.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
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
                <p className="truncate text-sm font-medium text-[var(--text-heading)]">
                  {slice.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {slice.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                  {locale === 'fr' ? 'actions' : 'shares'} · {slice.pct}%
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-[var(--text-body)]">
                {slice.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Total + class summary */}
      {shareholdings.length > 0 && (
        <div className="mt-4 border-t border-[var(--card-border)] pt-3">
          <p className="text-xs text-[var(--text-muted)]">
            {locale === 'fr' ? 'Total émis' : 'Total issued'} :{' '}
            <span className="font-medium text-[var(--text-body)]">
              {totalIssued.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
              {locale === 'fr' ? 'actions' : 'shares'}
            </span>
            {' · '}
            {locale === 'fr' ? 'Classe' : 'Class'} :{' '}
            <span className="font-medium text-[var(--text-body)]">
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

