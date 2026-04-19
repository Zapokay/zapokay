'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SignatoriesModal } from './SignatoriesModal';
import { useGenerateWithSignatories } from './useGenerateWithSignatories';
import { getSignatoryType, isAllSignatoriesRequired } from '@/lib/requirement-map';
import type { Signatory } from '@/lib/pdf-templates/signature-blocks';

interface GenerateDocumentButtonProps {
  companyId: string;
  requirementKey: string;
  /** Fiscal year for annual requirements. Null/undefined for foundational. */
  year?: number | null;
  onSuccess?: (documentId: string, fileName: string) => void;
  locale?: string;
  /** Optional label override */
  label?: string;
  /** When provided, applied to the button element and overrides default inline styles */
  className?: string;
}

const NO_SIGNATORIES_ERROR: Record<string, string> = {
  board: "Vous devez d'abord enregistrer des administrateurs avant de générer ce document.",
  shareholder: "Vous devez d'abord enregistrer des actionnaires avant de générer ce document.",
};

export function GenerateDocumentButton({
  companyId,
  requirementKey,
  year,
  onSuccess,
  locale = 'fr',
  label,
  className,
}: GenerateDocumentButtonProps) {
  const fr = locale === 'fr';
  const [showModal, setShowModal] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [preCheckError, setPreCheckError] = useState<string | null>(null);

  const { generate, isGenerating, error } = useGenerateWithSignatories();

  const signatoryType = getSignatoryType(requirementKey);
  const needsModal = signatoryType !== null;
  const allRequired = isAllSignatoriesRequired(requirementKey);

  async function handleClick() {
    setPreCheckError(null);
    if (needsModal) {
      setIsFetching(true);
      try {
        const params = new URLSearchParams({ companyId, requirementKey });
        const res = await fetch(`/api/documents/signatories?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setPreCheckError(fr ? 'Erreur lors du chargement des signataires.' : 'Error loading signatories.');
          return;
        }
        const fetched = data.signatories as Signatory[];
        if (fetched.length === 0) {
          setPreCheckError(NO_SIGNATORIES_ERROR[signatoryType] ?? 'Aucun signataire enregistré.');
          return;
        }
        if (fetched.length === 1) {
          // Single signatory — no need for selection, generate immediately
          const result = await generate({ companyId, requirementKey, year, signatories: fetched });
          if (result) onSuccess?.(result.documentId, result.fileName);
          return;
        }
        setShowModal(true);
      } catch {
        setPreCheckError(fr ? 'Erreur réseau.' : 'Network error.');
      } finally {
        setIsFetching(false);
      }
    } else {
      const result = await generate({ companyId, requirementKey, year });
      if (result) onSuccess?.(result.documentId, result.fileName);
    }
  }

  async function handleConfirm(signatories: Signatory[]) {
    setShowModal(false);
    const result = await generate({ companyId, requirementKey, year, signatories });
    if (result) onSuccess?.(result.documentId, result.fileName);
  }

  const buttonLabel = label ?? (fr ? 'Générer' : 'Generate');
  const loadingLabel = isFetching
    ? (fr ? 'Vérification…' : 'Checking…')
    : (fr ? 'Génération…' : 'Generating…');
  const isBusy = isGenerating || isFetching;
  const displayError = preCheckError ?? error;

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isBusy}
        {...(className
          ? { className }
          : {
              style: {
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px',
                border: 'none',
                background: isBusy ? '#E0D9CE' : '#F5B91E',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700,
                color: '#1C1A17',
                transition: 'background 150ms',
              },
            })}
      >
        {isBusy ? (
          <>
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 14 14" fill="none"
            >
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="24" strokeDashoffset="6" />
            </svg>
            {loadingLabel}
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            {buttonLabel}
          </>
        )}
      </button>

      {displayError && (
        <p style={{ fontSize: '12px', color: 'var(--error-text)', margin: '6px 0 0', maxWidth: '280px' }}>
          {displayError}
        </p>
      )}

      {showModal && (
        <SignatoriesModal
          companyId={companyId}
          requirementKey={requirementKey}
          allRequired={allRequired}
          onConfirm={handleConfirm}
          onClose={() => setShowModal(false)}
          locale={locale}
        />
      )}
    </>
  );
}
