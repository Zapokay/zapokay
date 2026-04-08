'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowRight } from 'lucide-react';
import CompletenessBar from '@/components/minute-book/CompletenessBar';
import { useLocale } from 'next-intl';

interface CompletenessData {
  score: number;
  totalRequired: number;
  totalSatisfied: number;
  totalMissing: number;
}

export default function MinuteBookCard() {
  const locale = useLocale();
  const [data, setData] = useState<CompletenessData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompleteness() {
      try {
        const res = await fetch('/api/minute-book/completeness');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error('Failed to fetch completeness:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchCompleteness();
  }, []);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-5 w-5 text-[var(--text-heading)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Livre de minutes
        </span>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-20 bg-[var(--card-border)] rounded" />
          <div className="h-2 w-full bg-[var(--card-border)] rounded-full" />
          <div className="h-4 w-40 bg-[var(--card-border)] rounded" />
        </div>
      ) : data ? (
        <>
          <CompletenessBar
            score={data.score}
            totalSatisfied={data.totalSatisfied}
            totalRequired={data.totalRequired}
            size="sm"
          />

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              {data.totalSatisfied} / {data.totalRequired} documents requis
            </p>
            {data.totalMissing > 0 && (
              <span className="text-xs font-medium" style={{ color: '#6B1E1E' }}>
                {data.totalMissing} manquants
              </span>
            )}
          </div>

          <Link
            href={`/${locale}/dashboard/minute-book`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-link)] hover:underline"
          >
            Voir les détails
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          Impossible de charger les données.
        </p>
      )}
    </div>
  );
}
