'use client';
import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { YearPicker } from '@/components/ui/YearPicker';
import { DocumentRow, type VaultDocument } from '@/components/documents/DocumentRow';
import { UploadZone } from '@/components/documents/UploadZone';
import { useToasts } from '@/components/ui/Toasts';
import { filePathFromFileUrl } from '@/lib/storage-path';
import { logActivity } from '@/lib/activity-log';
import { titresDeJournalSuppression } from '@/lib/journal-document';
import type { Company } from '@/lib/types';
import SectionCard from '@/components/minute-book/SectionCard';
import { porteeDepuisParametre, dansLaPortee, resumeDeLaListe } from '@/lib/documents/list-summary';

interface DocumentsClientProps {
  locale: string;
  company: Company | null;
  initialDocuments: VaultDocument[];
  /** A6 — les liaisons couvertes, par document_id. Lu sur requirement_documents.
   *  VISUEL-1 — chaque liaison porte son année ; `year: null` = fondationnelle. */
  requirementKeysByDocument: Record<string, { key: string; year: number | null }[]>;
  /** VISUEL-1 — libellés du catalogue, filtrés par régime. Clé absente = pas de
   *  libellé dans CE régime ; l'affichage retombe alors sur la clé brute. */
  requirementTitles?: Record<string, { fr: string; en: string }>;
  fiscalYearsConfigured?: boolean;
  activeFiscalYears?: number[];
  /**
   * LES EXERCICES SUIVIS — ceux que le sélecteur offre.
   *
   * ⚖️ DÉCISION DE DOM, 2026-09-19 : le sélecteur d'exercice se place ENTRE le
   * champ « Rechercher… » et « Plus récent ». ★ PARCE QUE C'EST UN FILTRE, et
   * que la rangée est l'endroit des filtres. Le haut de page, où il a passé
   * une journée, était un choix de MOINDRE SURPRISE en attendant celui-ci.
   *
   * ⛔ IL A DÛ DESCENDRE D'UN CRAN DE PLUS QUE PRÉVU : la rangée vit ici, pas
   * dans `page.tsx`. La page continue de lire `company_fiscal_years` — c'est
   * une lecture serveur — et passe la liste en prop.
   *
   * ⭐ ET CE DÉPLACEMENT RÉUNIT LE CONTRÔLE AVEC CE QU'IL PILOTE. Le filtre
   * d'année vivait DÉJÀ ici : `searchParams.get('year')` le lit, `filtered` le
   * calcule, le sous-titre le résume. Seul le contrôle était ailleurs.
   * ⚠️ MAIS ÇA NE SIMPLIFIE PAS LE MÉCANISME, ET IL NE FAUT PAS LE PRÉTENDRE :
   * le sélecteur écrit toujours `?year=` dans l'URL, et ce composant l'y relit.
   * Le canal reste l'URL — et il DOIT le rester, pour qu'un lien mis en signet
   * continue de fonctionner. Ce qui gagne, c'est la LOCALITÉ, pas le nombre de
   * pièces.
   */
  fiscalYears?: number[];
  /** User's preferred language from users.preferred_language — seeds the upload form's Language field. */
  preferredLanguage?: 'fr' | 'en';
}

// V3 — les libellés viennent du catalogue ; mots IDENTIQUES à ceux qui étaient codés ici (vérifié FR et EN).
const TYPE_OPTIONS = [
  { value: '',           key: 'filterAllTypes' },
  { value: 'statuts',    key: 'types.statuts' },
  { value: 'resolution', key: 'types.resolution' },
  { value: 'pv',         key: 'types.pv' },
  { value: 'registre',   key: 'types.registre' },
  { value: 'rapport',    key: 'types.rapport' },
  { value: 'autre',      key: 'types.autre' },
] as const;

const LANG_OPTIONS = [
  { value: '',          key: 'filterAllLanguages' },
  { value: 'fr',        key: 'languages.fr' },
  { value: 'en',        key: 'languages.en' },
  { value: 'bilingual', key: 'languages.bilingual' },
] as const;

function DocumentsClientInner({ locale, company, initialDocuments, requirementKeysByDocument, requirementTitles = {}, fiscalYearsConfigured = true, activeFiscalYears = [], fiscalYears = [], preferredLanguage = 'fr' }: DocumentsClientProps) {
  const fr = locale === 'fr';
  const tDocs = useTranslations('documents');
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const yearParam = searchParams.get('year');
  // TROIS modes de filtre : 'all' (aucun filtre, défaut), 'nofiscalyear', ou une
  // année numérique. Ils étaient QUATRE : « Documents fondateurs » et « Non classé »
  // se chevauchaient sans jamais coïncider, et fusionnent en « Hors exercice ».
  // ⚠️ LES DEUX ANCIENNES VALEURS D'URL RESTENT ACCEPTÉES, ET DOIVENT LE RESTER.
  // Un lien mis en signet sur `?year=foundational` ou `?year=unclassified` doit
  // atterrir sur ce mode — jamais retomber en silence sur « Tous les exercices »,
  // ce qui montrerait plus de documents que demandé sans rien dire.
  // V3 — la règle a déménagé, INCHANGÉE, dans lib/documents/list-summary.ts (lue aussi par check:documents).
  const portee = porteeDepuisParametre(yearParam);
  const [documents, setDocuments] = useState<VaultDocument[]>(initialDocuments);

  // Sync local state when server re-renders with fresh data (after router.refresh())
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [typeFilter, setTypeFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const { addToast, ToastStack } = useToasts();
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

  const fetchDocuments = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as VaultDocument[]);
  }, [company?.id, supabase]);

  function handleUploadComplete() {
    fetchDocuments();
    router.refresh();
    addToast(
      tDocs('toastAdded'),
      'success'
    );
  }

  function handleUploadError(message: string) {
    addToast(message, 'error');
  }

  async function handleDelete(id: string) {
    const doc = documents.find(d => d.id === id);

    // Remove from storage if we can extract the path
    const storagePath = filePathFromFileUrl(doc?.file_url);
    if (storagePath) {
      try {
        await supabase.storage.from('documents').remove([storagePath]);
      } catch {
        // Storage remove failed — proceed with DB delete anyway
      }
    }

    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) {
      addToast(
        tDocs('toastDeleteError'),
        'error'
      );
    } else {
      // ★ LE REGISTRE S'INSCRIT ICI, ET NULLE PART AILLEURS SUR CE CHEMIN.
      // APRÈS la suppression de la LIGNE, donc jamais sur un échec : une entrée
      // qui dit « supprimé » alors que la ligne est restée serait un mensonge.
      // ⚪ EN REVANCHE ELLE S'ÉCRIT MÊME SI LE RETRAIT DU FICHIER A ÉCHOUÉ
      // ci-dessus, et c'est une DÉCISION, pas un oubli : le geste de
      // l'utilisateur a bien eu lieu et le document a bien quitté le livre. Un
      // objet de stockage orphelin est un autre problème, qui a ses propres
      // mesures — le taire ici ferait disparaître le geste du registre.
      // ⛔ LE TITRE EST GELÉ MAINTENANT, dans les DEUX langues : à la lecture,
      // la ligne `documents` n'existera plus et rien ne pourra le recomposer.
      const { titleFr, titleEn } = titresDeJournalSuppression(doc?.title);
      const { data: { user } } = await supabase.auth.getUser();
      if (user && company) {
        await logActivity(supabase, company.id, user.id, 'document_deleted', titleFr, titleEn, {
          document_id: id,
          document_type: doc?.document_type ?? null,
          language: doc?.language ?? null,
          document_year: doc?.document_year ?? null,
        });
      }
      setDocuments(prev => prev.filter(d => d.id !== id));
      addToast(tDocs('toastDeleted'), 'success');
    }
  }

  const filtered = documents
    .filter(doc => {
      const matchSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase());
      const matchType   = !typeFilter || doc.document_type === typeFilter;
      const matchLang   = !langFilter || doc.language === langFilter;
      // ★ « Hors exercice » = document_year null, UN seul prédicat (fusion des deux
      // anciennes puces, mesurée) — il vit maintenant dans dansLaPortee.
      const matchYear   = dansLaPortee(doc.document_year, portee);

      return matchSearch && matchType && matchLang && matchYear;
    })
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === 'desc' ? -diff : diff;
    });

  // ⚖️ V3, décision P2 : M = la portée d'exercice ; N = affichés. Aucune requête : tout est déjà en mémoire.
  const resume = resumeDeLaListe({
    portee,
    totalCoffre: documents.length,
    totalPortee: documents.filter(d => dansLaPortee(d.document_year, portee)).length,
    affiches: filtered.length,
    locale,
    t: tDocs as unknown as (cle: string, valeurs?: Record<string, number>) => string,
  });

  const selectClass =
    'px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors';

  return (
    <div className="space-y-6">

      {/* Bannière exercices non configurés */}
      {!fiscalYearsConfigured && (
        <div style={{
          background: '#F5EEEE',
          border: '1px solid #C9A5A5',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: 700, color: 'var(--error-text)', marginBottom: '2px' }}>
                {fr ? 'Exercices financiers non configurés' : 'Fiscal Years not configured'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--error-text)', opacity: 0.8 }}>
                {fr
                  ? 'Configurez vos exercices pour activer le filtre par année.'
                  : 'Configure your fiscal years to enable year filtering.'}
              </div>
            </div>
          </div>
          <a
            href={`/${locale}/dashboard/settings`}
            style={{ background: '#6B1E1E', color: 'white', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: '16px' }}
          >
            {fr ? 'Configurer →' : 'Configure →'}
          </a>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-bold text-[var(--text-heading)]"
          style={{ fontFamily: 'Sora, sans-serif' }}
        >
          {tDocs('vaultTitle')}
        </h1>
        {/* V3 — le sous-titre composé a quitté le H1 : son information vit dans l'en-tête de la carte. */}
      </div>

      {/* Upload zone */}
      {company && (
        <UploadZone
          companyId={company.id}
          framework={framework}
          locale={locale}
          activeFiscalYears={activeFiscalYears}
          onUploadComplete={handleUploadComplete}
          onError={handleUploadError}
          preferredLanguage={preferredLanguage}
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
            placeholder={tDocs('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
          />
        </div>
        {/* ⚖️ LE SÉLECTEUR D'EXERCICE, ENTRE « Rechercher… » ET « Plus récent » —
            décision de Dom, 2026-09-19. C'est un FILTRE, et voici la rangée des
            filtres ; il y est maintenant à côté du filtrage qu'il pilote.
            ⚪ Il garde sa propre `<Suspense>` interne (voir YearPicker) et écrit
            dans l'URL, comme avant : rien de son mécanisme ne change. */}
        {fiscalYears.length > 0 && (
          <YearPicker locale={locale} years={fiscalYears} includeUnclassifiedOption className={selectClass} />
        )}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectClass}>
          {TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{tDocs(o.key)}</option>
          ))}
        </select>
        <select value={langFilter} onChange={e => setLangFilter(e.target.value)} className={selectClass}>
          {LANG_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{tDocs(o.key)}</option>
          ))}
        </select>
        {/* D11 (V4) — le tri ferme la rangée, après un filet : il ordonne ce que les filtres ont retenu. */}
        <span aria-hidden="true" className="hidden sm:block w-px self-stretch bg-[var(--card-border)]" />
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')} className={selectClass}>
          <option value="desc">{tDocs('sortNewest')}</option>
          <option value="asc">{tDocs('sortOldest')}</option>
        </select>
      </div>

      {/* Document list — V3 : UNE carte (SectionCard non repliable), en-tête = portée + compte. */}
      <SectionCard title={resume.titre} metric={resume.compte} collapsible={false}>
      {resume.vide ? (
        // ⚖️ D6 : l'encadré pointillé est retiré ; l'icône et les deux phrases restent, mot pour mot.
        <div className="text-center py-16">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium text-[var(--text-muted)]">
            {tDocs('emptyVault')}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {resume.vide === 'aucunResultat' ? tDocs('noResults') : tDocs('emptyVaultSub')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--card-border)] [&>div:last-child>div:first-child]:rounded-b-[13px]">
          {filtered.map(doc => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              locale={locale}
              onDelete={handleDelete}
              aiSummariesEnabled={aiSummariesEnabled}
              coverageCount={(requirementKeysByDocument[doc.id] ?? []).length}
              coverageLinks={requirementKeysByDocument[doc.id] ?? []}
              requirementTitles={requirementTitles}
            />
          ))}
        </div>
      )}
      </SectionCard>

      {/* Toast stack */}
      {ToastStack}
    </div>
  );
}

export function DocumentsClient(props: DocumentsClientProps) {
  return (
    <Suspense fallback={null}>
      <DocumentsClientInner {...props} />
    </Suspense>
  );
}
