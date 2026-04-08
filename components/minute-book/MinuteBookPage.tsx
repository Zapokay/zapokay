'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import CompletenessBar from '@/components/minute-book/CompletenessBar';
import RequirementSection from '@/components/minute-book/RequirementSection';
import BinderView from '@/components/minute-book/BinderView';
import type {
  CompletenessResponse,
  ChecklistItem,
} from '@/app/api/minute-book/completeness/route';

const TABS = [
  { key: 'completude', labelFr: 'Complétude', labelEn: 'Completeness' },
  { key: 'livre', labelFr: 'Livre', labelEn: 'Binder' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface MinuteBookPageProps {
  locale: string;
}

export default function MinuteBookPage({ locale }: MinuteBookPageProps) {
  const router = useRouter();
  const fr = locale === 'fr';
  const [activeTab, setActiveTab] = useState<TabKey>('completude');
  const [data, setData] = useState<CompletenessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/minute-book/completeness');
      if (res.ok) {
        const json: CompletenessResponse = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch completeness:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpload = (requirementKey: string, year: number | null) => {
    const params = new URLSearchParams({
      requirement_key: requirementKey,
      ...(year !== null && { requirement_year: String(year) }),
    });
    router.push(`/${locale}/dashboard/documents?upload=true&${params.toString()}`);
  };

  const handleGenerate = (requirementKey: string, year: number | null) => {
    if (year !== null) {
      router.push(`/${locale}/dashboard/wizard?year=${year}`);
    }
  };

  const foundationalItems: ChecklistItem[] =
    data?.checklist.filter((i) => i.category === 'foundational') || [];

  const annualItemsByYear: Record<number, ChecklistItem[]> = {};
  for (const item of data?.checklist.filter((i) => i.category === 'annual') || []) {
    if (item.year !== null) {
      if (!annualItemsByYear[item.year]) {
        annualItemsByYear[item.year] = [];
      }
      annualItemsByYear[item.year].push(item);
    }
  }

  const sortedYears = Object.keys(annualItemsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  const getFiscalYearLabel = (year: number): string => {
    const fy = data?.fiscalYears.find((f) => f.year === year);
    if (fy) {
      return `Exercice ${fy.start_year}–${fy.end_year}`;
    }
    return `Exercice ${year}`;
  };

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex gap-6 border-b border-neutral-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-neutral-800'
                : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {fr ? tab.labelFr : tab.labelEn}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Complétude tab */}
      {activeTab === 'completude' && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                {fr ? 'Livre de minutes' : 'Minute Book'}
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
            {loading ? (
              <div className="animate-pulse space-y-6 mt-4">
                <div className="h-3 w-full bg-neutral-200 rounded-full" />
                <div className="h-48 bg-neutral-100 rounded-xl" />
              </div>
            ) : data ? (
              <>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {data.score}% {fr ? 'complet' : 'complete'} · {data.totalMissing} {fr ? 'documents manquants' : 'missing documents'}
                </p>
                <div className="mt-4">
                  <CompletenessBar
                    score={data.score}
                    totalSatisfied={data.totalSatisfied}
                    totalRequired={data.totalRequired}
                    size="lg"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)] mt-2">
                {fr ? 'Impossible de charger le livre de minutes.' : 'Unable to load minute book.'}
              </p>
            )}
          </div>

          {!loading && data && (
            <>
              {foundationalItems.length > 0 && (
                <RequirementSection
                  title={fr ? 'Documents fondateurs' : 'Founding documents'}
                  items={foundationalItems}
                  onUpload={handleUpload}
                  onGenerate={handleGenerate}
                />
              )}

              {sortedYears.map((year) => (
                <RequirementSection
                  key={year}
                  title={getFiscalYearLabel(year)}
                  items={annualItemsByYear[year]}
                  onUpload={handleUpload}
                  onGenerate={handleGenerate}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Livre tab */}
      {activeTab === 'livre' && <BinderView />}
    </div>
  );
}
