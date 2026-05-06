'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadDocument } from '@/lib/upload-document';
import { useToasts } from '@/components/ui/Toasts';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import RequirementSection from '@/components/minute-book/RequirementSection';
import DueDiligenceModal from '@/components/due-diligence/DueDiligenceModal';
import BulkCatchUpButton from '@/components/minute-book/BulkCatchUpButton';
import BulkCatchUpModal, {
  type BulkMissingByYear,
  type BulkMissingItem,
} from '@/components/minute-book/BulkCatchUpModal';
import CompletenessProgressBar from '@/components/minute-book/CompletenessProgressBar';
import type {
  CompletenessResponse,
  ChecklistItem,
} from '@/app/api/minute-book/completeness/route';

interface CompletenessPageProps {
  locale: string;
  companyId: string;
  framework: 'LSA' | 'CBCA';
  preferredLanguage: 'fr' | 'en';
}

export default function CompletenessPage({
  locale,
  companyId,
  framework,
  preferredLanguage,
}: CompletenessPageProps) {
  const fr = locale === 'fr';
  const [data, setData] = useState<CompletenessResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
          resolutionDate: fy.endDate,
          items,
        };
        bulkMissingCount += items.length;
      }
    }
  }

  return (
    <div>
      {/* Rich page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            {fr ? 'Complétude' : 'Completeness'}
          </h1>
          <div className="flex items-center gap-3">
            <BulkCatchUpButton
              missingCount={bulkMissingCount}
              onOpen={() => setIsBulkModalOpen(true)}
            />
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
          <>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {data.score}% {fr ? 'complet' : 'complete'}
              {' · '}
              {data.totalUploaded} {fr ? 'téléversés' : 'uploaded'}
              {' · '}
              {data.totalGenerated} {fr ? 'générés' : 'generated'}
              {' · '}
              {data.totalMissing} {fr ? 'manquants' : 'missing'}
            </p>
            <div className="mt-3">
              <CompletenessProgressBar score={data.score} locale={locale} />
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                {fr ? 'Signé et téléversé' : 'Signed and uploaded'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
                </svg>
                {fr ? 'Généré (à signer)' : 'Generated (to sign)'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
                {fr ? 'À générer ou à téléverser' : 'To generate or upload'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div className="space-y-6">
        {loading && (
          <div className="animate-pulse">
            <div className="h-48 bg-[var(--card-bg)] rounded-xl" />
          </div>
        )}
        {!loading && !data && (
          <p className="text-sm text-[var(--text-muted)]">
            {fr ? 'Impossible de charger le livre de minutes.' : 'Unable to load minute book.'}
          </p>
        )}

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
                title={getFiscalYearLabel(year, locale)}
                items={annualItemsByYear[year]}
                companyId={companyId}
                onFileSelected={handleFileSelected}
                onGenerated={fetchData}
              />
            ))}
          </>
        )}
      </div>

      <DueDiligenceModal
        companyId={companyId}
        isOpen={showDueDiligenceModal}
        onClose={() => setShowDueDiligenceModal(false)}
      />

      <BulkCatchUpModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        missingByYear={bulkMissingByYear}
        onComplete={() => {
          void fetchData();
        }}
      />

      {ToastStack}
    </div>
  );
}
