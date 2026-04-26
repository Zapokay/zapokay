'use client';

import { useState, useEffect, useCallback } from 'react';
import { Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadDocument } from '@/lib/upload-document';
import { useToasts } from '@/components/ui/Toasts';
import CompletenessBar from '@/components/minute-book/CompletenessBar';
import RequirementSection from '@/components/minute-book/RequirementSection';
import BinderView from '@/components/minute-book/BinderView';
import DueDiligenceModal from '@/components/due-diligence/DueDiligenceModal';
import BulkCatchUpButton from '@/components/minute-book/BulkCatchUpButton';
import BulkCatchUpModal, {
  type BulkMissingByYear,
  type BulkMissingItem,
} from '@/components/minute-book/BulkCatchUpModal';
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
  companyId: string;
  framework: 'LSA' | 'CBCA';
  preferredLanguage: 'fr' | 'en';
}

export default function MinuteBookPage({ locale, companyId, framework, preferredLanguage }: MinuteBookPageProps) {
  const fr = locale === 'fr';
  const [activeTab, setActiveTab] = useState<TabKey>('completude');
  const [data, setData] = useState<CompletenessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showDueDiligenceModal, setShowDueDiligenceModal] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const { addToast, ToastStack } = useToasts();

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

  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB — matches UploadZone cap

  // Row-driven silent upload. Returns true on success, false on any validation
  // or pipeline failure. All user feedback (toast + row refresh) is owned here;
  // the row just awaits the boolean to clear its local isUploading state.
  const handleFileSelected = useCallback(
    async (file: File, requirementKey: string, year: number | null): Promise<boolean> => {
      if (file.type !== 'application/pdf') {
        addToast(fr ? 'Seuls les fichiers PDF sont acceptés.' : 'Only PDF files are accepted.', 'error');
        return false;
      }
      if (file.size > MAX_SIZE) {
        addToast(fr ? 'Le fichier dépasse 20 Mo.' : 'File exceeds 20 MB.', 'error');
        return false;
      }

      const item = data?.checklist.find(
        i => i.requirement_key === requirementKey && (i.year ?? null) === (year ?? null),
      );
      if (!item) {
        addToast(fr ? 'Exigence introuvable.' : 'Requirement not found.', 'error');
        return false;
      }

      const base = fr ? item.title_fr : item.title_en;
      const title = item.category === 'annual' && year !== null ? `${base} — ${year}` : base;

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addToast(fr ? 'Session expirée.' : 'Session expired.', 'error');
        return false;
      }

      const result = await uploadDocument({
        file,
        companyId,
        userId: user.id,
        supabaseClient: supabase,
        title,
        docType: item.document_type,
        language: preferredLanguage,
        docYear: item.category === 'annual' ? year : null,
        requirementKey,
        requirementYear: year,
        framework,
        requirements: data?.checklist ?? [],
      });

      if (!result.ok) {
        addToast(fr ? "Erreur lors de l'envoi du fichier." : 'Error uploading file.', 'error');
        return false;
      }

      const yearSuffix = item.category === 'annual' && year !== null ? ` ${year}` : '';
      addToast(
        fr ? `Document ajouté à « ${base} »${yearSuffix}.` : `Document added to "${base}"${yearSuffix}.`,
        'success',
      );
      await fetchData();
      return true;
    },
    [addToast, companyId, data, fetchData, fr, framework, preferredLanguage],
  );

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

  // Bulk Catch-Up: build per-year groups of annual missing items
  // (filters out foundational; modal owns canGenerate-driven checkbox state).
  const bulkMissingByYear: BulkMissingByYear = {};
  let bulkMissingCount = 0;
  if (data) {
    for (const fy of data.fiscalYears) {
      const items: BulkMissingItem[] = data.checklist
        .filter(
          (i) =>
            i.category === 'annual' &&
            i.year === fy.year &&
            !i.satisfied &&
            i.can_generate,
        )
        .map((i) => ({
          requirementKey: i.requirement_key,
          title: fr ? i.title_fr : i.title_en,
          canGenerate: i.can_generate,
        }));
      if (items.length > 0) {
        bulkMissingByYear[fy.year] = {
          startYear: fy.start_year,
          endYear: fy.end_year,
          resolutionDate: fy.endDate,
          items,
        };
        bulkMissingCount += items.length;
      }
    }
  }

  const getFiscalYearLabel = (year: number): string => {
    const fy = data?.fiscalYears.find((f) => f.year === year);
    if (fy) {
      return `Exercice ${fy.start_year}–${fy.end_year}`;
    }
    return `Exercice ${year}`;
  };

  return (
    <div>
      {/* Page heading — always visible above tabs */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
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
          <div className="flex items-center gap-3">
            {activeTab === 'completude' && (
              <BulkCatchUpButton
                missingCount={bulkMissingCount}
                onOpen={() => setIsBulkModalOpen(true)}
              />
            )}
            <button
              type="button"
              onClick={() => setShowDueDiligenceModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-[1.5px] border-[var(--card-hover-border)] text-[var(--text-heading)] bg-transparent transition-colors hover:bg-[var(--hover)]"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              ↓ {fr ? 'Exporter le livre' : 'Export book'}
            </button>
          </div>
        </div>
        {!loading && data && (
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {data.score}% {fr ? 'complet' : 'complete'} · {data.totalMissing} {fr ? 'documents manquants' : 'missing documents'}
          </p>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-6 border-b border-[var(--card-border)] mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-[var(--text-heading)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-body)]'
            }`}
          >
            {fr ? tab.labelFr : tab.labelEn}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--amber-400)] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Complétude tab */}
      {activeTab === 'completude' && (
        <div className="space-y-6">
          <div>
            {loading ? (
              <div className="animate-pulse space-y-6">
                <div className="h-3 w-full bg-[var(--card-border)] rounded-full" />
                <div className="h-48 bg-[var(--card-bg)] rounded-xl" />
              </div>
            ) : data ? (
              <div className="mt-0">
                <CompletenessBar
                  score={data.score}
                  totalSatisfied={data.totalSatisfied}
                  totalRequired={data.totalRequired}
                  size="lg"
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
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
                  companyId={companyId}
                  onFileSelected={handleFileSelected}
                  onGenerated={fetchData}
                />
              )}

              {sortedYears.map((year) => (
                <RequirementSection
                  key={year}
                  title={getFiscalYearLabel(year)}
                  items={annualItemsByYear[year]}
                  companyId={companyId}
                  onFileSelected={handleFileSelected}
                  onGenerated={fetchData}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Livre tab */}
      {activeTab === 'livre' && <BinderView />}

      {/* Due Diligence Modal */}
      <DueDiligenceModal
        companyId={companyId}
        isOpen={showDueDiligenceModal}
        onClose={() => setShowDueDiligenceModal(false)}
      />

      {/* Bulk Catch-Up Modal */}
      <BulkCatchUpModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        missingByYear={bulkMissingByYear}
        onComplete={() => {
          void fetchData();
        }}
      />

      {/* Toast stack */}
      {ToastStack}
    </div>
  );
}
