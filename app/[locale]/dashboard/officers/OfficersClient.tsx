'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { Zap, Briefcase, Info, Loader2 } from 'lucide-react';
import OfficerCard from '@/components/officers/OfficerCard';
import { LegalTerm } from '@/components/ui/LegalTerm';
import AddOfficerModal from '@/components/officers/AddOfficerModal';
import ReplaceOfficerModal from '@/components/officers/ReplaceOfficerModal';
import RemoveOfficerModal from '@/components/officers/RemoveOfficerModal';
import type {
  CompanyPerson,
  OfficerWithPerson,
  DirectorMandate,
  Shareholding,
  ShareClass,
} from '@/lib/supabase/people-types';

const ROLE_ORDER = ['president', 'vice_president', 'secretary', 'treasurer', 'custom'];

export default function OfficersClient() {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [officers, setOfficers] = useState<OfficerWithPerson[]>([]);
  const [directorMandates, setDirectorMandates] = useState<DirectorMandate[]>([]);
  const [shareholdings, setShareholdings] = useState<(Shareholding & { share_class: ShareClass })[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [replacingOfficer, setReplacingOfficer] = useState<OfficerWithPerson | null>(null);
  const [removingOfficer, setRemovingOfficer] = useState<OfficerWithPerson | null>(null);
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

    const { data: officersRaw } = await supabase
      .from('officer_appointments').select('*, person:company_people(*)')
      .eq('company_id', cid).eq('is_active', true).order('appointment_date', { ascending: true });
    setOfficers((officersRaw || []).map((row: any) => ({ ...row, person: row.person as CompanyPerson })));

    const { data: mandatesRaw } = await supabase
      .from('director_mandates').select('*').eq('company_id', cid).eq('is_active', true);
    setDirectorMandates((mandatesRaw as DirectorMandate[]) || []);

    const { data: sharesRaw } = await supabase
      .from('shareholdings').select('*, share_class:share_classes(*)').eq('company_id', cid);
    setShareholdings((sharesRaw || []).map((row: any) => ({ ...row, share_class: row.share_class as ShareClass })));

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sortedOfficers = [...officers].sort((a, b) => ROLE_ORDER.indexOf(a.title) - ROLE_ORDER.indexOf(b.title));

  function getDirectorMandatesForPerson(personId: string) { return directorMandates.filter((dm) => dm.person_id === personId); }
  function getShareholdingsForPerson(personId: string) { return shareholdings.filter((sh) => sh.person_id === personId); }

  function handleModalSuccess() {
    setShowAddModal(false);
    setReplacingOfficer(null);
    setRemovingOfficer(null);
    fetchData();
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            {locale === 'fr' ? 'Équipe de direction' : 'Management Team'}
          </h1>
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
                  ? "Les dirigeants sont nommés par le conseil d'administration. Le président supervise les affaires, le secrétaire tient les registres, et le trésorier gère les finances."
                  : 'Officers are appointed by the board of directors. The president oversees business affairs, the secretary maintains records, and the treasurer manages finances.'}
              </div>
            )}
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {sortedOfficers.length > 0
            ? locale === 'fr'
              ? `${sortedOfficers.length} dirigeant${sortedOfficers.length > 1 ? 's' : ''} nommé${sortedOfficers.length > 1 ? 's' : ''}`
              : `${sortedOfficers.length} officer${sortedOfficers.length > 1 ? 's' : ''} appointed`
            : locale === 'fr' ? 'Aucun dirigeant nommé' : 'No officers appointed'}
        </p>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div />
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-4 py-2 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
        >
          <Zap className="h-4 w-4" />
          {t('appointOfficer')}
        </button>
      </div>

      {sortedOfficers.length > 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          {locale === 'fr'
            ? "ℹ️ Une même personne peut occuper plusieurs postes. C'est très courant dans les petites entreprises."
            : 'ℹ️ The same person can hold multiple positions. This is very common in small businesses.'}
        </p>
      )}

      {sortedOfficers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedOfficers.map((officer) => (
            <OfficerCard
              key={officer.id}
              officer={officer}
              directorMandates={getDirectorMandatesForPerson(officer.person_id)}
              shareholdings={getShareholdingsForPerson(officer.person_id)}
              onEdit={() => setShowAddModal(true)}
              onReplace={(o) => setReplacingOfficer(o)}
              onRemove={(o) => setRemovingOfficer(o)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--card-border)] bg-[var(--page-bg)] px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--amber-100,#FFF8E7)]">
            <Briefcase className="h-7 w-7 text-[var(--amber-400)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-heading)]">
            {locale === 'fr'
              ? <>Aucun <LegalTerm termKey="dirigeant" lang="fr" /> nommé</>
              : <>No <LegalTerm termKey="dirigeant" lang="en" /> appointed</>}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
            {locale === 'fr'
              ? "Les dirigeants (président, secrétaire, trésorier) gèrent les opérations quotidiennes de l'entreprise."
              : 'Officers (president, secretary, treasurer) manage the day-to-day operations of the company.'}
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2.5 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
          >
            <Zap className="h-4 w-4" />
            {t('appointOfficer')}
          </button>
        </div>
      )}

      {showAddModal && companyId && (
        <AddOfficerModal
          companyId={companyId}
          incorporationDate={incorporationDate}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}
      {replacingOfficer && companyId && (
        <ReplaceOfficerModal
          officer={replacingOfficer}
          companyId={companyId}
          onClose={() => setReplacingOfficer(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {removingOfficer && (
        <RemoveOfficerModal
          officer={removingOfficer}
          onClose={() => setRemovingOfficer(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
