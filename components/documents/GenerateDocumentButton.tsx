'use client';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { SignatoriesModal } from './SignatoriesModal';
import { useGenerateWithSignatories } from './useGenerateWithSignatories';
import { getSignatoryType, isAllSignatoriesRequired } from '@/lib/requirement-map';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';

interface GenerateDocumentButtonProps {
  companyId: string;
  requirementKey: string;
  /** Fiscal year for annual requirements. Null/undefined for foundational. */
  year?: number | null;
  /**
   * Document language for the generated PDF + its signature-block role labels.
   * DISTINCT from `locale` (UI chrome): the Two-Layer model (CLAUDE.md §3) keeps
   * document language independent of UI locale — never pass `locale` here.
   * Defaults to 'fr'; EN ships dormant until a parent wires preferred_language (#2).
   */
  documentLanguage?: 'fr' | 'en';
  onSuccess?: (documentId: string, fileName: string) => void;
  locale?: string;
  /** Optional label override */
  label?: string;
  /** V4 (point 7) — icône propre au verbe (Régénérer : flèche circulaire). Défaut : Sparkles. */
  icon?: ReactNode;
  /** When provided, applied to the button element and overrides default inline styles */
  className?: string;
  /**
   * EXTERNAL inertness, decided by the caller. OR'd with the button's own
   * in-flight state — it never replaces it, so a caller passing `false` can
   * still not click through a generation already running.
   *
   * ★ THE REASON DOES NOT LIVE HERE, AND THAT IS DELIBERATE. Why a caller
   * blocks is caller-shaped: it needs the UI locale, a date format, and a place
   * in its own row to put the text. This component would have to be handed all
   * three to say one sentence. Callers render their own explanation next to the
   * button (see RequirementRow / A3Item); this prop only makes it inert.
   */
  disabled?: boolean;
}

const NO_SIGNATORIES_ERROR: Record<string, string> = {
  board: "Vous devez d'abord enregistrer des administrateurs avant de générer ce document.",
  shareholder: "Vous devez d'abord enregistrer des actionnaires avant de générer ce document.",
};

/**
 * §392 (lot V4) — LE BOUTON ET SA FENÊTRE, SÉPARABLES. `button` va où le bouton était ;
 * `modal` (SignatoriesModal, en position fixe) doit être rendu HORS de toute ligne à
 * survol, en SŒUR — sinon son voile « survole » la ligne. Quand et comment la fenêtre
 * s'ouvre : inchangé. GenerateDocumentButton ci-dessous recolle les deux, pour A3Item.
 */
export function useGenerateDocumentButton({
  companyId,
  requirementKey,
  year,
  documentLanguage = 'fr',
  onSuccess,
  locale = 'fr',
  label,
  icon,
  className,
  disabled,
}: GenerateDocumentButtonProps): { button: ReactNode; modal: ReactNode } {
  const fr = locale === 'fr';
  const tLife = useTranslations('lifecycle');
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
        const params = new URLSearchParams({ companyId, requirementKey, language: documentLanguage });
        const res = await fetch(`/api/documents/signatories?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setPreCheckError(fr ? 'Erreur lors du chargement des signataires.' : 'Error loading signatories.');
          return;
        }
        // Block count: a single entity (even with N signers) is one block and
        // still skips the modal — its signers travel as a unit.
        const fetched = data.signatories as SignatoryBlock[];
        if (fetched.length === 0) {
          setPreCheckError(NO_SIGNATORIES_ERROR[signatoryType] ?? 'Aucun signataire enregistré.');
          return;
        }
        if (fetched.length === 1) {
          // Single signatory block — no need for selection, generate immediately
          const result = await generate({ companyId, requirementKey, year, language: documentLanguage, signatories: fetched });
          if (result) onSuccess?.(result.documentId, result.fileName);
          return;
        }
        setShowModal(true);
      } catch {
        setPreCheckError(tLife('errorNetwork'));
      } finally {
        setIsFetching(false);
      }
    } else {
      const result = await generate({ companyId, requirementKey, year, language: documentLanguage });
      if (result) onSuccess?.(result.documentId, result.fileName);
    }
  }

  async function handleConfirm(signatories: SignatoryBlock[]) {
    setShowModal(false);
    const result = await generate({ companyId, requirementKey, year, language: documentLanguage, signatories });
    if (result) onSuccess?.(result.documentId, result.fileName);
  }

  // D6 (V4) : trois chaînes au catalogue, mots identiques ; « Vérification… » n'a pas de clé (phase 2).
  const buttonLabel = label ?? tLife('generate');
  const loadingLabel = isFetching
    ? (fr ? 'Vérification…' : 'Checking…')
    : tLife('generating');
  const isBusy = isGenerating || isFetching;
  const displayError = preCheckError ?? error;

  const button = (
    <>
      <button
        onClick={handleClick}
        disabled={isBusy || disabled}
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
            {icon ?? <Sparkles className="h-3.5 w-3.5" />}
            {buttonLabel}
          </>
        )}
      </button>

      {displayError && (
        <p style={{ fontSize: '12px', color: 'var(--error-text)', margin: '6px 0 0', maxWidth: '280px' }}>
          {displayError}
        </p>
      )}
    </>
  );

  const modal = showModal ? (
    <SignatoriesModal
      companyId={companyId}
      requirementKey={requirementKey}
      allRequired={allRequired}
      documentLanguage={documentLanguage}
      onConfirm={handleConfirm}
      onClose={() => setShowModal(false)}
      locale={locale}
    />
  ) : null;

  return { button, modal };
}

/** Le bouton et sa fenêtre, recollés — pour les appelants sans ligne à survol (A3Item). */
export function GenerateDocumentButton(props: GenerateDocumentButtonProps) {
  const { button, modal } = useGenerateDocumentButton(props);
  return (
    <>
      {button}
      {modal}
    </>
  );
}
