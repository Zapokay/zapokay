'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import {
  Zap,
  UserCheck,
  Info,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Users,
} from 'lucide-react';
import DirectorCard from '@/components/directors/DirectorCard';
import AddDirectorModal from '@/components/directors/AddDirectorModal';
import RemoveDirectorModal from '@/components/directors/RemoveDirectorModal';
import type {
  CompanyPerson,
  DirectorWithPerson,
  OfficerAppointment,
  Shareholding,
  ShareClass,
} from '@/lib/supabase/people-types';

export default function DirectorsClient() {
  const t = useTranslations('directors');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [directors, setDirectors] = useState<DirectorWithPerson[]>([]);
  const [officerAppointments, setOfficerAppointments] = useState<OfficerAppointment[]>([]);
  const [shareholdings, setShareholdings] = useState<(Shareholding & { share_class: ShareClass })[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDirector, setEditingDirector] = useState<DirectorWithPerson | null>(null);
  const [removingDirector, setRemovingDirector] = useState<DirectorWithPerson | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: companies } = await supabase
      .from('companies')
      .select('id, incorporation_date, incorporation_type')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!companies) { setLoading(false); return; }

    setCompanyId(companies.id);
    setIncorporationDate(companies.incorporation_date);
    setJurisdiction(companies.incorporation_type);
    const cid = companies.id;

    const { data: mandatesRaw } = await supabase
      .from('director_mandates')
      .select('*, person:company_people(*)')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('appointment_date', { ascending: true });

    setDirectors((mandatesRaw || []).map((row: any) => ({ ...row, person: row.person as CompanyPerson })));

    const { data: officersRaw } = await supabase
      .from('officer_appointments').select('*').eq('company_id', cid).eq('is_active', true);
    setOfficerAppointments((officersRaw as OfficerAppointment[]) || []);

    const { data: sharesRaw } = await supabase
      .from('shareholdings').select('*, share_class:share_classes(*)').eq('company_id', cid);
    setShareholdings((sharesRaw || []).map((row: any) => ({ ...row, share_class: row.share_class as ShareClass })));

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isCBCA = jurisdiction === 'CBCA';
  const totalDirectors = directors.length;
  const canadianDirectors = directors.filter((d) => d.person.is_canadian_resident).length;
  const residencyPct = totalDirectors > 0 ? Math.round((canadianDirectors / totalDirectors) * 100) : 0;
  const residencyOk = !isCBCA || residencyPct >= 25;
  const existingDirectorPersonIds = directors.map((d) => d.person_id);

  function getOfficerAppointmentsForPerson(personId: string) { return officerAppointments.filter((oa) => oa.person_id === personId); }
  function getShareholdingsForPerson(personId: string) { return shareholdings.filter((sh) => sh.person_id === personId); }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-[var(--text-muted)]">
            {locale === 'fr' ? "Conseil d'administration" : 'Board of Directors'}
          </p>
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="relative rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-body)]"
          >
            <Info className="h-4 w-4" />
            {showTooltip && (
              <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs text-[var(--text-body)] shadow-lg">
                {locale === 'fr'
                  ? "Les administrateurs forment le conseil d'administration. Ils supervisent la gestion de l'entreprise et prennent les décisions corporatives importantes."
                  : 'Directors form the board of directors. They oversee company management and make important corporate decisions.'}
              </div>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setEditingDirector(null); setShowAddModal(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-4 py-2 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
        >
          <Zap className="h-4 w-4" />
          {t('addDirector')}
        </button>
      </div>

      {/* Summary bar */}
      {totalDirectors > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-body)]">
            <Users className="h-4 w-4 text-[var(--text-muted)]" />
            {locale === 'fr'
              ? `${totalDirectors} administrateur${totalDirectors > 1 ? 's' : ''} actif${totalDirectors > 1 ? 's' : ''}`
              : `${totalDirectors} active director${totalDirectors > 1 ? 's' : ''}`}
          </div>
          {isCBCA && (
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${residencyOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {residencyOk ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {locale === 'fr' ? `Résidence canadienne : ${residencyPct}%` : `Canadian residency: ${residencyPct}%`}
              {residencyOk ? ' ✔' : locale === 'fr' ? ' — minimum 25% requis' : ' — 25% minimum required'}
            </div>
          )}
        </div>
      )}

      {/* Director cards / Empty state */}
      {totalDirectors > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {directors.map((director) => (
            <DirectorCard
              key={director.id}
              director={director}
              officerAppointments={getOfficerAppointmentsForPerson(director.person_id)}
              shareholdings={getShareholdingsForPerson(director.person_id)}
              onEdit={(d) => { setEditingDirector(d); setShowAddModal(true); }}
              onRemove={(d) => setRemovingDirector(d)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--card-border)] bg-[var(--page-bg)] px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--amber-100,#FFF8E7)]">
            <UserCheck className="h-7 w-7 text-[var(--amber-400)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-heading)]">
            {locale === 'fr' ? 'Aucun administrateur enregistré' : 'No directors registered'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
            {locale === 'fr'
              ? "Ajoutez les administrateurs de votre entreprise pour maintenir votre registre à jour et rester conforme."
              : 'Add your company directors to keep your register up to date and stay compliant.'}
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2.5 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
          >
            <Zap className="h-4 w-4" />
            {t('addDirector')}
          </button>
        </div>
      )}

      {/* Modals */}
      {showAddModal && companyId && (
        <AddDirectorModal
          companyId={companyId}
          incorporationDate={incorporationDate}
          existingDirectorPersonIds={existingDirectorPersonIds}
          onClose={() => { setShowAddModal(false); setEditingDirector(null); }}
          onSuccess={() => { setShowAddModal(false); fetchData(); }}
        />
      )}
      {removingDirector && (
        <RemoveDirectorModal
          director={removingDirector}
          onClose={() => setRemovingDirector(null)}
          onSuccess={() => { setRemovingDirector(null); fetchData(); }}
        />
      )}
    </div>
  );
}
