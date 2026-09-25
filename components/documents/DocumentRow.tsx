'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { DownloadButton } from './DownloadButton';
import { createClient } from '@/lib/supabase/client';
import { StateBadge, IdentityBox, codeDeLangue } from '@/components/minute-book/state-visuals';
import { DocumentModal } from './DocumentModal';
import { composeDisplayName } from '@/lib/display-name';
import { getDocumentState } from '@/lib/minute-book/state';
import { displayStateOf, displayStateLabelKey } from '@/lib/minute-book/display-state';
import ListRow from '@/components/minute-book/ListRow';

export interface VaultDocument {
  id: string;
  company_id: string;
  title: string;
  document_type: string;
  document_year: number | null;
  file_url: string | null;
  language: string;
  uploaded_at: string | null;
  created_at: string;
  source?: string | null;
  // A7-1 — `requirement_key` a été RETIRÉ de ce type le 2026-08-24. Ses deux
  // seuls lecteurs vivaient dans DocumentsClient et ont disparu avec A6, qui
  // lit désormais `requirement_documents`. ⚠️ Ne le remets pas : un document
  // peut couvrir PLUSIEURS exigences depuis A2a, donc un champ scalaire sur
  // ce type ne pourrait dire qu'une vérité partielle.
  minute_book_section?: string | null;
  is_finalized?: boolean | null;
}

interface DocumentRowProps {
  doc: VaultDocument;
  locale: string;
  onDelete: (id: string) => Promise<void>;
  aiSummariesEnabled?: boolean;
  /** A6 — nombre d'exigences que ce document couvre (lu sur requirement_documents). */
  coverageCount: number;
  /** VISUEL-1 — les liaisons elles-mêmes, pour la modale. Le badge ci-dessous
   *  continue de ne lire que `coverageCount` : on ajoute un lecteur, on n'en change aucun. */
  coverageLinks?: { key: string; year: number | null }[];
  /** VISUEL-1 — libellés du catalogue pour le régime de la société. */
  requirementTitles?: Record<string, { fr: string; en: string }>;
}

const BUCKET_MARKER = '/object/public/documents/';

// V4 — les types qui ont un mot au catalogue (documents.types.*) ; tout autre retombe sur 'autre',
// comme la tuile d'avant retombait sur la sienne. Prédicat, pas cast : la clé reste typée.
const TYPE_KEYS = ['statuts', 'resolution', 'pv', 'registre', 'rapport', 'autre'] as const;
function isTypeKey(value: string): value is (typeof TYPE_KEYS)[number] {
  return (TYPE_KEYS as readonly string[]).includes(value);
}

export function DocumentRow({ doc, locale, onDelete, aiSummariesEnabled = false, coverageCount, coverageLinks = [], requirementTitles = {} }: DocumentRowProps) {
  const tDocs = useTranslations('documents');
  const tState = useTranslations('documentState');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  const fr = locale === 'fr';

  const formattedDate = new Date(doc.uploaded_at ?? doc.created_at).toLocaleDateString(
    fr ? 'fr-CA' : 'en-CA',
    { year: 'numeric', month: 'short', day: 'numeric' }
  );

  // ⚠️ DETTE (V1) : isArchived inconnu ici — Documents ne lit pas les années 'hold'. Un document NON
  // certifié d'une année d'archive dirait « À finaliser » ici et « Archivé » à Complétude (0 cas au 2026-09-24).
  const displayState = displayStateOf({
    documentState: getDocumentState({
      satisfied: true,
      source: doc.source === 'generated' || doc.source === 'uploaded' ? doc.source : null,
      is_finalized: doc.is_finalized,
    }),
  });

  const downloadUrl = `/api/documents/${doc.id}/download`;

  async function handleView() {
    // If AI summaries enabled, open modal with tabs
    if (aiSummariesEnabled) {
      setShowDocModal(true);
      return;
    }
    window.open(`${downloadUrl}?preview=true`, '_blank', 'noopener,noreferrer');
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete(doc.id);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  const spinnerIcon = (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  // V4 — la ligne à deux bandes : [case vide] titre ··· badge date / [type | langue] faits ··· icônes.
  // Modales en SŒURS de la ligne (§392).
  const typeKey = isTypeKey(doc.document_type) ? doc.document_type : 'autre';
  // Une case d'icône : 26 px, toujours présente ; vide = même place, invisible (règle 12).
  const caseIcone = 'flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[var(--text-muted)] transition-colors';
  return (
    <ListRow
      title={composeDisplayName(doc.title, null, doc.document_year)}
      date={<span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{formattedDate}</span>}
      identity={
        // E6 + point 3 (V4) : la boîte commune — le MOT du type, le filet, puis le code de langue en
        // TEXTE simple (mêmes codes qu'avant : FR, EN, Bilingue ; codés en dur, phase 2).
        <IdentityBox type={typeKey} languageCode={codeDeLangue(doc.language)} />
      }
      state={
        // Point 2 (V4) : UN seul dessin, celui de Complétude.
        displayState === 'draft' && <StateBadge>{tState(displayStateLabelKey(displayState))}</StateBadge>
      }
      facts={
        <>
            {/* A6 — ce que le document COUVRE. N'apparaît qu'à DEUX exigences ou plus :
                à une seule, l'information est déjà dans le titre et le badge serait du
                bruit sur 42 lignes sur 45.
                ⚪ V4 : c'est un FAIT, pas un état — en texte dans la phrase, jamais en badge. */}
            {coverageCount >= 2 && (
              // Point 4 (V4) : en TEXTE dans la phrase, après « · » ; plus de pastille.
              <>
                <span aria-hidden="true" className="text-xs text-[var(--text-muted)]">·</span>
                <span className="text-xs text-[var(--text-body)] whitespace-nowrap">
                  {tDocs('coverageCount', { count: coverageCount })}
                </span>
              </>
            )}
        </>
      }
      icons={
        // Eye → Download → Delete, trois cases toujours là. Opacité 0,5 → 1 au survol de la LIGNE (V3, E7).
        <div className="flex items-center gap-[5px] opacity-50 group-hover:opacity-100 transition-opacity duration-150">
          {doc.file_url ? (
            <>
              {/* View */}
              <button
                onClick={handleView}
                disabled={loading !== null}
                className={`${caseIcone} hover:text-[var(--text-body)] hover:bg-[var(--page-bg)] disabled:opacity-50`}
                title={tDocs('view')}
              >
                {loading === 'view' ? spinnerIcon : <Eye className="w-4 h-4" strokeWidth={1.8} />}
              </button>

              {/* Download — V4b : le bouton commun (logique déplacée ici → DownloadButton, inchangée). */}
              <DownloadButton
                documentId={doc.id}
                fileName={doc.title}
                className={`${caseIcone} hover:text-[var(--text-body)] hover:bg-[var(--page-bg)] disabled:opacity-50`}
                disabled={loading !== null && loading !== 'download'}
                onBusyChange={(b) => setLoading(b ? 'download' : null)}
              />
            </>
          ) : (
            <>
              <span aria-hidden="true" className="invisible h-[26px] w-[26px]" />
              <span aria-hidden="true" className="invisible h-[26px] w-[26px]" />
            </>
          )}

          {/* Delete */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className={`${caseIcone} hover:text-[var(--error-text)] hover:bg-[var(--error-bg)]`}
            title={tDocs('delete')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      }
    >
      {/* Document modal with AI tabs */}
      {showDocModal && (
        <DocumentModal
          doc={doc}
          locale={locale}
          aiSummariesEnabled={aiSummariesEnabled}
          coverageLinks={coverageLinks}
          requirementTitles={requirementTitles}
          onClose={() => setShowDocModal(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-sm">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-md p-6 w-full max-w-sm mx-4 animate-fade-in">
            <h3
              className="text-base font-semibold text-[var(--text-heading)] mb-1"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              {tDocs('deleteTitle')}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-1 truncate">{composeDisplayName(doc.title, null, doc.document_year)}</p>
            <p className="text-xs text-[var(--error-text)] mb-5">
              {tDocs('deleteWarning')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-50"
              >
                {tDocs('deleteCancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--error-bg)] text-[var(--error-text)] border border-[var(--error-border)] hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {deleting ? tDocs('deleting') : tDocs('deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ListRow>
  );
}
