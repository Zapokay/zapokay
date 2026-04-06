'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { Zap, PieChart, Info, Loader2, Plus } from 'lucide-react';
import CapTableChart from '@/components/shareholders/CapTableChart';
import ShareClassCard from '@/components/shareholders/ShareClassCard';
import ShareholderCard from '@/components/shareholders/ShareholderCard';
import IssueSharesModal from '@/components/shareholders/IssueSharesModal';
import type {
  CompanyPerson,
  ShareClass,
  ShareholdingWithDetails,
  DirectorMandate,
  OfficerAppointment,
} from '@/lib/supabase/people-types';

export default function ShareholdersClient() {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [shareClasses, setShareClasses] = useState<ShareClass[]>([]);
  const [shareholdings, setShareholdings] = useState<ShareholdingWithDetails[]>([]);
  const [directorMandates, setDirectorMandates] = useState<DirectorMandate[]>([]);
  const [officerAppointments, setOfficerAppointments] = useState<OfficerAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: company } = await supabase
      .from('companies').select('id, incorporation_date').eq('user_id', user.id).limit(1).single();
    if (!company) { setLoading(false); return; }

    setCompanyId(company.id);
    setIncorporationDate(company.incorporation_date);
    const cid = company.id;

    const { data: classesRaw } = await supabase
      .from('share_classes').select('*').eq('company_id', cid).order('created_at', { ascending: true });
    setShareClasses((classesRaw as ShareClass[]) || []);

    const { data: shRaw } = await supabase
      .from('shareholdings').select('*, person:company_people(*), share_class:share_classes(*)')
      .eq('company_id', cid).order('issue_date', { ascending: true });
    setShareholdings((shRaw || []).map((row: any) => ({
      ...row, person: row.person as CompanyPerson, share_class: row.share_class as ShareClass,
    })));

    const { data: mandatesRaw } = await supabase
      .from('director_mandates').select('*').eq('company_id', cid).eq('is_active', true);
    setDirectorMandates((mandatesRaw as DirectorMandate[]) || []);

    const { data: officersRaw } = await supabase
      .from('officer_appointments').select('*').eq('company_id', cid).eq('is_active', true);
    setOfficerAppointments((officersRaw as OfficerAppointment[]) || []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalIssued = useMemo(() => shareholdings.reduce((sum, s) => sum + s.quantity, 0), [shareholdings]);

  const shareholdingsByPerson = useMemo(() => {
    const map = new Map<string, ShareholdingWithDetails[]>();
    shareholdings.forEach((sh) => { const list = map.get(sh.person_id) || []; list.push(sh); map.set(sh.person_id, list); });
    return map;
  }, [shareholdings]);

  const shareholderPersonIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    shareholdings.forEach((sh) => { if (!seen.has(sh.person_id)) { seen.add(sh.person_id); ids.push(sh.person_id); } });
    return ids;
  }, [shareholdings]);

  const nextCertificateNumber = useMemo(() => {
    let max = 0;
    shareholdings.forEach((sh) => {
      if (sh.certificate_number) { const num = parseInt(sh.certificate_number, 10); if (!isNaN(num) && num > max) max = num; }
    });
    return max + 1;
  }, [shareholdings]);

  function getDirectorMandatesForPerson(personId: string) { return directorMandates.filter((dm) => dm.person_id === personId); }
  function getOfficerAppointmentsForPerson(personId: string) { return officerAppointments.filter((oa) => oa.person_id === personId); }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>;
  }

  const hasShareholders = shareholdings.length > 0;

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-[var(--text-muted)]">
            {locale === 'fr' ? 'Structure du capital' : 'Capital Structure'}
          </p>
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="relative rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-body)]"
          >
            <Info className="h-4 w-4" />
            {showTooltip && (
              <div className="absolute left-6 top-0 z-40 w-80 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs text-[var(--text-body)] shadow-lg">
                {locale === 'fr'
                  ? "Les actionnaires sont les propriétaires de l'entreprise. Le registre des actionnaires et le tableau de capitalisation sont des documents légaux essentiels."
                  : 'Shareholders are the owners of the company. The shareholder register and cap table are essential legal documents.'}
              </div>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowIssueModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-4 py-2 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
        >
          <Zap className="h-4 w-4" />
          {t('issueShares')}
        </button>
      </div>

      {hasShareholders ? (
        <>
          <CapTableChart shareholdings={shareholdings} totalIssued={totalIssued} />

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {locale === 'fr' ? "Classes d'actions" : 'Share Classes'}
            </h3>
            <div className="space-y-2">
              {shareClasses.map((sc) => (
                <ShareClassCard key={sc.id} shareClass={sc} onEdit={() => {}} />
              ))}
              <button
                type="button" disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] opacity-60"
                title={locale === 'fr' ? 'Bientôt disponible' : 'Coming soon'}
              >
                <Plus className="h-3.5 w-3.5" />
                {locale === 'fr' ? 'Ajouter une classe' : 'Add a class'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {locale === 'fr' ? 'Actionnaires' : 'Shareholders'}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {shareholderPersonIds.map((personId) => (
                <ShareholderCard
                  key={personId}
                  shareholdings={shareholdingsByPerson.get(personId) || []}
                  totalIssuedShares={totalIssued}
                  directorMandates={getDirectorMandatesForPerson(personId)}
                  officerAppointments={getOfficerAppointmentsForPerson(personId)}
                  onEdit={() => {}}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--card-border)] bg-[var(--page-bg)] px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--amber-100,#FFF8E7)]">
            <PieChart className="h-7 w-7 text-[var(--amber-400)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-heading)]">
            {locale === 'fr' ? 'Aucun actionnaire enregistré' : 'No shareholders registered'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
            {locale === 'fr'
              ? "Enregistrez les actionnaires de votre entreprise pour créer votre tableau de capitalisation."
              : 'Register your company shareholders to create your cap table.'}
          </p>
          <button
            type="button"
            onClick={() => setShowIssueModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2.5 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
          >
            <Zap className="h-4 w-4" />
            {t('issueShares')}
          </button>
        </div>
      )}

      {!hasShareholders && shareClasses.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {locale === 'fr' ? "Classes d'actions disponibles" : 'Available Share Classes'}
          </h3>
          <div className="space-y-2">
            {shareClasses.map((sc) => <ShareClassCard key={sc.id} shareClass={sc} onEdit={() => {}} />)}
          </div>
        </div>
      )}

      {showIssueModal && companyId && (
        <IssueSharesModal
          companyId={companyId}
          incorporationDate={incorporationDate}
          shareClasses={shareClasses}
          nextCertificateNumber={nextCertificateNumber}
          onClose={() => setShowIssueModal(false)}
          onSuccess={() => { setShowIssueModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}
