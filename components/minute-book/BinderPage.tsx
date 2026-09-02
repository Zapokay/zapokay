'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import BinderView from '@/components/minute-book/BinderView';
import BinderExportModal from '@/components/minute-book/BinderExportModal';

interface BinderPageProps {
  locale: string;
  companyId: string;
}

export default function BinderPage({ locale, companyId }: BinderPageProps) {
  const fr = locale === 'fr';
  const tBinder = useTranslations('minuteBook.binder');
  const [showTooltip, setShowTooltip] = useState(false);
  const [showBinderExportModal, setShowBinderExportModal] = useState(false);
  // ⚠️ AUCUN APPEL RÉSEAU ICI. Le nombre arrive de BinderView, qui le tient de la
  // MÊME réponse que ses étagères. Un second fetch — ou une somme recalculée —
  // pourrait afficher un compte que les sections en dessous contredisent.
  // `setTotalDocuments` est passé tel quel : un setter de useState est stable.
  const [totalDocuments, setTotalDocuments] = useState<number | null>(null);

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
            onClick={() => setShowBinderExportModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-[1.5px] border-[var(--card-hover-border)] text-[var(--text-heading)] bg-transparent transition-colors hover:bg-[var(--hover)]"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            ↓ {tBinder('exportBook')}
          </button>
        </div>
        {totalDocuments !== null && (
          <div className="mt-3 text-sm text-[var(--text-muted)]">
            {tBinder('documentCount', { count: totalDocuments })}
          </div>
        )}
      </div>

      {/* Body */}
      <BinderView onTotalDocuments={setTotalDocuments} />

      <BinderExportModal
        companyId={companyId}
        isOpen={showBinderExportModal}
        onClose={() => setShowBinderExportModal(false)}
      />
    </div>
  );
}
