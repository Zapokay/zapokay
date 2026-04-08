'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import CompletenessBar from '@/components/minute-book/CompletenessBar';
import RequirementSection from '@/components/minute-book/RequirementSection';
import type {
  CompletenessResponse,
  ChecklistItem,
} from '@/app/api/minute-book/completeness/route';

interface MinuteBookPageProps {
  locale: string;
}

export default function MinuteBookPage({ locale }: MinuteBookPageProps) {
  const router = useRouter();
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

  // Group checklist items
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 bg-neutral-200 rounded" />
        <div className="h-3 w-full bg-neutral-200 rounded-full" />
        <div className="h-48 bg-neutral-100 rounded-xl" />
        <div className="h-48 bg-neutral-100 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Impossible de charger le livre de minutes.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            Livre de minutes
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
                Le livre de minutes est le registre officiel de votre société.
                Il contient tous les documents juridiques fondateurs et les
                résolutions adoptées chaque année.
              </div>
            )}
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {data.score}% complet · {data.totalMissing} documents manquants
        </p>
        <div className="mt-4">
          <CompletenessBar
            score={data.score}
            totalSatisfied={data.totalSatisfied}
            totalRequired={data.totalRequired}
            size="lg"
          />
        </div>
      </div>

      {/* Foundational section */}
      {foundationalItems.length > 0 && (
        <RequirementSection
          title="Documents fondateurs"
          items={foundationalItems}
          onUpload={handleUpload}
          onGenerate={handleGenerate}
        />
      )}

      {/* Annual sections — newest first */}
      {sortedYears.map((year) => (
        <RequirementSection
          key={year}
          title={getFiscalYearLabel(year)}
          items={annualItemsByYear[year]}
          onUpload={handleUpload}
          onGenerate={handleGenerate}
        />
      ))}
    </div>
  );
}
