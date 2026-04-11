'use client';
import { useState } from 'react';
import { Eye, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DocumentTypePill } from './DocumentTypePill';
import { LanguageBadge } from './LanguageBadge';
import { DocumentModal } from './DocumentModal';

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
}

interface DocumentRowProps {
  doc: VaultDocument;
  locale: string;
  onDelete: (id: string) => Promise<void>;
  aiSummariesEnabled?: boolean;
}

const BUCKET_MARKER = '/object/public/documents/';

export function DocumentRow({ doc, locale, onDelete, aiSummariesEnabled = false }: DocumentRowProps) {
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

  async function getSignedUrl(): Promise<string | null> {
    if (!doc.file_url) return null;

    const idx = doc.file_url.indexOf(BUCKET_MARKER);
    if (idx === -1) {
      console.error('[DocumentRow] Cannot parse storage path from file_url:', doc.file_url);
      return null;
    }
    const storagePath = doc.file_url.slice(idx + BUCKET_MARKER.length);

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 60);

    if (error || !data?.signedUrl) {
      console.error('[DocumentRow] createSignedUrl failed:', error);
      return null;
    }

    return data.signedUrl;
  }

  async function handleView() {
    // If AI summaries enabled, open modal with tabs
    if (aiSummariesEnabled) {
      setShowDocModal(true);
      return;
    }
    setLoading('view');
    try {
      const signedUrl = await getSignedUrl();
      if (!signedUrl) return;
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setLoading(null);
    }
  }

  async function handleDownload() {
    setLoading('download');
    try {
      const signedUrl = await getSignedUrl();
      if (!signedUrl) return;
      const response = await fetch(signedUrl);
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
            <span className="text-sm font-semibold text-[var(--text-heading)] truncate">{doc.title}</span>
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
                {fr ? 'À signer' : 'To sign'}
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
            <p className="text-sm text-[var(--text-muted)] mb-1 truncate">{doc.title}</p>
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
