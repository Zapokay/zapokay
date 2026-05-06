'use client';

import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import BinderView from '@/components/minute-book/BinderView';
import DueDiligenceModal from '@/components/due-diligence/DueDiligenceModal';
import CompletenessProgressBar from '@/components/minute-book/CompletenessProgressBar';
import type { CompletenessResponse } from '@/app/api/minute-book/completeness/route';

interface BinderPageProps {
  locale: string;
  companyId: string;
}

export default function BinderPage({ locale, companyId }: BinderPageProps) {
  const fr = locale === 'fr';
  const [score, setScore] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showDueDiligenceModal, setShowDueDiligenceModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/minute-book/completeness');
        if (res.ok) {
          const json: CompletenessResponse = await res.json();
          if (!cancelled) setScore(json.score);
        }
      } catch (error) {
        console.error('Failed to fetch completeness score:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {/* Minimal page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              {fr ? 'Livre' : 'Binder'}
            </h1>
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="relative rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-body)]"
            >
              <Info className="h-4 w-4" />
              {showTooltip && (
                <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs text-[var(--text-body)] shadow-lg">
                  {fr
                    ? 'Le livre de minutes est le registre officiel de votre société. Il contient tous les documents juridiques fondateurs et les résolutions adoptées chaque année.'
                    : 'The minute book is the official record of your company. It contains all founding legal documents and resolutions adopted each year.'}
                </div>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowDueDiligenceModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-[1.5px] border-[var(--card-hover-border)] text-[var(--text-heading)] bg-transparent transition-colors hover:bg-[var(--hover)]"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            ↓ {fr ? 'Exporter le livre' : 'Export book'}
          </button>
        </div>
        {score !== null && (
          <div className="mt-3">
            <CompletenessProgressBar score={score} showLabel locale={locale} />
          </div>
        )}
      </div>

      {/* Body */}
      <BinderView />

      <DueDiligenceModal
        companyId={companyId}
        isOpen={showDueDiligenceModal}
        onClose={() => setShowDueDiligenceModal(false)}
      />
    </div>
  );
}
