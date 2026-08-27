'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DocumentTypePill } from './DocumentTypePill';
import { LanguageBadge } from './LanguageBadge';
import { DocumentModal } from './DocumentModal';
import { composeDisplayName } from '@/lib/display-name';

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

export function DocumentRow({ doc, locale, onDelete, aiSummariesEnabled = false, coverageCount, coverageLinks = [], requirementTitles = {} }: DocumentRowProps) {
  const tDocs = useTranslations('documents');
  const [hovered, setHovered] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  const fr = locale === 'fr';

  const formattedDate = new Date(doc.uploaded_at ?? doc.created_at).toLocaleDateString(
    fr ? 'fr-CA' : 'en-CA',
    { year: 'numeric', month: 'short', day: 'numeric' }
  );

  const downloadUrl = `/api/documents/${doc.id}/download`;

  async function handleView() {
    // If AI summaries enabled, open modal with tabs
    if (aiSummariesEnabled) {
      setShowDocModal(true);
      return;
    }
    window.open(`${downloadUrl}?preview=true`, '_blank', 'noopener,noreferrer');
  }

  async function handleDownload() {
    setLoading('download');
    try {
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.title || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } finally {
      setLoading(null);
    }
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

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] transition-shadow hover:shadow-md"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <DocumentTypePill type={doc.document_type} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-heading)] truncate">{composeDisplayName(doc.title, null, doc.document_year)}</span>
            {doc.source === 'generated' && (
              <span
                className="flex-shrink-0"
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase' as const,
                  background: 'var(--warning-bg)',
                  color: 'var(--warning-text)',
                  border: '1px solid var(--warning-border)',
                  borderRadius: '20px',
                  padding: '2px 8px',
                }}
              >
                {tDocs('toSignBadge')}
              </span>
            )}
            {/* A6 — ce que le document COUVRE. N'apparaît qu'à DEUX exigences ou plus :
                à une seule, l'information est déjà dans le titre et le badge serait du
                bruit sur 42 lignes sur 45.
                ⚠️ `--info-*` et non `--warning-*` : « À signer » est une ACTION à faire,
                la couverture est une INFORMATION. Même famille de badge, deux registres.
                C'est le triplet qu'emploie déjà LanguageBadge sur cette même ligne. */}
            {coverageCount >= 2 && (
              <span
                className="flex-shrink-0"
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase' as const,
                  background: 'var(--info-bg)',
                  color: 'var(--info-text)',
                  border: '1px solid var(--info-border)',
                  borderRadius: '20px',
                  padding: '2px 8px',
                }}
              >
                {tDocs('coverageCount', { count: coverageCount })}
              </span>
            )}
          </div>
        </div>

        {/* Actions — Eye → Download → Delete */}
        <div
          className="flex items-center gap-1 transition-opacity duration-150"
          style={{ opacity: hovered ? 1 : 0.5 }}
        >
          {doc.file_url && (
            <>
              {/* View */}
              <button
                onClick={handleView}
                disabled={loading !== null}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-50"
                title={fr ? 'Voir' : 'View'}
              >
                {loading === 'view' ? spinnerIcon : <Eye className="w-4 h-4" strokeWidth={1.8} />}
              </button>

              {/* Download */}
              <button
                onClick={handleDownload}
                disabled={loading !== null}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-50"
                title={fr ? 'Télécharger' : 'Download'}
              >
                {loading === 'download' ? spinnerIcon : <Download className="w-4 h-4" strokeWidth={1.8} />}
              </button>
            </>
          )}

          {/* Delete */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors"
            title={fr ? 'Supprimer' : 'Delete'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        <LanguageBadge language={doc.language} />

        <div className="text-xs text-[var(--text-muted)] text-right whitespace-nowrap">
          {formattedDate}
        </div>
      </div>

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
              {fr ? 'Supprimer ce document ?' : 'Delete this document?'}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-1 truncate">{composeDisplayName(doc.title, null, doc.document_year)}</p>
            <p className="text-xs text-[var(--error-text)] mb-5">
              {fr ? 'Cette action est irréversible.' : 'This action cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-50"
              >
                {fr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--error-bg)] text-[var(--error-text)] border border-[var(--error-border)] hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {deleting
                  ? (fr ? 'Suppression…' : 'Deleting…')
                  : (fr ? 'Supprimer définitivement' : 'Delete permanently')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
