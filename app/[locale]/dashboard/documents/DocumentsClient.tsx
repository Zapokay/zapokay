'use client';
import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DocumentRow, type VaultDocument } from '@/components/documents/DocumentRow';
import { UploadZone } from '@/components/documents/UploadZone';
import type { Company } from '@/lib/types';

interface DocumentsClientProps {
  locale: string;
  company: Company | null;
  initialDocuments: VaultDocument[];
}

type ToastType = 'success' | 'error';
interface ToastItem { id: number; message: string; type: ToastType }

const TYPE_OPTIONS = [
  { value: '',           labelFr: 'Tous les types',  labelEn: 'All types' },
  { value: 'statuts',    labelFr: 'Statuts',          labelEn: 'Articles' },
  { value: 'resolution', labelFr: 'Résolution',       labelEn: 'Resolution' },
  { value: 'pv',         labelFr: 'Procès-verbal',    labelEn: 'Minutes' },
  { value: 'registre',   labelFr: 'Registre',         labelEn: 'Register' },
  { value: 'rapport',    labelFr: 'Rapport',           labelEn: 'Report' },
  { value: 'autre',      labelFr: 'Autre',             labelEn: 'Other' },
];

const LANG_OPTIONS = [
  { value: '',          labelFr: 'Toutes les langues', labelEn: 'All languages' },
  { value: 'fr',        labelFr: 'Français',           labelEn: 'French' },
  { value: 'en',        labelFr: 'Anglais',            labelEn: 'English' },
  { value: 'bilingual', labelFr: 'Bilingue',           labelEn: 'Bilingual' },
];

export function DocumentsClient({ locale, company, initialDocuments }: DocumentsClientProps) {
  const fr = locale === 'fr';
  const supabase = createClient();

  const [documents, setDocuments] = useState<VaultDocument[]>(initialDocuments);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [typeFilter, setTypeFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [aiSummariesEnabled, setAiSummariesEnabled] = useState(false);

  useEffect(() => {
    supabase
      .from('feature_flags')
      .select('is_enabled')
      .eq('flag_key', 'ai_summaries')
      .single()
      .then(({ data }) => setAiSummariesEnabled(data?.is_enabled ?? false));
  }, [supabase]);

  // Map incorporation_type → framework required by the documents table
  const framework = company?.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';

  function addToast(message: string, type: ToastType) {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  const fetchDocuments = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as VaultDocument[]);
  }, [company?.id, supabase]);

  function handleUploadComplete() {
    fetchDocuments();
    addToast(
      fr ? 'Document ajouté avec succès.' : 'Document added successfully.',
      'success'
    );
  }

  function handleUploadError(message: string) {
    addToast(message, 'error');
  }

  async function handleDelete(id: string) {
    const doc = documents.find(d => d.id === id);

    // Remove from storage if we can extract the path
    if (doc?.file_url) {
      try {
        const url = new URL(doc.file_url);
        const marker = '/object/public/documents/';
        const idx = url.pathname.indexOf(marker);
        if (idx !== -1) {
          const storagePath = url.pathname.slice(idx + marker.length);
          await supabase.storage.from('documents').remove([storagePath]);
        }
      } catch {
        // URL parse failed — proceed with DB delete anyway
      }
    }

    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) {
      addToast(
        fr ? 'Erreur lors de la suppression.' : 'Error deleting document.',
        'error'
      );
    } else {
      setDocuments(prev => prev.filter(d => d.id !== id));
      addToast(fr ? 'Document supprimé.' : 'Document deleted.', 'success');
    }
  }

  const filtered = documents
    .filter(doc => {
      const matchSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase());
      const matchType   = !typeFilter || doc.document_type === typeFilter;
      const matchLang   = !langFilter || doc.language === langFilter;
      return matchSearch && matchType && matchLang;
    })
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === 'desc' ? -diff : diff;
    });

  const selectClass =
    'px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors';

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-bold text-[var(--text-heading)]"
          style={{ fontFamily: 'Sora, sans-serif' }}
        >
          {fr ? 'Coffre-fort documentaire' : 'Document Vault'}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {documents.length === 0
            ? (fr ? 'Aucun document' : 'No documents')
            : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Upload zone */}
      {company && (
        <UploadZone
          companyId={company.id}
          framework={framework}
          locale={locale}
          onUploadComplete={handleUploadComplete}
          onError={handleUploadError}
        />
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={fr ? 'Rechercher…' : 'Search…'}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
          />
        </div>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')} className={selectClass}>
          <option value="desc">{fr ? 'Plus récent' : 'Newest first'}</option>
          <option value="asc">{fr ? 'Plus ancien' : 'Oldest first'}</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectClass}>
          {TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{fr ? o.labelFr : o.labelEn}</option>
          ))}
        </select>
        <select value={langFilter} onChange={e => setLangFilter(e.target.value)} className={selectClass}>
          {LANG_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{fr ? o.labelFr : o.labelEn}</option>
          ))}
        </select>
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-[var(--card-border)] rounded-xl bg-[var(--card-bg)]">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium text-[var(--text-muted)]">
            {fr ? 'Aucun document' : 'No documents'}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {search || typeFilter || langFilter
              ? (fr ? 'Aucun résultat pour ces filtres.' : 'No results for these filters.')
              : (fr ? 'Commencez par déposer un fichier ci-dessus.' : 'Start by dropping a file above.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              locale={locale}
              onDelete={handleDelete}
              aiSummariesEnabled={aiSummariesEnabled}
            />
          ))}
        </div>
      )}

      {/* Toast stack */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-md text-sm font-medium border animate-fade-in pointer-events-auto ${
              toast.type === 'success'
                ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
                : 'bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
