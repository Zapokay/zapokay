#!/usr/bin/env bash
# =============================================================================
# ZapOkay — Sprint 6 "People & Ownership"
# Run this script from the ROOT of your Next.js project.
# =============================================================================
set -e

echo "⚡ Creating Sprint 6 files..."


# ---------------------------------------------------------------------------
# app/[locale]/dashboard/directors/page.tsx
# ---------------------------------------------------------------------------
mkdir -p "app/[locale]/dashboard/directors"
cat << 'EOF' > "app/[locale]/dashboard/directors/page.tsx"
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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

// =============================================================================
// Page component
// =============================================================================

export default function DirectorsPage() {
  const t = useTranslations('directors');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null); // 'federal' | province code
  const [directors, setDirectors] = useState<DirectorWithPerson[]>([]);
  const [officerAppointments, setOfficerAppointments] = useState<OfficerAppointment[]>([]);
  const [shareholdings, setShareholdings] = useState<
    (Shareholding & { share_class: ShareClass })[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDirector, setEditingDirector] = useState<DirectorWithPerson | null>(null);
  const [removingDirector, setRemovingDirector] = useState<DirectorWithPerson | null>(null);

  // Tooltip
  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Fetch data -----------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);

    // 1. Get current company for this user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: companies } = await supabase
      .from('companies')
      .select('id, incorporation_date, jurisdiction')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!companies) {
      setLoading(false);
      return;
    }

    setCompanyId(companies.id);
    setIncorporationDate(companies.incorporation_date);
    setJurisdiction(companies.jurisdiction);

    const cid = companies.id;

    // 2. Fetch active director mandates joined with people
    const { data: mandatesRaw } = await supabase
      .from('director_mandates')
      .select('*, person:company_people(*)')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('appointment_date', { ascending: true });

    const dirs: DirectorWithPerson[] = (mandatesRaw || []).map((row: any) => ({
      ...row,
      person: row.person as CompanyPerson,
    }));
    setDirectors(dirs);

    // 3. Fetch active officer appointments (for "Aussi" line)
    const { data: officersRaw } = await supabase
      .from('officer_appointments')
      .select('*')
      .eq('company_id', cid)
      .eq('is_active', true);
    setOfficerAppointments((officersRaw as OfficerAppointment[]) || []);

    // 4. Fetch shareholdings with share class (for "Aussi" line)
    const { data: sharesRaw } = await supabase
      .from('shareholdings')
      .select('*, share_class:share_classes(*)')
      .eq('company_id', cid);
    setShareholdings(
      (sharesRaw || []).map((row: any) => ({
        ...row,
        share_class: row.share_class as ShareClass,
      }))
    );

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Computed -------------------------------------------------------------
  const isCBCA = jurisdiction === 'federal';
  const totalDirectors = directors.length;
  const canadianDirectors = directors.filter(
    (d) => d.person.is_canadian_resident
  ).length;
  const residencyPct =
    totalDirectors > 0 ? Math.round((canadianDirectors / totalDirectors) * 100) : 0;
  const residencyOk = !isCBCA || residencyPct >= 25;

  const existingDirectorPersonIds = directors.map((d) => d.person_id);

  // Helpers to get roles for a specific person
  function getOfficerAppointmentsForPerson(personId: string) {
    return officerAppointments.filter((oa) => oa.person_id === personId);
  }
  function getShareholdingsForPerson(personId: string) {
    return shareholdings.filter((sh) => sh.person_id === personId);
  }

  // ---- Handlers -------------------------------------------------------------
  function handleAddSuccess() {
    setShowAddModal(false);
    fetchData();
  }

  function handleRemoveSuccess() {
    setRemovingDirector(null);
    fetchData();
  }

  function handleEdit(director: DirectorWithPerson) {
    // For now, re-use the Add modal in edit mode (could be a separate EditDirectorModal)
    setEditingDirector(director);
    setShowAddModal(true);
  }

  // ---- Loading state --------------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      {/* ── Topbar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {t('title')}
            </h1>
            {/* Info tooltip trigger */}
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="relative rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <Info className="h-4 w-4" />
              {showTooltip && (
                <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  {locale === 'fr'
                    ? "Les administrateurs forment le conseil d'administration. Ils supervisent la gestion de l'entreprise et prennent les décisions corporatives importantes."
                    : 'Directors form the board of directors. They oversee company management and make important corporate decisions.'}
                </div>
              )}
            </button>
          </div>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? "Conseil d'administration" : 'Board of Directors'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingDirector(null);
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          <Zap className="h-4 w-4" />
          {t('addDirector')}
        </button>
      </div>

      {/* ── Summary bar ── */}
      {totalDirectors > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
          {/* Count */}
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <Users className="h-4 w-4 text-zinc-400" />
            {locale === 'fr'
              ? `${totalDirectors} administrateur${totalDirectors > 1 ? 's' : ''} actif${totalDirectors > 1 ? 's' : ''}`
              : `${totalDirectors} active director${totalDirectors > 1 ? 's' : ''}`}
          </div>

          {/* CBCA residency badge */}
          {isCBCA && (
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                residencyOk
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {residencyOk ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {locale === 'fr'
                ? `Résidence canadienne : ${residencyPct}%`
                : `Canadian residency: ${residencyPct}%`}
              {residencyOk
                ? ' ✔'
                : locale === 'fr'
                  ? ' — minimum 25% requis'
                  : ' — 25% minimum required'}
            </div>
          )}
        </div>
      )}

      {/* ── Director cards ── */}
      {totalDirectors > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {directors.map((director) => (
            <DirectorCard
              key={director.id}
              director={director}
              officerAppointments={getOfficerAppointmentsForPerson(director.person_id)}
              shareholdings={getShareholdingsForPerson(director.person_id)}
              onEdit={handleEdit}
              onRemove={(d) => setRemovingDirector(d)}
            />
          ))}
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-800/20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <UserCheck className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {locale === 'fr'
              ? 'Aucun administrateur enregistré'
              : 'No directors registered'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? "Ajoutez les administrateurs de votre entreprise pour maintenir votre registre à jour et rester conforme."
              : 'Add your company directors to keep your register up to date and stay compliant.'}
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            <Zap className="h-4 w-4" />
            {t('addDirector')}
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {showAddModal && companyId && (
        <AddDirectorModal
          companyId={companyId}
          incorporationDate={incorporationDate}
          existingDirectorPersonIds={existingDirectorPersonIds}
          onClose={() => {
            setShowAddModal(false);
            setEditingDirector(null);
          }}
          onSuccess={handleAddSuccess}
        />
      )}

      {removingDirector && (
        <RemoveDirectorModal
          director={removingDirector}
          onClose={() => setRemovingDirector(null)}
          onSuccess={handleRemoveSuccess}
        />
      )}
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# app/[locale]/dashboard/officers/page.tsx
# ---------------------------------------------------------------------------
mkdir -p "app/[locale]/dashboard/officers"
cat << 'EOF' > "app/[locale]/dashboard/officers/page.tsx"
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import {
  Zap,
  Briefcase,
  Info,
  Loader2,
} from 'lucide-react';
import OfficerCard from '@/components/officers/OfficerCard';
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

// =============================================================================
// Role display order
// =============================================================================

const ROLE_ORDER = ['president', 'vice_president', 'secretary', 'treasurer', 'custom'];

// =============================================================================
// Page component
// =============================================================================

export default function OfficersPage() {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [officers, setOfficers] = useState<OfficerWithPerson[]>([]);
  const [directorMandates, setDirectorMandates] = useState<DirectorMandate[]>([]);
  const [shareholdings, setShareholdings] = useState<
    (Shareholding & { share_class: ShareClass })[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [replacingOfficer, setReplacingOfficer] = useState<OfficerWithPerson | null>(null);
  const [removingOfficer, setRemovingOfficer] = useState<OfficerWithPerson | null>(null);

  // Tooltip
  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Fetch data -----------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: company } = await supabase
      .from('companies')
      .select('id, incorporation_date')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!company) {
      setLoading(false);
      return;
    }

    setCompanyId(company.id);
    setIncorporationDate(company.incorporation_date);
    const cid = company.id;

    // Active officer appointments with person
    const { data: officersRaw } = await supabase
      .from('officer_appointments')
      .select('*, person:company_people(*)')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('appointment_date', { ascending: true });

    const offs: OfficerWithPerson[] = (officersRaw || []).map((row: any) => ({
      ...row,
      person: row.person as CompanyPerson,
    }));
    setOfficers(offs);

    // Active director mandates (for "Aussi" line)
    const { data: mandatesRaw } = await supabase
      .from('director_mandates')
      .select('*')
      .eq('company_id', cid)
      .eq('is_active', true);
    setDirectorMandates((mandatesRaw as DirectorMandate[]) || []);

    // Shareholdings (for "Aussi" line)
    const { data: sharesRaw } = await supabase
      .from('shareholdings')
      .select('*, share_class:share_classes(*)')
      .eq('company_id', cid);
    setShareholdings(
      (sharesRaw || []).map((row: any) => ({
        ...row,
        share_class: row.share_class as ShareClass,
      }))
    );

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Sort officers by role order ------------------------------------------
  const sortedOfficers = [...officers].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.title);
    const bi = ROLE_ORDER.indexOf(b.title);
    return ai - bi;
  });

  // ---- Helpers for cross-role data ------------------------------------------
  function getDirectorMandatesForPerson(personId: string) {
    return directorMandates.filter((dm) => dm.person_id === personId);
  }
  function getShareholdingsForPerson(personId: string) {
    return shareholdings.filter((sh) => sh.person_id === personId);
  }

  // ---- Handlers -------------------------------------------------------------
  function handleModalSuccess() {
    setShowAddModal(false);
    setReplacingOfficer(null);
    setRemovingOfficer(null);
    fetchData();
  }

  function handleEdit(officer: OfficerWithPerson) {
    // Re-use add modal in "edit" mode (simplified: open add modal)
    // A full EditOfficerModal could be added later
    setShowAddModal(true);
  }

  // ---- Loading state --------------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      {/* ── Topbar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {t('title')}
            </h1>
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="relative rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <Info className="h-4 w-4" />
              {showTooltip && (
                <div className="absolute left-6 top-0 z-40 w-80 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  {locale === 'fr'
                    ? "Les dirigeants sont nommés par le conseil d'administration. Le président supervise les affaires, le secrétaire tient les registres, et le trésorier gère les finances."
                    : 'Officers are appointed by the board of directors. The president oversees business affairs, the secretary maintains records, and the treasurer manages finances.'}
                </div>
              )}
            </button>
          </div>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? 'Équipe de direction' : 'Management Team'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          <Zap className="h-4 w-4" />
          {t('appointOfficer')}
        </button>
      </div>

      {/* ── UX note ── */}
      {sortedOfficers.length > 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {locale === 'fr'
            ? 'ℹ️ Une même personne peut occuper plusieurs postes. C'est très courant dans les petites entreprises.'
            : 'ℹ️ The same person can hold multiple positions. This is very common in small businesses.'}
        </p>
      )}

      {/* ── Officer cards ── */}
      {sortedOfficers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedOfficers.map((officer) => (
            <OfficerCard
              key={officer.id}
              officer={officer}
              directorMandates={getDirectorMandatesForPerson(officer.person_id)}
              shareholdings={getShareholdingsForPerson(officer.person_id)}
              onEdit={handleEdit}
              onReplace={(o) => setReplacingOfficer(o)}
              onRemove={(o) => setRemovingOfficer(o)}
            />
          ))}
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-800/20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Briefcase className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {locale === 'fr' ? 'Aucun dirigeant nommé' : 'No officers appointed'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? 'Les dirigeants (président, secrétaire, trésorier) gèrent les opérations quotidiennes de l'entreprise.'
              : 'Officers (president, secretary, treasurer) manage the day-to-day operations of the company.'}
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            <Zap className="h-4 w-4" />
            {t('appointOfficer')}
          </button>
        </div>
      )}

      {/* ── Modals ── */}
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

EOF

# ---------------------------------------------------------------------------
# app/[locale]/dashboard/shareholders/page.tsx
# ---------------------------------------------------------------------------
mkdir -p "app/[locale]/dashboard/shareholders"
cat << 'EOF' > "app/[locale]/dashboard/shareholders/page.tsx"
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import {
  Zap,
  PieChart,
  Info,
  Loader2,
  Plus,
} from 'lucide-react';
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

// =============================================================================
// Page component
// =============================================================================

export default function ShareholdersPage() {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [shareClasses, setShareClasses] = useState<ShareClass[]>([]);
  const [shareholdings, setShareholdings] = useState<ShareholdingWithDetails[]>([]);
  const [directorMandates, setDirectorMandates] = useState<DirectorMandate[]>([]);
  const [officerAppointments, setOfficerAppointments] = useState<OfficerAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showIssueModal, setShowIssueModal] = useState(false);

  // Tooltip
  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Fetch ----------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: company } = await supabase
      .from('companies')
      .select('id, incorporation_date')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!company) {
      setLoading(false);
      return;
    }

    setCompanyId(company.id);
    setIncorporationDate(company.incorporation_date);
    const cid = company.id;

    // Share classes
    const { data: classesRaw } = await supabase
      .from('share_classes')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: true });
    setShareClasses((classesRaw as ShareClass[]) || []);

    // Shareholdings with person + share class
    const { data: shRaw } = await supabase
      .from('shareholdings')
      .select('*, person:company_people(*), share_class:share_classes(*)')
      .eq('company_id', cid)
      .order('issue_date', { ascending: true });

    const holdings: ShareholdingWithDetails[] = (shRaw || []).map((row: any) => ({
      ...row,
      person: row.person as CompanyPerson,
      share_class: row.share_class as ShareClass,
    }));
    setShareholdings(holdings);

    // Director mandates (for "Aussi" line)
    const { data: mandatesRaw } = await supabase
      .from('director_mandates')
      .select('*')
      .eq('company_id', cid)
      .eq('is_active', true);
    setDirectorMandates((mandatesRaw as DirectorMandate[]) || []);

    // Officer appointments (for "Aussi" line)
    const { data: officersRaw } = await supabase
      .from('officer_appointments')
      .select('*')
      .eq('company_id', cid)
      .eq('is_active', true);
    setOfficerAppointments((officersRaw as OfficerAppointment[]) || []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Computed -------------------------------------------------------------
  const totalIssued = useMemo(
    () => shareholdings.reduce((sum, s) => sum + s.quantity, 0),
    [shareholdings]
  );

  // Group shareholdings by person_id
  const shareholdingsByPerson = useMemo(() => {
    const map = new Map<string, ShareholdingWithDetails[]>();
    shareholdings.forEach((sh) => {
      const list = map.get(sh.person_id) || [];
      list.push(sh);
      map.set(sh.person_id, list);
    });
    return map;
  }, [shareholdings]);

  // Unique shareholder person IDs in order of first holding
  const shareholderPersonIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    shareholdings.forEach((sh) => {
      if (!seen.has(sh.person_id)) {
        seen.add(sh.person_id);
        ids.push(sh.person_id);
      }
    });
    return ids;
  }, [shareholdings]);

  // Next certificate number
  const nextCertificateNumber = useMemo(() => {
    let max = 0;
    shareholdings.forEach((sh) => {
      if (sh.certificate_number) {
        const num = parseInt(sh.certificate_number, 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
    return max + 1;
  }, [shareholdings]);

  // Helpers
  function getDirectorMandatesForPerson(personId: string) {
    return directorMandates.filter((dm) => dm.person_id === personId);
  }
  function getOfficerAppointmentsForPerson(personId: string) {
    return officerAppointments.filter((oa) => oa.person_id === personId);
  }

  // ---- Handlers -------------------------------------------------------------
  function handleIssueSuccess() {
    setShowIssueModal(false);
    fetchData();
  }

  function handleEditShareClass(_sc: ShareClass) {
    // TODO: EditShareClassModal (future)
  }

  function handleEditShareholding(_sh: ShareholdingWithDetails) {
    // TODO: EditShareholdingModal (future)
  }

  // ---- Loading --------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const hasShareholders = shareholdings.length > 0;

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      {/* ── Topbar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {t('title')}
            </h1>
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="relative rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <Info className="h-4 w-4" />
              {showTooltip && (
                <div className="absolute left-6 top-0 z-40 w-80 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  {locale === 'fr'
                    ? "Les actionnaires sont les propriétaires de l'entreprise. Le registre des actionnaires et le tableau de capitalisation sont des documents légaux essentiels."
                    : 'Shareholders are the owners of the company. The shareholder register and cap table are essential legal documents.'}
                </div>
              )}
            </button>
          </div>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? 'Structure du capital' : 'Capital Structure'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowIssueModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          <Zap className="h-4 w-4" />
          {t('issueShares')}
        </button>
      </div>

      {hasShareholders ? (
        <>
          {/* ── Cap table chart ── */}
          <CapTableChart
            shareholdings={shareholdings}
            totalIssued={totalIssued}
          />

          {/* ── Share classes section ── */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              {locale === 'fr' ? "Classes d'actions" : 'Share Classes'}
            </h3>
            <div className="space-y-2">
              {shareClasses.map((sc) => (
                <ShareClassCard
                  key={sc.id}
                  shareClass={sc}
                  onEdit={handleEditShareClass}
                />
              ))}
              {/* Ghost button: add share class */}
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-400 opacity-60 dark:border-zinc-700"
                title={locale === 'fr' ? 'Bientôt disponible' : 'Coming soon'}
              >
                <Plus className="h-3.5 w-3.5" />
                {locale === 'fr' ? 'Ajouter une classe' : 'Add a class'}
              </button>
            </div>
          </div>

          {/* ── Shareholder cards ── */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              {locale === 'fr' ? 'Actionnaires' : 'Shareholders'}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {shareholderPersonIds.map((personId) => {
                const personShareholdings = shareholdingsByPerson.get(personId) || [];
                return (
                  <ShareholderCard
                    key={personId}
                    shareholdings={personShareholdings}
                    totalIssuedShares={totalIssued}
                    directorMandates={getDirectorMandatesForPerson(personId)}
                    officerAppointments={getOfficerAppointmentsForPerson(personId)}
                    onEdit={handleEditShareholding}
                  />
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-800/20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <PieChart className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {locale === 'fr'
              ? 'Aucun actionnaire enregistré'
              : 'No shareholders registered'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? "Enregistrez les actionnaires de votre entreprise pour créer votre tableau de capitalisation."
              : 'Register your company shareholders to create your cap table.'}
          </p>
          <button
            type="button"
            onClick={() => setShowIssueModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            <Zap className="h-4 w-4" />
            {t('issueShares')}
          </button>
        </div>
      )}

      {/* ── Share classes note (visible even on empty if classes exist) ── */}
      {!hasShareholders && shareClasses.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            {locale === 'fr' ? "Classes d'actions disponibles" : 'Available Share Classes'}
          </h3>
          <div className="space-y-2">
            {shareClasses.map((sc) => (
              <ShareClassCard
                key={sc.id}
                shareClass={sc}
                onEdit={handleEditShareClass}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showIssueModal && companyId && (
        <IssueSharesModal
          companyId={companyId}
          incorporationDate={incorporationDate}
          shareClasses={shareClasses}
          nextCertificateNumber={nextCertificateNumber}
          onClose={() => setShowIssueModal(false)}
          onSuccess={handleIssueSuccess}
        />
      )}
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# app/[locale]/onboarding/page.tsx
# ---------------------------------------------------------------------------
mkdir -p "app/[locale]/onboarding"
cat << 'EOF' > "app/[locale]/onboarding/page.tsx"
'use client';

import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import OnboardingProgressBar from '@/components/onboarding/OnboardingProgressBar';
import StepDirectors, {
  type OnboardingDirector,
} from '@/components/onboarding/StepDirectors';
import StepShareholders, {
  type OnboardingShareholder,
} from '@/components/onboarding/StepShareholders';
import StepOfficers, {
  type OnboardingOfficers,
} from '@/components/onboarding/StepOfficers';
import StepCelebration from '@/components/onboarding/StepCelebration';

// =============================================================================
// NOTE: Steps 1-3 (Language, Company, Province) and Step 8 (Fiscal Years)
// are EXISTING components — they are not recreated here.
//
// This file shows the ORCHESTRATOR that integrates the new steps 4-7
// into the existing onboarding flow.
//
// Import your existing step components below:
// import StepLanguage from '@/components/onboarding/StepLanguage';
// import StepCompany from '@/components/onboarding/StepCompany';
// import StepProvince from '@/components/onboarding/StepProvince';
// import StepFiscalYears from '@/components/onboarding/StepFiscalYears';
// =============================================================================

const TOTAL_STEPS = 8;

interface OnboardingState {
  // Steps 1-3 data (already exists)
  companyId: string | null;
  companyName: string;
  incorporationDate: string;
  province: string;
  userFullName: string;

  // Step 4
  directors: OnboardingDirector[];
  // Step 5
  shareholders: OnboardingShareholder[];
  // Step 6
  officers: OnboardingOfficers;
}

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>({
    companyId: null,
    companyName: '',
    incorporationDate: '',
    province: '',
    userFullName: '',
    directors: [],
    shareholders: [],
    officers: { presidentName: '', secretaryName: '', treasurerName: '' },
  });

  // ==========================================================================
  // Step 4 — Directors: save to Supabase
  // ==========================================================================
  const handleDirectorsContinue = useCallback(
    async (directors: OnboardingDirector[]) => {
      setState((s) => ({ ...s, directors }));

      if (state.companyId) {
        // Save each director to company_people + director_mandates
        for (const dir of directors) {
          if (!dir.fullName.trim()) continue;

          const { data: person } = await supabase
            .from('company_people')
            .insert({
              company_id: state.companyId,
              full_name: dir.fullName.trim(),
              is_canadian_resident: dir.isCanadianResident,
              address_country: 'CA',
            })
            .select('id')
            .single();

          if (person) {
            await supabase.from('director_mandates').insert({
              company_id: state.companyId,
              person_id: person.id,
              appointment_date: dir.appointmentDate,
              is_active: true,
            });
          }
        }
      }

      setStep(5);
    },
    [state.companyId, supabase]
  );

  const handleDirectorsSkip = useCallback(() => {
    setStep(5);
  }, []);

  // ==========================================================================
  // Step 5 — Shareholders: save to Supabase
  // ==========================================================================
  const handleShareholdersContinue = useCallback(
    async (shareholders: OnboardingShareholder[]) => {
      setState((s) => ({ ...s, shareholders }));

      if (state.companyId) {
        // Get or create default share class
        let shareClassId: string | null = null;

        const { data: existingClasses } = await supabase
          .from('share_classes')
          .select('id')
          .eq('company_id', state.companyId)
          .limit(1);

        if (existingClasses && existingClasses.length > 0) {
          shareClassId = existingClasses[0].id;
        } else {
          const { data: newClass } = await supabase
            .from('share_classes')
            .insert({
              company_id: state.companyId,
              name: 'Actions ordinaires / Common Shares',
              type: 'common',
              voting_rights: true,
              votes_per_share: 1,
              max_quantity: null,
            })
            .select('id')
            .single();

          shareClassId = newClass?.id || null;
        }

        if (shareClassId) {
          let certNum = 1;

          for (const sh of shareholders) {
            if (!sh.fullName.trim() || sh.numberOfShares <= 0) continue;

            // Find existing person or create new
            const { data: existingPeople } = await supabase
              .from('company_people')
              .select('id, full_name')
              .eq('company_id', state.companyId)
              .ilike('full_name', sh.fullName.trim());

            let personId: string;

            if (existingPeople && existingPeople.length > 0) {
              personId = existingPeople[0].id;
            } else {
              const { data: newPerson } = await supabase
                .from('company_people')
                .insert({
                  company_id: state.companyId,
                  full_name: sh.fullName.trim(),
                  address_country: 'CA',
                })
                .select('id')
                .single();

              if (!newPerson) continue;
              personId = newPerson.id;
            }

            await supabase.from('shareholdings').insert({
              company_id: state.companyId,
              person_id: personId,
              share_class_id: shareClassId,
              quantity: sh.numberOfShares,
              issue_date: sh.issueDate,
              certificate_number: String(certNum).padStart(3, '0'),
            });

            certNum++;
          }
        }
      }

      setStep(6);
    },
    [state.companyId, supabase]
  );

  const handleShareholdersSkip = useCallback(() => {
    setStep(6);
  }, []);

  // ==========================================================================
  // Step 6 — Officers: save to Supabase
  // ==========================================================================
  const handleOfficersContinue = useCallback(
    async (officers: OnboardingOfficers) => {
      setState((s) => ({ ...s, officers }));

      if (state.companyId) {
        const appointmentDate =
          state.incorporationDate || new Date().toISOString().split('T')[0];

        // Helper: find person by name, create officer appointment
        async function appointOfficer(
          name: string,
          title: 'president' | 'secretary' | 'treasurer'
        ) {
          if (!name.trim()) return;

          const { data: people } = await supabase
            .from('company_people')
            .select('id')
            .eq('company_id', state.companyId!)
            .ilike('full_name', name.trim());

          let personId: string;

          if (people && people.length > 0) {
            personId = people[0].id;
          } else {
            const { data: newPerson } = await supabase
              .from('company_people')
              .insert({
                company_id: state.companyId!,
                full_name: name.trim(),
                address_country: 'CA',
              })
              .select('id')
              .single();

            if (!newPerson) return;
            personId = newPerson.id;
          }

          await supabase.from('officer_appointments').insert({
            company_id: state.companyId!,
            person_id: personId,
            title,
            is_primary_signing_authority: title === 'president',
            appointment_date: appointmentDate,
            is_active: true,
          });
        }

        await appointOfficer(officers.presidentName, 'president');
        await appointOfficer(officers.secretaryName, 'secretary');
        await appointOfficer(officers.treasurerName, 'treasurer');
      }

      setStep(7);
    },
    [state.companyId, state.incorporationDate, supabase]
  );

  const handleOfficersSkip = useCallback(() => {
    setStep(7);
  }, []);

  // ==========================================================================
  // Step 7 — Celebration → Fiscal Years
  // ==========================================================================
  const handleCelebrationContinue = useCallback(() => {
    setStep(8);
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-8 dark:bg-zinc-950">
      {/* Progress bar */}
      <div className="mb-10 w-full max-w-2xl">
        <OnboardingProgressBar currentStep={step} totalSteps={TOTAL_STEPS} />
      </div>

      {/* Step content */}
      <div className="flex w-full flex-1 items-start justify-center">
        {/* ── Steps 1-3: existing components (placeholder) ── */}
        {step === 1 && (
          <div className="w-full max-w-lg text-center">
            <p className="text-sm text-zinc-400">
              {'<StepLanguage />'}
              {' — '}
              {locale === 'fr' ? 'Composant existant' : 'Existing component'}
            </p>
            <button
              onClick={() => setStep(2)}
              className="mt-4 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white"
            >
              {locale === 'fr' ? 'Continuer →' : 'Continue →'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="w-full max-w-lg text-center">
            <p className="text-sm text-zinc-400">
              {'<StepCompany />'}
              {' — '}
              {locale === 'fr' ? 'Composant existant' : 'Existing component'}
            </p>
            <button
              onClick={() => setStep(3)}
              className="mt-4 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white"
            >
              {locale === 'fr' ? 'Continuer →' : 'Continue →'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="w-full max-w-lg text-center">
            <p className="text-sm text-zinc-400">
              {'<StepProvince />'}
              {' — '}
              {locale === 'fr' ? 'Composant existant' : 'Existing component'}
            </p>
            <button
              onClick={() => setStep(4)}
              className="mt-4 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white"
            >
              {locale === 'fr' ? 'Continuer →' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ── Step 4: Directors ── */}
        {step === 4 && (
          <StepDirectors
            userFullName={state.userFullName}
            incorporationDate={state.incorporationDate}
            initialDirectors={state.directors.length > 0 ? state.directors : undefined}
            onContinue={handleDirectorsContinue}
            onSkip={handleDirectorsSkip}
          />
        )}

        {/* ── Step 5: Shareholders ── */}
        {step === 5 && (
          <StepShareholders
            directors={state.directors}
            incorporationDate={state.incorporationDate}
            initialShareholders={
              state.shareholders.length > 0 ? state.shareholders : undefined
            }
            onContinue={handleShareholdersContinue}
            onSkip={handleShareholdersSkip}
          />
        )}

        {/* ── Step 6: Officers ── */}
        {step === 6 && (
          <StepOfficers
            directors={state.directors}
            shareholders={state.shareholders}
            incorporationDate={state.incorporationDate}
            initialOfficers={
              state.officers.presidentName ? state.officers : undefined
            }
            onContinue={handleOfficersContinue}
            onSkip={handleOfficersSkip}
          />
        )}

        {/* ── Step 7: Celebration ── */}
        {step === 7 && (
          <StepCelebration
            directors={state.directors}
            shareholders={state.shareholders}
            officers={state.officers}
            onContinue={handleCelebrationContinue}
          />
        )}

        {/* ── Step 8: Fiscal Years (existing component) ── */}
        {step === 8 && (
          <div className="w-full max-w-lg text-center">
            <p className="text-sm text-zinc-400">
              {'<StepFiscalYears />'}
              {' — '}
              {locale === 'fr' ? 'Composant existant (inchangé)' : 'Existing component (unchanged)'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/directors/AddDirectorModal.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/directors"
cat << 'EOF' > "components/directors/AddDirectorModal.tsx"
'use client';

import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';

// =============================================================================
// Types
// =============================================================================

interface AddDirectorModalProps {
  companyId: string;
  incorporationDate: string | null;
  /** Person IDs already serving as active directors (to exclude from selector) */
  existingDirectorPersonIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function AddDirectorModal({
  companyId,
  incorporationDate,
  existingDirectorPersonIds,
  onClose,
  onSuccess,
}: AddDirectorModalProps) {
  const t = useTranslations('directors');
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [appointmentDate, setAppointmentDate] = useState(
    incorporationDate || new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }
    if (!appointmentDate) {
      setError(t('errorAppointmentDate'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let personId: string;

      if (personValue.mode === 'new') {
        // Create person first
        const { data: newPerson, error: insertErr } = await supabase
          .from('company_people')
          .insert({
            company_id: companyId,
            full_name: personValue.fullName,
            email: personValue.email || null,
            phone: personValue.phone || null,
            address_line1: personValue.addressLine1 || null,
            address_city: personValue.addressCity || null,
            address_province: personValue.addressProvince || null,
            address_postal_code: personValue.addressPostalCode || null,
            address_country: personValue.addressCountry,
            is_canadian_resident: personValue.isCanadianResident,
          })
          .select('id')
          .single();

        if (insertErr || !newPerson) {
          throw new Error(insertErr?.message || 'Failed to create person');
        }
        personId = newPerson.id;
      } else {
        personId = personValue.personId;
      }

      // Create director mandate
      const { error: mandateErr } = await supabase
        .from('director_mandates')
        .insert({
          company_id: companyId,
          person_id: personId,
          appointment_date: appointmentDate,
          is_active: true,
        });

      if (mandateErr) {
        throw new Error(mandateErr.message);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, appointmentDate, companyId, supabase, onSuccess, t]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <Zap className="mr-1.5 inline h-4 w-4 text-amber-500" />
            {t('addDirector')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Person selector */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            excludePersonIds={existingDirectorPersonIds}
            label={t('person')}
            defaultToNew={existingDirectorPersonIds.length === 0}
          />

          {/* Appointment date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('appointmentDate')} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !personValue}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/directors/DirectorCard.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/directors"
cat << 'EOF' > "components/directors/DirectorCard.tsx"
'use client';

import { useTranslations } from 'next-intl';
import { MapPin, Pencil, UserMinus, Flag } from 'lucide-react';
import type {
  DirectorWithPerson,
  OfficerAppointment,
  Shareholding,
  ShareClass,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface DirectorCardProps {
  director: DirectorWithPerson;
  /** Active officer appointments for this person */
  officerAppointments: OfficerAppointment[];
  /** Active shareholdings for this person */
  shareholdings: (Shareholding & { share_class: ShareClass })[];
  onEdit: (director: DirectorWithPerson) => void;
  onRemove: (director: DirectorWithPerson) => void;
}

// =============================================================================
// Helpers
// =============================================================================

const OFFICER_TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// =============================================================================
// Component
// =============================================================================

export default function DirectorCard({
  director,
  officerAppointments,
  shareholdings,
  onEdit,
  onRemove,
}: DirectorCardProps) {
  const t = useTranslations('directors');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const { person } = director;
  const totalShares = shareholdings.reduce((sum, s) => sum + s.quantity, 0);

  // Build "Aussi :" roles line
  const otherRoles: string[] = [];

  officerAppointments.forEach((oa) => {
    if (oa.title === 'custom') {
      otherRoles.push(oa.custom_title || 'Custom');
    } else {
      const labels = OFFICER_TITLE_LABELS[oa.title];
      otherRoles.push(labels ? labels[locale] : oa.title);
    }
  });

  if (totalShares > 0) {
    otherRoles.push(
      locale === 'fr'
        ? `Actionnaire (${totalShares} actions)`
        : `Shareholder (${totalShares} shares)`
    );
  }

  // Location string
  const location = [person.address_city, person.address_province]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Top section: Avatar + info */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-base font-bold text-amber-700 dark:from-amber-900/50 dark:to-amber-800/50 dark:text-amber-300">
          {getInitials(person.full_name)}
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? `Administrateur depuis le ${formatDate(director.appointment_date, locale)}`
              : `Director since ${formatDate(director.appointment_date, locale)}`}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 space-y-2">
        {/* Location */}
        {location && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span>{location}</span>
          </div>
        )}

        {/* Canadian resident badge */}
        <div className="flex items-center gap-2 text-sm">
          <Flag className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          {person.is_canadian_resident ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              🇨🇦 {locale === 'fr' ? 'Résident canadien' : 'Canadian resident'}
            </span>
          ) : (
            <span className="text-zinc-500">
              {locale === 'fr' ? 'Non-résident' : 'Non-resident'}
            </span>
          )}
        </div>

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
        <button
          type="button"
          onClick={() => onEdit(director)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(director)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
        >
          <UserMinus className="h-3.5 w-3.5" />
          {t('remove')}
        </button>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/directors/RemoveDirectorModal.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/directors"
cat << 'EOF' > "components/directors/RemoveDirectorModal.tsx"
'use client';

import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import type { DirectorWithPerson, DirectorEndReason } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface RemoveDirectorModalProps {
  director: DirectorWithPerson;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// End-reason options
// =============================================================================

const END_REASONS: { value: DirectorEndReason; fr: string; en: string }[] = [
  { value: 'resignation', fr: 'Démission', en: 'Resignation' },
  { value: 'revocation', fr: 'Révocation', en: 'Revocation' },
  { value: 'term_expired', fr: 'Fin de mandat', en: 'Term expired' },
  { value: 'death', fr: 'Décès', en: 'Death' },
  { value: 'disqualification', fr: 'Disqualification', en: 'Disqualification' },
];

// =============================================================================
// Component
// =============================================================================

export default function RemoveDirectorModal({
  director,
  onClose,
  onSuccess,
}: RemoveDirectorModalProps) {
  const t = useTranslations('directors');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [endReason, setEndReason] = useState<DirectorEndReason>('resignation');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const { error: updateErr } = await supabase
        .from('director_mandates')
        .update({
          is_active: false,
          end_date: endDate,
          end_reason: endReason,
        })
        .eq('id', director.id);

      if (updateErr) throw new Error(updateErr.message);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [endDate, endReason, director.id, supabase, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {t('removeDirector')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {locale === 'fr'
              ? `Retirer ${director.person.full_name} du conseil d'administration ?`
              : `Remove ${director.person.full_name} from the board of directors?`}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {locale === 'fr'
              ? 'La personne restera dans le registre (actionnaire, dirigeant) mais ne sera plus administrateur actif.'
              : 'The person will remain in the registry (shareholder, officer) but will no longer be an active director.'}
          </p>

          {/* End reason */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endReason')}
            </label>
            <select
              value={endReason}
              onChange={(e) => setEndReason(e.target.value as DirectorEndReason)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {END_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {locale === 'fr' ? r.fr : r.en}
                </option>
              ))}
            </select>
          </div>

          {/* End date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endDate')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('confirmRemove')}
          </button>
        </div>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/officers/AddOfficerModal.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/officers"
cat << 'EOF' > "components/officers/AddOfficerModal.tsx"
'use client';

import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { OfficerTitle } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface AddOfficerModalProps {
  companyId: string;
  incorporationDate: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Title options
// =============================================================================

const TITLE_OPTIONS: { value: OfficerTitle; fr: string; en: string }[] = [
  { value: 'president', fr: 'Président·e', en: 'President' },
  { value: 'vice_president', fr: 'Vice-président·e', en: 'Vice President' },
  { value: 'secretary', fr: 'Secrétaire', en: 'Secretary' },
  { value: 'treasurer', fr: 'Trésorier·ière', en: 'Treasurer' },
  { value: 'custom', fr: 'Autre (personnalisé)', en: 'Other (custom)' },
];

// =============================================================================
// Component
// =============================================================================

export default function AddOfficerModal({
  companyId,
  incorporationDate,
  onClose,
  onSuccess,
}: AddOfficerModalProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [title, setTitle] = useState<OfficerTitle>('president');
  const [customTitle, setCustomTitle] = useState('');
  const [isSigningAuthority, setIsSigningAuthority] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(
    incorporationDate || new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }
    if (!appointmentDate) {
      setError(t('errorAppointmentDate'));
      return;
    }
    if (title === 'custom' && !customTitle.trim()) {
      setError(t('errorCustomTitle'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let personId: string;

      if (personValue.mode === 'new') {
        const { data: newPerson, error: insertErr } = await supabase
          .from('company_people')
          .insert({
            company_id: companyId,
            full_name: personValue.fullName,
            email: personValue.email || null,
            phone: personValue.phone || null,
            address_line1: personValue.addressLine1 || null,
            address_city: personValue.addressCity || null,
            address_province: personValue.addressProvince || null,
            address_postal_code: personValue.addressPostalCode || null,
            address_country: personValue.addressCountry,
            is_canadian_resident: personValue.isCanadianResident,
          })
          .select('id')
          .single();

        if (insertErr || !newPerson) {
          throw new Error(insertErr?.message || 'Failed to create person');
        }
        personId = newPerson.id;
      } else {
        personId = personValue.personId;
      }

      // Create officer appointment
      const { error: appointErr } = await supabase
        .from('officer_appointments')
        .insert({
          company_id: companyId,
          person_id: personId,
          title,
          custom_title: title === 'custom' ? customTitle.trim() : null,
          is_primary_signing_authority: isSigningAuthority,
          appointment_date: appointmentDate,
          is_active: true,
        });

      if (appointErr) {
        throw new Error(appointErr.message);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, title, customTitle, isSigningAuthority, appointmentDate, companyId, supabase, onSuccess, t]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <Zap className="mr-1.5 inline h-4 w-4 text-amber-500" />
            {t('appointOfficer')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Person selector */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            label={t('person')}
          />

          {/* Role selector */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('role')} <span className="text-red-500">*</span>
            </label>
            <select
              value={title}
              onChange={(e) => setTitle(e.target.value as OfficerTitle)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {TITLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {locale === 'fr' ? opt.fr : opt.en}
                </option>
              ))}
            </select>
          </div>

          {/* Custom title (visible only when title === 'custom') */}
          {title === 'custom' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('customTitle')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={locale === 'fr' ? 'Ex. : Directeur des opérations' : 'E.g.: Chief Operating Officer'}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {/* Signing authority toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={isSigningAuthority}
                onChange={(e) => setIsSigningAuthority(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('signingAuthority')}
            </span>
          </label>

          {/* Appointment date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('appointmentDate')} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !personValue}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/officers/OfficerCard.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/officers"
cat << 'EOF' > "components/officers/OfficerCard.tsx"
'use client';

import { useTranslations } from 'next-intl';
import { Pencil, UserMinus, RefreshCw, Star } from 'lucide-react';
import type {
  OfficerWithPerson,
  DirectorMandate,
  Shareholding,
  ShareClass,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface OfficerCardProps {
  officer: OfficerWithPerson;
  /** Active director mandates for this person */
  directorMandates: DirectorMandate[];
  /** Active shareholdings for this person */
  shareholdings: (Shareholding & { share_class: ShareClass })[];
  onEdit: (officer: OfficerWithPerson) => void;
  onReplace: (officer: OfficerWithPerson) => void;
  onRemove: (officer: OfficerWithPerson) => void;
}

// =============================================================================
// Helpers
// =============================================================================

const TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'PRÉSIDENT·E', en: 'PRESIDENT' },
  vice_president: { fr: 'VICE-PRÉSIDENT·E', en: 'VICE PRESIDENT' },
  secretary: { fr: 'SECRÉTAIRE', en: 'SECRETARY' },
  treasurer: { fr: 'TRÉSORIER·IÈRE', en: 'TREASURER' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// =============================================================================
// Component
// =============================================================================

export default function OfficerCard({
  officer,
  directorMandates,
  shareholdings,
  onEdit,
  onReplace,
  onRemove,
}: OfficerCardProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const { person } = officer;
  const totalShares = shareholdings.reduce((sum, s) => sum + s.quantity, 0);

  // Role header label
  const titleLabel =
    officer.title === 'custom'
      ? (officer.custom_title || 'Custom').toUpperCase()
      : (TITLE_LABELS[officer.title]?.[locale] ?? officer.title.toUpperCase());

  // Build "Aussi :" roles line
  const otherRoles: string[] = [];

  if (directorMandates.length > 0) {
    otherRoles.push(locale === 'fr' ? 'Administrateur' : 'Director');
  }

  if (totalShares > 0) {
    otherRoles.push(
      locale === 'fr'
        ? `Actionnaire (${totalShares} actions)`
        : `Shareholder (${totalShares} shares)`
    );
  }

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Role header */}
      <div className="mb-3 text-[11px] font-bold tracking-widest text-amber-600 dark:text-amber-400">
        {titleLabel}
      </div>

      {/* Avatar + info */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-base font-bold text-amber-700 dark:from-amber-900/50 dark:to-amber-800/50 dark:text-amber-300">
          {getInitials(person.full_name)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? `En poste depuis le ${formatDate(officer.appointment_date, locale)}`
              : `In office since ${formatDate(officer.appointment_date, locale)}`}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-2">
        {/* Signing authority badge */}
        {officer.is_primary_signing_authority && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <Star className="h-3 w-3 fill-current" />
            {locale === 'fr' ? 'Signataire autorisé' : 'Authorized signatory'}
          </div>
        )}

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
        <button
          type="button"
          onClick={() => onEdit(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={() => onReplace(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('replace')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
        >
          <UserMinus className="h-3.5 w-3.5" />
          {t('remove')}
        </button>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/officers/RemoveOfficerModal.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/officers"
cat << 'EOF' > "components/officers/RemoveOfficerModal.tsx"
'use client';

import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import type { OfficerWithPerson } from '@/lib/supabase/people-types';

// =============================================================================
// Helpers
// =============================================================================

const TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

// =============================================================================
// Types
// =============================================================================

interface RemoveOfficerModalProps {
  officer: OfficerWithPerson;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function RemoveOfficerModal({
  officer,
  onClose,
  onSuccess,
}: RemoveOfficerModalProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel =
    officer.title === 'custom'
      ? officer.custom_title || 'Custom'
      : (TITLE_LABELS[officer.title]?.[locale] ?? officer.title);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const { error: updateErr } = await supabase
        .from('officer_appointments')
        .update({
          is_active: false,
          end_date: endDate,
        })
        .eq('id', officer.id);

      if (updateErr) throw new Error(updateErr.message);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [endDate, officer.id, supabase, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {t('removeOfficer')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {locale === 'fr'
              ? `Retirer ${officer.person.full_name} du poste de ${roleLabel} ?`
              : `Remove ${officer.person.full_name} from the ${roleLabel} position?`}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {locale === 'fr'
              ? 'La personne restera dans le registre mais ne sera plus en poste.'
              : 'The person will remain in the registry but will no longer hold this position.'}
          </p>

          {/* End date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endDate')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('confirmRemove')}
          </button>
        </div>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/officers/ReplaceOfficerModal.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/officers"
cat << 'EOF' > "components/officers/ReplaceOfficerModal.tsx"
'use client';

import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import { X, RefreshCw, Loader2, ArrowRight } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { OfficerWithPerson } from '@/lib/supabase/people-types';

// =============================================================================
// Helpers
// =============================================================================

const TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

function getRoleLabel(officer: OfficerWithPerson, locale: string): string {
  if (officer.title === 'custom') {
    return officer.custom_title || 'Custom';
  }
  return TITLE_LABELS[officer.title]?.[locale] ?? officer.title;
}

// =============================================================================
// Types
// =============================================================================

interface ReplaceOfficerModalProps {
  officer: OfficerWithPerson;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function ReplaceOfficerModal({
  officer,
  companyId,
  onClose,
  onSuccess,
}: ReplaceOfficerModalProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  const today = new Date().toISOString().split('T')[0];
  const roleLabel = getRoleLabel(officer, locale);

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [endDate, setEndDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [isSigningAuthority, setIsSigningAuthority] = useState(
    officer.is_primary_signing_authority
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Resolve incoming person ID
      let incomingPersonId: string;

      if (personValue.mode === 'new') {
        const { data: newPerson, error: insertErr } = await supabase
          .from('company_people')
          .insert({
            company_id: companyId,
            full_name: personValue.fullName,
            email: personValue.email || null,
            phone: personValue.phone || null,
            address_line1: personValue.addressLine1 || null,
            address_city: personValue.addressCity || null,
            address_province: personValue.addressProvince || null,
            address_postal_code: personValue.addressPostalCode || null,
            address_country: personValue.addressCountry,
            is_canadian_resident: personValue.isCanadianResident,
          })
          .select('id')
          .single();

        if (insertErr || !newPerson) {
          throw new Error(insertErr?.message || 'Failed to create person');
        }
        incomingPersonId = newPerson.id;
      } else {
        incomingPersonId = personValue.personId;
      }

      // 2. End outgoing officer appointment
      const { error: endErr } = await supabase
        .from('officer_appointments')
        .update({
          is_active: false,
          end_date: endDate,
        })
        .eq('id', officer.id);

      if (endErr) throw new Error(endErr.message);

      // 3. Create new appointment for incoming person (same role)
      const { error: createErr } = await supabase
        .from('officer_appointments')
        .insert({
          company_id: companyId,
          person_id: incomingPersonId,
          title: officer.title,
          custom_title: officer.custom_title,
          is_primary_signing_authority: isSigningAuthority,
          appointment_date: startDate,
          is_active: true,
        });

      if (createErr) throw new Error(createErr.message);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, endDate, startDate, isSigningAuthority, officer, companyId, supabase, onSuccess, t]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            {t('replaceOfficer')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Context: who is being replaced */}
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {locale === 'fr'
                ? `Remplacer ${officer.person.full_name} comme ${roleLabel} ?`
                : `Replace ${officer.person.full_name} as ${roleLabel}?`}
            </p>
            {/* Visual: outgoing → incoming */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 rounded-md bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {officer.person.full_name}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
              <div className="flex-1 rounded-md bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                {personValue
                  ? personValue.mode === 'existing'
                    ? personValue.person.full_name
                    : personValue.fullName || '…'
                  : '?'}
              </div>
            </div>
          </div>

          {/* Select incoming person */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            excludePersonIds={[officer.person_id]}
            label={locale === 'fr' ? 'Nouveau titulaire' : 'New appointee'}
          />

          {/* Dates row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {locale === 'fr' ? 'Fin de mandat (sortant)' : 'End date (outgoing)'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {locale === 'fr' ? 'Entrée en poste (entrant)' : 'Start date (incoming)'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Signing authority toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={isSigningAuthority}
                onChange={(e) => setIsSigningAuthority(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('signingAuthority')}
            </span>
          </label>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !personValue}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('confirmReplace')}
          </button>
        </div>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/onboarding/OnboardingProgressBar.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/onboarding"
cat << 'EOF' > "components/onboarding/OnboardingProgressBar.tsx"
'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface OnboardingProgressBarProps {
  currentStep: number; // 1-8
  totalSteps?: number;
}

// =============================================================================
// Step labels
// =============================================================================

const STEP_LABELS_FR = [
  'Langue',
  'Société',
  'Province',
  'Administrateurs',
  'Actionnaires',
  'Dirigeants',
  'Résumé',
  'Exercices',
];

const STEP_LABELS_EN = [
  'Language',
  'Company',
  'Province',
  'Directors',
  'Shareholders',
  'Officers',
  'Summary',
  'Fiscal years',
];

// =============================================================================
// Component
// =============================================================================

export default function OnboardingProgressBar({
  currentStep,
  totalSteps = 8,
}: OnboardingProgressBarProps) {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const labels = locale === 'fr' ? STEP_LABELS_FR : STEP_LABELS_EN;
  const pct = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100);

  return (
    <div className="w-full max-w-2xl">
      {/* Bar */}
      <div className="relative mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step dots + labels (visible on sm+) */}
      <div className="hidden items-center justify-between sm:flex">
        {labels.slice(0, totalSteps).map((label, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              {/* Dot */}
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  isCompleted
                    ? 'bg-amber-500 text-white'
                    : isActive
                      ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-800'
                      : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : stepNum}
              </div>
              {/* Label */}
              <span
                className={`text-[10px] leading-tight ${
                  isActive
                    ? 'font-semibold text-amber-600 dark:text-amber-400'
                    : isCompleted
                      ? 'text-zinc-500 dark:text-zinc-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: step counter */}
      <div className="flex items-center justify-between sm:hidden">
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          {labels[currentStep - 1]}
        </span>
        <span className="text-xs text-zinc-400">
          {currentStep}/{totalSteps}
        </span>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/onboarding/StepCelebration.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/onboarding"
cat << 'EOF' > "components/onboarding/StepCelebration.tsx"
'use client';

import { useTranslations } from 'next-intl';
import { Zap, Check } from 'lucide-react';
import type { OnboardingDirector } from './StepDirectors';
import type { OnboardingShareholder } from './StepShareholders';
import type { OnboardingOfficers } from './StepOfficers';

// =============================================================================
// Types
// =============================================================================

interface StepCelebrationProps {
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  officers: OnboardingOfficers;
  onContinue: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepCelebration({
  directors,
  shareholders,
  officers,
  onContinue,
}: StepCelebrationProps) {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const validDirectors = directors.filter((d) => d.fullName.trim());
  const validShareholders = shareholders.filter((s) => s.fullName.trim());
  const hasPresident = !!officers.presidentName;
  const hasSecretary = !!officers.secretaryName;
  const hasTreasurer = !!officers.treasurerName;

  // Build checklist items
  const items: { label: string; done: boolean }[] = [
    {
      label: locale === 'fr' ? 'Entreprise enregistrée' : 'Company registered',
      done: true,
    },
    {
      label:
        locale === 'fr'
          ? `${validDirectors.length} administrateur${validDirectors.length > 1 ? 's' : ''}`
          : `${validDirectors.length} director${validDirectors.length > 1 ? 's' : ''}`,
      done: validDirectors.length > 0,
    },
    {
      label:
        locale === 'fr'
          ? `${validShareholders.length} actionnaire${validShareholders.length > 1 ? 's' : ''}`
          : `${validShareholders.length} shareholder${validShareholders.length > 1 ? 's' : ''}`,
      done: validShareholders.length > 0,
    },
    {
      label: locale === 'fr' ? 'Président·e nommé·e' : 'President appointed',
      done: hasPresident,
    },
    {
      label: locale === 'fr' ? 'Secrétaire nommé·e' : 'Secretary appointed',
      done: hasSecretary,
    },
  ];

  if (hasTreasurer) {
    items.push({
      label: locale === 'fr' ? 'Trésorier·ière nommé·e' : 'Treasurer appointed',
      done: true,
    });
  }

  return (
    <div className="w-full max-w-md space-y-8 text-center">
      {/* Icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
        <Zap className="h-8 w-8 text-amber-500" />
      </div>

      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? '⚡ Votre entreprise est configurée !'
            : '⚡ Your company is set up!'}
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {locale === 'fr'
            ? 'Votre registre corporatif est en place.'
            : 'Your corporate register is in place.'}
        </p>
      </div>

      {/* Checklist */}
      <div className="mx-auto max-w-xs space-y-2.5 text-left">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.done
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
              }`}
            >
              {item.done ? (
                <Check className="h-3 w-3" />
              ) : (
                <span className="text-[10px]">—</span>
              )}
            </div>
            <span
              className={`text-sm ${
                item.done
                  ? 'font-medium text-zinc-700 dark:text-zinc-300'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Subtitle */}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {locale === 'fr'
          ? 'Prochaine étape : choisissez vos exercices financiers.'
          : 'Next step: choose your fiscal years.'}
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-amber-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
      >
        {locale === 'fr' ? 'Choisir mes exercices →' : 'Choose my fiscal years →'}
      </button>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/onboarding/StepDirectors.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/onboarding"
cat << 'EOF' > "components/onboarding/StepDirectors.tsx"
'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Info, UserCheck } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingDirector {
  fullName: string;
  appointmentDate: string;
  isCanadianResident: boolean;
}

interface StepDirectorsProps {
  /** Pre-fill with user's name for the first director */
  userFullName?: string;
  /** Company incorporation date for default appointment date */
  incorporationDate?: string;
  /** Initial values (if user navigated back) */
  initialDirectors?: OnboardingDirector[];
  onContinue: (directors: OnboardingDirector[]) => void;
  onSkip: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepDirectors({
  userFullName = '',
  incorporationDate = '',
  initialDirectors,
  onContinue,
  onSkip,
}: StepDirectorsProps) {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const defaultDate = incorporationDate || new Date().toISOString().split('T')[0];

  const [directors, setDirectors] = useState<OnboardingDirector[]>(
    initialDirectors && initialDirectors.length > 0
      ? initialDirectors
      : [
          {
            fullName: userFullName,
            appointmentDate: defaultDate,
            isCanadianResident: true,
          },
        ]
  );

  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateDirector(index: number, field: keyof OnboardingDirector, value: any) {
    setDirectors((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  function addDirector() {
    setDirectors((prev) => [
      ...prev,
      { fullName: '', appointmentDate: defaultDate, isCanadianResident: true },
    ]);
  }

  function removeDirector(index: number) {
    setDirectors((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContinue() {
    // Filter out empty entries
    const valid = directors.filter((d) => d.fullName.trim());
    onContinue(valid.length > 0 ? valid : directors);
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Title */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <UserCheck className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? 'Qui sont les administrateurs de votre entreprise ?'
            : 'Who are the directors of your company?'}
        </h2>

        {/* Tooltip */}
        <div className="relative mx-auto mt-2 inline-block">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Info className="h-3.5 w-3.5" />
            {locale === 'fr' ? "Qu'est-ce qu'un administrateur ?" : 'What is a director?'}
          </button>
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {locale === 'fr'
                ? "Les administrateurs supervisent la gestion de l'entreprise. Dans la plupart des petites entreprises, le fondateur est le seul administrateur."
                : 'Directors oversee company management. In most small businesses, the founder is the sole director.'}
            </div>
          )}
        </div>
      </div>

      {/* Director entries */}
      <div className="space-y-3">
        {directors.map((director, index) => (
          <div
            key={index}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {locale === 'fr' ? `Administrateur ${index + 1}` : `Director ${index + 1}`}
              </p>
              {directors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDirector(index)}
                  className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Full name */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {locale === 'fr' ? 'Nom complet' : 'Full name'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={director.fullName}
                onChange={(e) => updateDirector(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Date + Resident row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'fr' ? 'Date de nomination' : 'Appointment date'}
                </label>
                <input
                  type="date"
                  value={director.appointmentDate}
                  onChange={(e) => updateDirector(index, 'appointmentDate', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={director.isCanadianResident}
                      onChange={(e) =>
                        updateDirector(index, 'isCanadianResident', e.target.checked)
                      }
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
                    <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    🇨🇦 {locale === 'fr' ? 'Résident canadien' : 'Canadian resident'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another */}
      <button
        type="button"
        onClick={addDirector}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:text-amber-400"
      >
        <Plus className="h-4 w-4" />
        {locale === 'fr' ? 'Ajouter un administrateur' : 'Add a director'}
      </button>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {locale === 'fr' ? 'Passer' : 'Skip'}
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          {locale === 'fr' ? 'Continuer →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/onboarding/StepOfficers.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/onboarding"
cat << 'EOF' > "components/onboarding/StepOfficers.tsx"
'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Briefcase } from 'lucide-react';
import type { OnboardingDirector } from './StepDirectors';
import type { OnboardingShareholder } from './StepShareholders';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingOfficers {
  presidentName: string;
  secretaryName: string;
  treasurerName: string;
}

interface StepOfficersProps {
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  incorporationDate?: string;
  initialOfficers?: OnboardingOfficers;
  onContinue: (officers: OnboardingOfficers) => void;
  onSkip: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepOfficers({
  directors,
  shareholders,
  incorporationDate = '',
  initialOfficers,
  onContinue,
  onSkip,
}: StepOfficersProps) {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  // Build list of known people names (deduped)
  const knownPeople = useMemo(() => {
    const names = new Set<string>();
    directors.forEach((d) => {
      if (d.fullName.trim()) names.add(d.fullName.trim());
    });
    shareholders.forEach((s) => {
      if (s.fullName.trim()) names.add(s.fullName.trim());
    });
    return Array.from(names);
  }, [directors, shareholders]);

  // Smart default: pre-select sole director for president + secretary
  const defaultPresident =
    initialOfficers?.presidentName ?? (knownPeople.length === 1 ? knownPeople[0] : '');
  const defaultSecretary =
    initialOfficers?.secretaryName ?? (knownPeople.length === 1 ? knownPeople[0] : '');
  const defaultTreasurer = initialOfficers?.treasurerName ?? '';

  const [presidentName, setPresidentName] = useState(defaultPresident);
  const [secretaryName, setSecretaryName] = useState(defaultSecretary);
  const [treasurerName, setTreasurerName] = useState(defaultTreasurer);

  const [showTooltip, setShowTooltip] = useState(false);

  function handleContinue() {
    onContinue({
      presidentName: presidentName.trim(),
      secretaryName: secretaryName.trim(),
      treasurerName: treasurerName.trim(),
    });
  }

  // ---- Person dropdown ------------------------------------------------------
  function PersonDropdown({
    value,
    onChange,
    label,
    required = false,
    optional = false,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
    required?: boolean;
    optional?: boolean;
  }) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
          {optional && (
            <span className="ml-1 text-xs font-normal text-zinc-400">
              ({locale === 'fr' ? 'optionnel' : 'optional'})
            </span>
          )}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">
            {locale === 'fr' ? '— Sélectionner —' : '— Select —'}
          </option>
          {knownPeople.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Title */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Briefcase className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? "Qui dirige l'entreprise au quotidien ?"
            : 'Who manages the company day-to-day?'}
        </h2>

        {/* Tooltip */}
        <div className="relative mx-auto mt-2 inline-block">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Info className="h-3.5 w-3.5" />
            {locale === 'fr' ? 'En savoir plus' : 'Learn more'}
          </button>
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {locale === 'fr'
                ? 'Le président supervise les affaires. Le secrétaire tient les registres. Souvent, c'est la même personne.'
                : 'The president oversees business affairs. The secretary maintains records. Often, this is the same person.'}
            </div>
          )}
        </div>
      </div>

      {/* Officer dropdowns */}
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800/60">
        <PersonDropdown
          value={presidentName}
          onChange={setPresidentName}
          label={locale === 'fr' ? 'Président·e' : 'President'}
        />

        <PersonDropdown
          value={secretaryName}
          onChange={setSecretaryName}
          label={locale === 'fr' ? 'Secrétaire' : 'Secretary'}
        />

        <PersonDropdown
          value={treasurerName}
          onChange={setTreasurerName}
          label={locale === 'fr' ? 'Trésorier·ière' : 'Treasurer'}
          optional
        />
      </div>

      {/* Note about same person */}
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        {locale === 'fr'
          ? 'ℹ️ Une même personne peut occuper plusieurs postes. C'est très courant dans les petites entreprises.'
          : 'ℹ️ The same person can hold multiple positions. This is very common in small businesses.'}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {locale === 'fr' ? 'Passer' : 'Skip'}
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          {locale === 'fr' ? 'Continuer →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/onboarding/StepShareholders.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/onboarding"
cat << 'EOF' > "components/onboarding/StepShareholders.tsx"
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Info, PieChart } from 'lucide-react';
import type { OnboardingDirector } from './StepDirectors';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingShareholder {
  fullName: string;
  numberOfShares: number;
  issueDate: string;
}

interface StepShareholdersProps {
  /** Directors added in step 4 (for smart pre-fill) */
  directors: OnboardingDirector[];
  incorporationDate?: string;
  /** Initial values (if user navigated back) */
  initialShareholders?: OnboardingShareholder[];
  onContinue: (shareholders: OnboardingShareholder[]) => void;
  onSkip: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepShareholders({
  directors,
  incorporationDate = '',
  initialShareholders,
  onContinue,
  onSkip,
}: StepShareholdersProps) {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const defaultDate = incorporationDate || new Date().toISOString().split('T')[0];

  // Smart pre-fill: if only 1 director, pre-fill shareholder with same name + 100 shares
  const defaultShareholders: OnboardingShareholder[] =
    initialShareholders && initialShareholders.length > 0
      ? initialShareholders
      : directors.length === 1
        ? [
            {
              fullName: directors[0].fullName,
              numberOfShares: 100,
              issueDate: defaultDate,
            },
          ]
        : directors.length > 0
          ? directors.map((d) => ({
              fullName: d.fullName,
              numberOfShares: 100,
              issueDate: defaultDate,
            }))
          : [
              {
                fullName: '',
                numberOfShares: 100,
                issueDate: defaultDate,
              },
            ];

  const [shareholders, setShareholders] =
    useState<OnboardingShareholder[]>(defaultShareholders);

  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateShareholder(
    index: number,
    field: keyof OnboardingShareholder,
    value: any
  ) {
    setShareholders((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function addShareholder() {
    setShareholders((prev) => [
      ...prev,
      { fullName: '', numberOfShares: 100, issueDate: defaultDate },
    ]);
  }

  function removeShareholder(index: number) {
    setShareholders((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContinue() {
    const valid = shareholders.filter((s) => s.fullName.trim());
    onContinue(valid.length > 0 ? valid : shareholders);
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Title */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <PieChart className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? 'Qui sont les actionnaires (propriétaires) ?'
            : 'Who are the shareholders (owners)?'}
        </h2>

        {/* Tooltip */}
        <div className="relative mx-auto mt-2 inline-block">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Info className="h-3.5 w-3.5" />
            {locale === 'fr' ? "Qu'est-ce qu'un actionnaire ?" : 'What is a shareholder?'}
          </button>
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {locale === 'fr'
                ? "Les actionnaires possèdent l'entreprise. Si vous êtes le seul propriétaire, ajoutez-vous avec le nombre d'actions émises."
                : 'Shareholders own the company. If you are the sole owner, add yourself with the number of shares issued.'}
            </div>
          )}
        </div>
      </div>

      {/* Default share class badge */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          <span className="text-emerald-500">✓</span>
          {locale === 'fr'
            ? "Classe d'actions par défaut : Actions ordinaires"
            : 'Default share class: Common Shares'}
        </div>
      </div>

      {/* Shareholder entries */}
      <div className="space-y-3">
        {shareholders.map((shareholder, index) => (
          <div
            key={index}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {locale === 'fr' ? `Actionnaire ${index + 1}` : `Shareholder ${index + 1}`}
              </p>
              {shareholders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShareholder(index)}
                  className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Name */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {locale === 'fr' ? 'Nom' : 'Name'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shareholder.fullName}
                onChange={(e) => updateShareholder(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Shares + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'fr' ? "Nombre d'actions" : 'Number of shares'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shareholder.numberOfShares}
                  onChange={(e) =>
                    updateShareholder(
                      index,
                      'numberOfShares',
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  placeholder="100"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'fr' ? "Date d'émission" : 'Issue date'}
                </label>
                <input
                  type="date"
                  value={shareholder.issueDate}
                  onChange={(e) => updateShareholder(index, 'issueDate', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another */}
      <button
        type="button"
        onClick={addShareholder}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:text-amber-400"
      >
        <Plus className="h-4 w-4" />
        {locale === 'fr' ? 'Ajouter un actionnaire' : 'Add a shareholder'}
      </button>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {locale === 'fr' ? 'Passer' : 'Skip'}
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          {locale === 'fr' ? 'Continuer →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/people/PersonSelector.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/people"
cat << 'EOF' > "components/people/PersonSelector.tsx"
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import {
  UserPlus,
  ChevronDown,
  Check,
  Search,
  X,
} from 'lucide-react';
import type { CompanyPerson } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

export interface PersonSelectorValue {
  mode: 'existing';
  personId: string;
  person: CompanyPerson;
} | {
  mode: 'new';
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  addressCountry: string;
  isCanadianResident: boolean;
};

interface PersonSelectorProps {
  companyId: string;
  /** Currently selected value (controlled) */
  value: PersonSelectorValue | null;
  onChange: (value: PersonSelectorValue | null) => void;
  /** IDs to exclude from the dropdown (e.g. already-assigned directors) */
  excludePersonIds?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Show the inline "new person" form expanded by default */
  defaultToNew?: boolean;
  /** Label above the selector */
  label?: string;
  /** Error message */
  error?: string;
}

// =============================================================================
// Province options (Canada)
// =============================================================================
const PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'Colombie-Britannique / British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'Nouveau-Brunswick / New Brunswick' },
  { value: 'NL', label: 'Terre-Neuve / Newfoundland' },
  { value: 'NS', label: 'Nouvelle-Écosse / Nova Scotia' },
  { value: 'NT', label: 'Territoires du Nord-Ouest' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Île-du-Prince-Édouard / PEI' },
  { value: 'QC', label: 'Québec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
];

// =============================================================================
// Component
// =============================================================================
export default function PersonSelector({
  companyId,
  value,
  onChange,
  excludePersonIds = [],
  placeholder,
  defaultToNew = false,
  label,
  error,
}: PersonSelectorProps) {
  const t = useTranslations('people');
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [people, setPeople] = useState<CompanyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(defaultToNew);

  // New person form fields
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddressLine1, setNewAddressLine1] = useState('');
  const [newAddressCity, setNewAddressCity] = useState('');
  const [newAddressProvince, setNewAddressProvince] = useState('QC');
  const [newAddressPostalCode, setNewAddressPostalCode] = useState('');
  const [newAddressCountry, setNewAddressCountry] = useState('CA');
  const [newIsCanadianResident, setNewIsCanadianResident] = useState(true);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ---- Fetch existing people ------------------------------------------------
  useEffect(() => {
    async function fetchPeople() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('company_people')
        .select('*')
        .eq('company_id', companyId)
        .order('full_name');

      if (!fetchError && data) {
        setPeople(data as CompanyPerson[]);
      }
      setLoading(false);
    }
    fetchPeople();
  }, [companyId, supabase]);

  // ---- Click outside to close dropdown --------------------------------------
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Sync new-person form → parent onChange -------------------------------
  useEffect(() => {
    if (showNewForm && newFullName.trim()) {
      onChange({
        mode: 'new',
        fullName: newFullName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        addressLine1: newAddressLine1.trim(),
        addressCity: newAddressCity.trim(),
        addressProvince: newAddressProvince,
        addressPostalCode: newAddressPostalCode.trim(),
        addressCountry: newAddressCountry,
        isCanadianResident: newIsCanadianResident,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showNewForm,
    newFullName,
    newEmail,
    newPhone,
    newAddressLine1,
    newAddressCity,
    newAddressProvince,
    newAddressPostalCode,
    newAddressCountry,
    newIsCanadianResident,
  ]);

  // ---- Filtered list --------------------------------------------------------
  const filteredPeople = people.filter((p) => {
    if (excludePersonIds.includes(p.id)) return false;
    if (!searchQuery) return true;
    return p.full_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const availablePeople = filteredPeople;
  const hasExistingPeople = people.filter((p) => !excludePersonIds.includes(p.id)).length > 0;

  // ---- Select an existing person --------------------------------------------
  function handleSelectPerson(person: CompanyPerson) {
    onChange({ mode: 'existing', personId: person.id, person });
    setDropdownOpen(false);
    setShowNewForm(false);
    setSearchQuery('');
  }

  // ---- Switch to "new person" mode ------------------------------------------
  function handleSwitchToNew() {
    setShowNewForm(true);
    setDropdownOpen(false);
    onChange(null); // reset until they type a name
  }

  // ---- Clear selection ------------------------------------------------------
  function handleClear() {
    onChange(null);
    setShowNewForm(defaultToNew);
    setNewFullName('');
    setNewEmail('');
    setNewPhone('');
    setNewAddressLine1('');
    setNewAddressCity('');
    setNewAddressProvince('QC');
    setNewAddressPostalCode('');
    setNewIsCanadianResident(true);
  }

  // ---- Helpers --------------------------------------------------------------
  function getInitials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // ---- Render ---------------------------------------------------------------
  const selectedExisting = value && value.mode === 'existing' ? value : null;
  const placeholderText = placeholder || t('selectPerson');

  return (
    <div className="w-full space-y-2">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      )}

      {/* ── Existing person selected ── */}
      {selectedExisting && !showNewForm && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {getInitials(selectedExisting.person.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {selectedExisting.person.full_name}
            </p>
            {selectedExisting.person.email && (
              <p className="truncate text-xs text-zinc-500">
                {selectedExisting.person.email}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Dropdown trigger ── */}
      {!selectedExisting && !showNewForm && (
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
              error
                ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600'
            }`}
          >
            <span className="text-zinc-400 dark:text-zinc-500">{placeholderText}</span>
            <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              {/* Search */}
              {hasExistingPeople && (
                <div className="border-b border-zinc-100 p-2 dark:border-zinc-700">
                  <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('searchPeople')}
                      className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* People list */}
              <div className="max-h-48 overflow-y-auto">
                {loading && (
                  <div className="px-3 py-4 text-center text-sm text-zinc-400">
                    {t('loading')}
                  </div>
                )}

                {!loading && availablePeople.length === 0 && hasExistingPeople && (
                  <div className="px-3 py-4 text-center text-sm text-zinc-400">
                    {t('noResults')}
                  </div>
                )}

                {!loading &&
                  availablePeople.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => handleSelectPerson(person)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {getInitials(person.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                          {person.full_name}
                        </p>
                        {person.address_city && (
                          <p className="truncate text-xs text-zinc-400">
                            {person.address_city}
                            {person.address_province ? `, ${person.address_province}` : ''}
                          </p>
                        )}
                      </div>
                      {selectedExisting?.personId === person.id && (
                        <Check className="h-4 w-4 text-amber-500" />
                      )}
                    </button>
                  ))}
              </div>

              {/* "Add new person" button */}
              <div className="border-t border-zinc-100 p-2 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={handleSwitchToNew}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  <UserPlus className="h-4 w-4" />
                  {t('addNewPerson')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── New person form (inline) ── */}
      {showNewForm && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {t('newPerson')}
            </p>
            {hasExistingPeople && (
              <button
                type="button"
                onClick={() => {
                  setShowNewForm(false);
                  handleClear();
                }}
                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {t('selectExisting')}
              </button>
            )}
          </div>

          {/* Full name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('fullName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="Jean-Philippe Roussy"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Email + Phone row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('email')}
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jp@example.com"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('phone')}
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="514-555-0123"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('address')}
            </label>
            <input
              type="text"
              value={newAddressLine1}
              onChange={(e) => setNewAddressLine1(e.target.value)}
              placeholder={t('addressLine1Placeholder')}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* City + Province + Postal */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('city')}
              </label>
              <input
                type="text"
                value={newAddressCity}
                onChange={(e) => setNewAddressCity(e.target.value)}
                placeholder="Sainte-Adèle"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('province')}
              </label>
              <select
                value={newAddressProvince}
                onChange={(e) => setNewAddressProvince(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {PROVINCES.map((prov) => (
                  <option key={prov.value} value={prov.value}>
                    {prov.value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('postalCode')}
              </label>
              <input
                type="text"
                value={newAddressPostalCode}
                onChange={(e) => setNewAddressPostalCode(e.target.value)}
                placeholder="J8B 1A1"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Canadian resident toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={newIsCanadianResident}
                onChange={(e) => setNewIsCanadianResident(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('canadianResident')}
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/shareholders/CapTableChart.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/shareholders"
cat << 'EOF' > "components/shareholders/CapTableChart.tsx"
'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ShareholdingWithDetails,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface CapTableChartProps {
  shareholdings: ShareholdingWithDetails[];
  totalIssued: number;
}

interface OwnerSlice {
  personId: string;
  name: string;
  quantity: number;
  pct: number;
  color: string;
}

// =============================================================================
// Color palette (amber-centric, works on light + dark)
// =============================================================================

const SLICE_COLORS = [
  '#f59e0b', // amber-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
];

// =============================================================================
// Component
// =============================================================================

export default function CapTableChart({
  shareholdings,
  totalIssued,
}: CapTableChartProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  // ---- Aggregate by person --------------------------------------------------
  const slices: OwnerSlice[] = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number }>();

    shareholdings.forEach((sh) => {
      const existing = map.get(sh.person_id);
      if (existing) {
        existing.quantity += sh.quantity;
      } else {
        map.set(sh.person_id, {
          name: sh.person.full_name,
          quantity: sh.quantity,
        });
      }
    });

    let colorIdx = 0;
    const result: OwnerSlice[] = [];
    map.forEach((val, personId) => {
      result.push({
        personId,
        name: val.name,
        quantity: val.quantity,
        pct: totalIssued > 0 ? Math.round((val.quantity / totalIssued) * 100) : 0,
        color: SLICE_COLORS[colorIdx % SLICE_COLORS.length],
      });
      colorIdx++;
    });

    // Sort descending by quantity
    result.sort((a, b) => b.quantity - a.quantity);
    return result;
  }, [shareholdings, totalIssued]);

  // ---- SVG donut math -------------------------------------------------------
  const SIZE = 140;
  const STROKE = 28;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // Build arcs
  const arcs = useMemo(() => {
    const result: { offset: number; length: number; color: string }[] = [];
    let cumulative = 0;

    slices.forEach((slice) => {
      const fraction = totalIssued > 0 ? slice.quantity / totalIssued : 0;
      const length = CIRCUMFERENCE * fraction;
      const offset = CIRCUMFERENCE * cumulative;
      result.push({ offset, length, color: slice.color });
      cumulative += fraction;
    });

    return result;
  }, [slices, totalIssued, CIRCUMFERENCE]);

  if (slices.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Header */}
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {locale === 'fr' ? 'Tableau de capitalisation' : 'Cap Table'}
      </h3>

      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {/* Donut chart */}
        <div className="relative shrink-0">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="-rotate-90"
          >
            {/* Background ring */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-zinc-100 dark:text-zinc-700"
            />
            {/* Slices */}
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
                strokeLinecap="butt"
                className="transition-all duration-500"
              />
            ))}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {totalIssued.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}
            </span>
            <span className="text-[10px] text-zinc-400">
              {locale === 'fr' ? 'actions' : 'shares'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {slices.map((slice) => (
            <div key={slice.personId} className="flex items-center gap-3">
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {slice.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {slice.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                  {locale === 'fr' ? 'actions' : 'shares'} · {slice.pct}%
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {slice.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Total + class summary */}
      {shareholdings.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? 'Total émis' : 'Total issued'} :{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {totalIssued.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
              {locale === 'fr' ? 'actions' : 'shares'}
            </span>
            {' · '}
            {locale === 'fr' ? 'Classe' : 'Class'} :{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {shareholdings[0].share_class.name}
              {shareholdings[0].share_class.voting_rights
                ? locale === 'fr' ? ' (votantes)' : ' (voting)'
                : ''}
              {!shareholdings[0].share_class.max_quantity
                ? locale === 'fr' ? ', illimitées' : ', unlimited'
                : ''}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/shareholders/IssueSharesModal.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/shareholders"
cat << 'EOF' > "components/shareholders/IssueSharesModal.tsx"
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { ShareClass } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface IssueSharesModalProps {
  companyId: string;
  incorporationDate: string | null;
  shareClasses: ShareClass[];
  /** Current max certificate number so we can auto-increment */
  nextCertificateNumber: number;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function IssueSharesModal({
  companyId,
  incorporationDate,
  shareClasses,
  nextCertificateNumber,
  onClose,
  onSuccess,
}: IssueSharesModalProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClientComponentClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [shareClassId, setShareClassId] = useState(shareClasses[0]?.id || '');
  const [quantity, setQuantity] = useState('100');
  const [pricePerShare, setPricePerShare] = useState('');
  const [issueDate, setIssueDate] = useState(
    incorporationDate || new Date().toISOString().split('T')[0]
  );
  const [certificateNumber, setCertificateNumber] = useState(
    String(nextCertificateNumber).padStart(3, '0')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update default share class if list changes
  useEffect(() => {
    if (!shareClassId && shareClasses.length > 0) {
      setShareClassId(shareClasses[0].id);
    }
  }, [shareClasses, shareClassId]);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }
    if (!shareClassId) {
      setError(t('errorShareClass'));
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError(t('errorQuantity'));
      return;
    }
    if (!issueDate) {
      setError(t('errorIssueDate'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let personId: string;

      if (personValue.mode === 'new') {
        const { data: newPerson, error: insertErr } = await supabase
          .from('company_people')
          .insert({
            company_id: companyId,
            full_name: personValue.fullName,
            email: personValue.email || null,
            phone: personValue.phone || null,
            address_line1: personValue.addressLine1 || null,
            address_city: personValue.addressCity || null,
            address_province: personValue.addressProvince || null,
            address_postal_code: personValue.addressPostalCode || null,
            address_country: personValue.addressCountry,
            is_canadian_resident: personValue.isCanadianResident,
          })
          .select('id')
          .single();

        if (insertErr || !newPerson) {
          throw new Error(insertErr?.message || 'Failed to create person');
        }
        personId = newPerson.id;
      } else {
        personId = personValue.personId;
      }

      // Parse price
      const price = pricePerShare.trim()
        ? parseFloat(pricePerShare)
        : null;

      // Create shareholding
      const { error: shErr } = await supabase.from('shareholdings').insert({
        company_id: companyId,
        person_id: personId,
        share_class_id: shareClassId,
        quantity: qty,
        issue_date: issueDate,
        issue_price_per_share: price,
        certificate_number: certificateNumber.trim() || null,
      });

      if (shErr) throw new Error(shErr.message);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [
    personValue,
    shareClassId,
    quantity,
    pricePerShare,
    issueDate,
    certificateNumber,
    companyId,
    supabase,
    onSuccess,
    t,
  ]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <Zap className="mr-1.5 inline h-4 w-4 text-amber-500" />
            {t('issueShares')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Person selector */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            label={t('person')}
          />

          {/* Share class */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('shareClass')} <span className="text-red-500">*</span>
            </label>
            <select
              value={shareClassId}
              onChange={(e) => setShareClassId(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {shareClasses.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity + Price per share row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('numberOfShares')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="100"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('pricePerShare')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  placeholder="1.00"
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-7 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {locale === 'fr' ? 'Optionnel — utile pour les dossiers fiscaux' : 'Optional — useful for tax records'}
              </p>
            </div>
          </div>

          {/* Issue date + Certificate row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('issueDate')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('certificateNumber')}
              </label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="001"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                {locale === 'fr' ? 'Auto-généré, modifiable' : 'Auto-generated, editable'}
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-zinc-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !personValue}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/shareholders/ShareClassCard.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/shareholders"
cat << 'EOF' > "components/shareholders/ShareClassCard.tsx"
'use client';

import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import type { ShareClass } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface ShareClassCardProps {
  shareClass: ShareClass;
  onEdit: (shareClass: ShareClass) => void;
}

// =============================================================================
// Component
// =============================================================================

export default function ShareClassCard({ shareClass, onEdit }: ShareClassCardProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const typeLabel =
    shareClass.type === 'common'
      ? locale === 'fr' ? 'Ordinaires' : 'Common'
      : locale === 'fr' ? 'Privilégiées' : 'Preferred';

  const votingLabel = shareClass.voting_rights
    ? locale === 'fr'
      ? `Votantes (${shareClass.votes_per_share} vote${shareClass.votes_per_share > 1 ? 's' : ''}/action)`
      : `Voting (${shareClass.votes_per_share} vote${shareClass.votes_per_share > 1 ? 's' : ''}/share)`
    : locale === 'fr' ? 'Non votantes' : 'Non-voting';

  const quantityLabel = shareClass.max_quantity
    ? locale === 'fr'
      ? `Max ${shareClass.max_quantity.toLocaleString('fr-CA')} actions`
      : `Max ${shareClass.max_quantity.toLocaleString('en-CA')} shares`
    : locale === 'fr' ? 'Quantité illimitée' : 'Unlimited';

  return (
    <div className="flex items-start justify-between rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {shareClass.name}
        </h4>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {locale === 'fr' ? 'Type' : 'Type'} : {typeLabel} · {votingLabel} · {quantityLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEdit(shareClass)}
        className="ml-3 shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/shareholders/ShareholderCard.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/shareholders"
cat << 'EOF' > "components/shareholders/ShareholderCard.tsx"
'use client';

import { useTranslations } from 'next-intl';
import { Pencil, ArrowRightLeft } from 'lucide-react';
import type {
  ShareholdingWithDetails,
  DirectorMandate,
  OfficerAppointment,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface ShareholderCardProps {
  /** All shareholdings for this person (may span multiple classes) */
  shareholdings: ShareholdingWithDetails[];
  totalIssuedShares: number;
  /** Active director mandates for this person */
  directorMandates: DirectorMandate[];
  /** Active officer appointments for this person */
  officerAppointments: OfficerAppointment[];
  onEdit: (shareholding: ShareholdingWithDetails) => void;
}

// =============================================================================
// Helpers
// =============================================================================

const OFFICER_TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// =============================================================================
// Component
// =============================================================================

export default function ShareholderCard({
  shareholdings,
  totalIssuedShares,
  directorMandates,
  officerAppointments,
  onEdit,
}: ShareholderCardProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  if (shareholdings.length === 0) return null;

  const person = shareholdings[0].person;
  const totalQuantity = shareholdings.reduce((sum, s) => sum + s.quantity, 0);
  const pct = totalIssuedShares > 0 ? Math.round((totalQuantity / totalIssuedShares) * 100) : 0;

  // Use the first shareholding for display of date + certificate (most common: 1 holding)
  const primary = shareholdings[0];

  // Build "Aussi :" roles line
  const otherRoles: string[] = [];

  if (directorMandates.length > 0) {
    otherRoles.push(locale === 'fr' ? 'Administrateur' : 'Director');
  }

  officerAppointments.forEach((oa) => {
    if (oa.title === 'custom') {
      otherRoles.push(oa.custom_title || 'Custom');
    } else {
      const labels = OFFICER_TITLE_LABELS[oa.title];
      otherRoles.push(labels ? labels[locale] : oa.title);
    }
  });

  // Share class name(s)
  const classNames = [...new Set(shareholdings.map((s) => s.share_class.name))];
  const classLabel = classNames.join(', ');

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Avatar + info */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-base font-bold text-amber-700 dark:from-amber-900/50 dark:to-amber-800/50 dark:text-amber-300">
          {getInitials(person.full_name)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {totalQuantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
            {locale === 'fr' ? 'actions' : 'shares'}{' '}
            <span className="lowercase">{classLabel}</span>
            {' · '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{pct}%</span>
            {' '}
            {locale === 'fr' ? 'du capital' : 'of capital'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5 pl-16">
        {/* Issue date */}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {locale === 'fr'
            ? `Émises le ${formatDate(primary.issue_date, locale)}`
            : `Issued ${formatDate(primary.issue_date, locale)}`}
        </p>

        {/* Certificate number */}
        {primary.certificate_number && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? 'Certificat' : 'Certificate'} #{primary.certificate_number}
          </p>
        )}

        {/* Multiple holdings detail */}
        {shareholdings.length > 1 && (
          <div className="mt-1 space-y-1 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
            {shareholdings.map((sh) => (
              <p key={sh.id} className="text-xs text-zinc-500 dark:text-zinc-400">
                {sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                {sh.share_class.name}
                {sh.certificate_number ? ` · #${sh.certificate_number}` : ''}
                {' · '}
                {formatDate(sh.issue_date, locale)}
              </p>
            ))}
          </div>
        )}

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
        <button
          type="button"
          onClick={() => onEdit(primary)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          disabled
          className="group/btn flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 opacity-60"
          title={locale === 'fr' ? 'Bientôt disponible (Sprint 7)' : 'Coming soon (Sprint 7)'}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {t('transfer')}
        </button>
      </div>
    </div>
  );
}

EOF

# ---------------------------------------------------------------------------
# components/sidebar/Sidebar.tsx
# ---------------------------------------------------------------------------
mkdir -p "components/sidebar"
cat << 'EOF' > "components/sidebar/Sidebar.tsx"
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  UserCheck,
  Briefcase,
  PieChart,
  FileText,
  Sparkles,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronsUpDown,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// =============================================================================
// Nav item type
// =============================================================================

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

// =============================================================================
// Nav structure (matches brief exactly)
// =============================================================================

function getNavGroups(locale: string): NavGroup[] {
  const base = `/${locale}/dashboard`;

  return [
    {
      labelKey: 'nav.group.company',
      items: [
        { key: 'nav.dashboard', href: base, icon: LayoutDashboard },
        { key: 'nav.directors', href: `${base}/directors`, icon: UserCheck },
        { key: 'nav.officers', href: `${base}/officers`, icon: Briefcase },
        { key: 'nav.shareholders', href: `${base}/shareholders`, icon: PieChart },
      ],
    },
    {
      labelKey: 'nav.group.documents',
      items: [
        { key: 'nav.documents', href: `${base}/documents`, icon: FileText },
        { key: 'nav.resolutions', href: `${base}/resolutions`, icon: Sparkles },
      ],
    },
    {
      labelKey: 'nav.group.compliance',
      items: [
        { key: 'nav.compliance', href: `${base}/compliance`, icon: ShieldCheck },
      ],
    },
  ];
}

// =============================================================================
// Sidebar component
// =============================================================================

interface SidebarProps {
  /** Company name for the company switcher */
  companyName?: string;
  /** User display name */
  userName?: string;
  /** User email */
  userEmail?: string;
  /** Callback for sign-out */
  onSignOut?: () => void;
  /** Callback for company switcher click */
  onSwitchCompany?: () => void;
  /** Whether sidebar is open on mobile */
  isOpen?: boolean;
  /** Close sidebar on mobile */
  onClose?: () => void;
}

export default function Sidebar({
  companyName = 'Mon entreprise',
  userName = '',
  userEmail = '',
  onSignOut,
  onSwitchCompany,
  isOpen = true,
  onClose,
}: SidebarProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();

  const navGroups = getNavGroups(locale);
  const settingsHref = `/${locale}/dashboard/settings`;

  // Active check: exact match for dashboard root, startsWith for sub-pages
  function isActive(href: string): boolean {
    if (href === `/${locale}/dashboard`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Mobile overlay ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ════════════════════════════════════════════════════════════════════
           Zone A — Signature / Brand
           ════════════════════════════════════════════════════════════════════ */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-100 px-5 dark:border-zinc-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Zap<span className="text-amber-500">Okay</span>
          </span>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
           Zone B — Company switcher
           ════════════════════════════════════════════════════════════════════ */}
        <button
          type="button"
          onClick={onSwitchCompany}
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {companyName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {companyName}
            </p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>

        {/* ════════════════════════════════════════════════════════════════════
           Zone C — Navigation
           ════════════════════════════════════════════════════════════════════ */}
        <nav className="mt-4 flex-1 overflow-y-auto px-3">
          {navGroups.map((group, gi) => (
            <div key={group.labelKey} className={gi > 0 ? 'mt-6' : ''}>
              {/* Group label */}
              <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {t(group.labelKey)}
              </p>

              {/* Items */}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      />
                      {t(item.key)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Divider ── */}
          <div className="my-4 border-t border-zinc-100 dark:border-zinc-800" />

          {/* ── Paramètres (standalone, after divider) ── */}
          <Link
            href={settingsHref}
            onClick={onClose}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive(settingsHref)
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Settings
              className={`h-4 w-4 shrink-0 ${
                isActive(settingsHref)
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            />
            {t('nav.settings')}
          </Link>
        </nav>

        {/* ════════════════════════════════════════════════════════════════════
           Zone D — User profile
           ════════════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 border-t border-zinc-100 px-3 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {userName
                ? userName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : '?'}
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1">
              {userName && (
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {userName}
                </p>
              )}
              {userEmail && (
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {userEmail}
                </p>
              )}
            </div>

            {/* Sign out */}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title={t('nav.signOut')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

EOF

# ---------------------------------------------------------------------------
# lib/supabase/people-types.ts
# ---------------------------------------------------------------------------
mkdir -p "lib/supabase"
cat << 'EOF' > "lib/supabase/people-types.ts"
// =============================================================================
// Sprint 6 — People & Ownership types
// =============================================================================

// ---------------------------------------------------------------------------
// company_people — Central person registry
// ---------------------------------------------------------------------------
export interface CompanyPerson {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string;
  is_canadian_resident: boolean;
  created_at: string;
  updated_at: string;
}

export type CompanyPersonInsert = Omit<CompanyPerson, 'id' | 'created_at' | 'updated_at'>;
export type CompanyPersonUpdate = Partial<CompanyPersonInsert>;

// ---------------------------------------------------------------------------
// director_mandates
// ---------------------------------------------------------------------------
export type DirectorEndReason =
  | 'resignation'
  | 'revocation'
  | 'death'
  | 'disqualification'
  | 'term_expired';

export interface DirectorMandate {
  id: string;
  company_id: string;
  person_id: string;
  appointment_date: string; // DATE as ISO string
  end_date: string | null;
  end_reason: DirectorEndReason | null;
  is_active: boolean;
  created_at: string;
}

export type DirectorMandateInsert = Omit<DirectorMandate, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// officer_appointments
// ---------------------------------------------------------------------------
export type OfficerTitle =
  | 'president'
  | 'secretary'
  | 'treasurer'
  | 'vice_president'
  | 'custom';

export interface OfficerAppointment {
  id: string;
  company_id: string;
  person_id: string;
  title: OfficerTitle;
  custom_title: string | null;
  is_primary_signing_authority: boolean;
  appointment_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export type OfficerAppointmentInsert = Omit<OfficerAppointment, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// share_classes
// ---------------------------------------------------------------------------
export type ShareClassType = 'common' | 'preferred';

export interface ShareClass {
  id: string;
  company_id: string;
  name: string;
  type: ShareClassType;
  voting_rights: boolean;
  votes_per_share: number;
  max_quantity: number | null;
  created_at: string;
}

export type ShareClassInsert = Omit<ShareClass, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// shareholdings
// ---------------------------------------------------------------------------
export interface Shareholding {
  id: string;
  company_id: string;
  person_id: string;
  share_class_id: string;
  quantity: number;
  issue_date: string;
  issue_price_per_share: number | null;
  certificate_number: string | null;
  created_at: string;
}

export type ShareholdingInsert = Omit<Shareholding, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// Joined / enriched types used by the UI
// ---------------------------------------------------------------------------

/** A director row joined with company_people */
export interface DirectorWithPerson extends DirectorMandate {
  person: CompanyPerson;
}

/** An officer row joined with company_people */
export interface OfficerWithPerson extends OfficerAppointment {
  person: CompanyPerson;
}

/** A shareholding row joined with company_people + share_classes */
export interface ShareholdingWithDetails extends Shareholding {
  person: CompanyPerson;
  share_class: ShareClass;
}

// ---------------------------------------------------------------------------
// "Roles summary" — all roles a given person holds
// ---------------------------------------------------------------------------
export interface PersonRoleSummary {
  person: CompanyPerson;
  directorMandates: DirectorMandate[];
  officerAppointments: OfficerAppointment[];
  shareholdings: (Shareholding & { share_class: ShareClass })[];
}

EOF

# ---------------------------------------------------------------------------
# messages/nav-en.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/nav-en.json"
{
  "nav": {
    "group": {
      "company": "COMPANY",
      "documents": "DOCUMENTS",
      "compliance": "COMPLIANCE"
    },
    "dashboard": "Dashboard",
    "directors": "Directors",
    "officers": "Officers",
    "shareholders": "Shareholders",
    "documents": "Documents",
    "resolutions": "Resolutions",
    "compliance": "Tracking",
    "settings": "Settings",
    "signOut": "Sign out"
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/nav-fr.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/nav-fr.json"
{
  "nav": {
    "group": {
      "company": "ENTREPRISE",
      "documents": "DOCUMENTS",
      "compliance": "CONFORMITÉ"
    },
    "dashboard": "Tableau de bord",
    "directors": "Administrateurs",
    "officers": "Dirigeants",
    "shareholders": "Actionnaires",
    "documents": "Documents",
    "resolutions": "Résolutions",
    "compliance": "Suivi",
    "settings": "Paramètres",
    "signOut": "Déconnexion"
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/officers-en.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/officers-en.json"
{
  "officers": {
    "_locale": "en",
    "title": "Officers",
    "appointOfficer": "Appoint Officer",
    "person": "Person",
    "role": "Position",
    "customTitle": "Custom title",
    "signingAuthority": "Authorized signatory",
    "appointmentDate": "Appointment date",
    "save": "Save",
    "cancel": "Cancel",
    "edit": "Edit",
    "replace": "Replace",
    "remove": "Remove",
    "replaceOfficer": "Replace Officer",
    "removeOfficer": "Remove Officer",
    "endDate": "End date",
    "confirmReplace": "Confirm replacement",
    "confirmRemove": "Confirm removal",
    "errorSelectPerson": "Please select a person.",
    "errorAppointmentDate": "Appointment date is required.",
    "errorCustomTitle": "Custom title is required."
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/officers-fr.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/officers-fr.json"
{
  "officers": {
    "_locale": "fr",
    "title": "Dirigeants",
    "appointOfficer": "Nommer un dirigeant",
    "person": "Personne",
    "role": "Poste",
    "customTitle": "Titre personnalisé",
    "signingAuthority": "Signataire autorisé",
    "appointmentDate": "Date de nomination",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "edit": "Modifier",
    "replace": "Remplacer",
    "remove": "Retirer",
    "replaceOfficer": "Remplacer le dirigeant",
    "removeOfficer": "Retirer le dirigeant",
    "endDate": "Date de fin",
    "confirmReplace": "Confirmer le remplacement",
    "confirmRemove": "Confirmer le retrait",
    "errorSelectPerson": "Veuillez sélectionner une personne.",
    "errorAppointmentDate": "La date de nomination est requise.",
    "errorCustomTitle": "Le titre personnalisé est requis."
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/onboarding-en.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/onboarding-en.json"
{
  "onboarding": {
    "_locale": "en"
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/onboarding-fr.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/onboarding-fr.json"
{
  "onboarding": {
    "_locale": "fr"
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/shareholders-en.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/shareholders-en.json"
{
  "shareholders": {
    "_locale": "en",
    "title": "Shareholders",
    "issueShares": "Issue Shares",
    "person": "Person",
    "shareClass": "Share class",
    "numberOfShares": "Number of shares",
    "pricePerShare": "Price per share",
    "issueDate": "Issue date",
    "certificateNumber": "Certificate number",
    "save": "Save",
    "cancel": "Cancel",
    "edit": "Edit",
    "transfer": "Transfer",
    "errorSelectPerson": "Please select a person.",
    "errorShareClass": "Please select a share class.",
    "errorQuantity": "Number of shares must be greater than 0.",
    "errorIssueDate": "Issue date is required."
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/shareholders-fr.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/shareholders-fr.json"
{
  "shareholders": {
    "_locale": "fr",
    "title": "Actionnaires",
    "issueShares": "Émettre des actions",
    "person": "Personne",
    "shareClass": "Classe d'actions",
    "numberOfShares": "Nombre d'actions",
    "pricePerShare": "Prix par action",
    "issueDate": "Date d'émission",
    "certificateNumber": "Numéro de certificat",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "edit": "Modifier",
    "transfer": "Transférer",
    "errorSelectPerson": "Veuillez sélectionner une personne.",
    "errorShareClass": "Veuillez sélectionner une classe d'actions.",
    "errorQuantity": "Le nombre d'actions doit être supérieur à 0.",
    "errorIssueDate": "La date d'émission est requise."
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/sprint6-en.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/sprint6-en.json"
{
  "people": {
    "selectPerson": "Select a person",
    "searchPeople": "Search…",
    "loading": "Loading…",
    "noResults": "No results",
    "addNewPerson": "Add a new person",
    "newPerson": "New person",
    "selectExisting": "Select an existing person",
    "fullName": "Full name",
    "email": "Email",
    "phone": "Phone",
    "address": "Address",
    "addressLine1Placeholder": "123 Main Street",
    "city": "City",
    "province": "Province",
    "postalCode": "Postal code",
    "canadianResident": "Canadian resident"
  },
  "directors": {
    "_locale": "en",
    "title": "Directors",
    "addDirector": "Add Director",
    "person": "Person",
    "appointmentDate": "Appointment date",
    "save": "Save",
    "cancel": "Cancel",
    "edit": "Edit",
    "remove": "Remove",
    "removeDirector": "Remove Director",
    "endReason": "End reason",
    "endDate": "End date",
    "confirmRemove": "Confirm removal",
    "errorSelectPerson": "Please select a person.",
    "errorAppointmentDate": "Appointment date is required."
  }
}

EOF

# ---------------------------------------------------------------------------
# messages/sprint6-fr.json
# ---------------------------------------------------------------------------
mkdir -p "messages"
cat << 'EOF' > "messages/sprint6-fr.json"
{
  "people": {
    "selectPerson": "Sélectionner une personne",
    "searchPeople": "Rechercher…",
    "loading": "Chargement…",
    "noResults": "Aucun résultat",
    "addNewPerson": "Ajouter une nouvelle personne",
    "newPerson": "Nouvelle personne",
    "selectExisting": "Sélectionner une personne existante",
    "fullName": "Nom complet",
    "email": "Courriel",
    "phone": "Téléphone",
    "address": "Adresse",
    "addressLine1Placeholder": "123, rue Principale",
    "city": "Ville",
    "province": "Province",
    "postalCode": "Code postal",
    "canadianResident": "Résident canadien"
  },
  "directors": {
    "_locale": "fr",
    "title": "Administrateurs",
    "addDirector": "Ajouter un administrateur",
    "person": "Personne",
    "appointmentDate": "Date de nomination",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "edit": "Modifier",
    "remove": "Retirer",
    "removeDirector": "Retirer l'administrateur",
    "endReason": "Motif de fin de mandat",
    "endDate": "Date de fin",
    "confirmRemove": "Confirmer le retrait",
    "errorSelectPerson": "Veuillez sélectionner une personne.",
    "errorAppointmentDate": "La date de nomination est requise."
  }
}

EOF

# ---------------------------------------------------------------------------
# supabase/migrations/20260405_sprint6_people_ownership.sql
# ---------------------------------------------------------------------------
mkdir -p "supabase/migrations"
cat << 'EOF' > "supabase/migrations/20260405_sprint6_people_ownership.sql"
-- =============================================================================
-- Sprint 6 — People & Ownership — SQL Migration
-- Run this in Supabase SQL Editor BEFORE deploying the frontend code.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. company_people — Central person registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_people (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_city TEXT,
  address_province TEXT,
  address_postal_code TEXT,
  address_country TEXT DEFAULT 'CA',
  is_canadian_resident BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE company_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company people"
  ON company_people FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_company_people_company_id ON company_people(company_id);

-- ---------------------------------------------------------------------------
-- 2. director_mandates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS director_mandates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  end_date DATE,
  end_reason TEXT CHECK (end_reason IN ('resignation', 'revocation', 'death', 'disqualification', 'term_expired')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE director_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company director mandates"
  ON director_mandates FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_director_mandates_company_id ON director_mandates(company_id);
CREATE INDEX idx_director_mandates_person_id ON director_mandates(person_id);
CREATE INDEX idx_director_mandates_active ON director_mandates(company_id, is_active);

-- ---------------------------------------------------------------------------
-- 3. officer_appointments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS officer_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (title IN ('president', 'secretary', 'treasurer', 'vice_president', 'custom')),
  custom_title TEXT,
  is_primary_signing_authority BOOLEAN DEFAULT FALSE,
  appointment_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE officer_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company officer appointments"
  ON officer_appointments FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_officer_appointments_company_id ON officer_appointments(company_id);
CREATE INDEX idx_officer_appointments_person_id ON officer_appointments(person_id);

-- ---------------------------------------------------------------------------
-- 4. share_classes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS share_classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'common' CHECK (type IN ('common', 'preferred')),
  voting_rights BOOLEAN DEFAULT TRUE,
  votes_per_share INTEGER DEFAULT 1,
  max_quantity INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE share_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company share classes"
  ON share_classes FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_share_classes_company_id ON share_classes(company_id);

-- ---------------------------------------------------------------------------
-- 5. shareholdings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shareholdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  share_class_id UUID NOT NULL REFERENCES share_classes(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  issue_date DATE NOT NULL,
  issue_price_per_share DECIMAL(12,4),
  certificate_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shareholdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company shareholdings"
  ON shareholdings FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_shareholdings_company_id ON shareholdings(company_id);
CREATE INDEX idx_shareholdings_person_id ON shareholdings(person_id);
CREATE INDEX idx_shareholdings_share_class_id ON shareholdings(share_class_id);

-- ---------------------------------------------------------------------------
-- 6. Deprecate old table
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS company_officers RENAME TO company_officers_deprecated;

-- ---------------------------------------------------------------------------
-- 7. updated_at trigger for company_people
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_company_people_updated_at
  BEFORE UPDATE ON company_people
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

EOF

echo ""
echo "⚡ Sprint 6 — 34 files created successfully!"
echo "Next: run the SQL migration in Supabase, then merge your i18n JSON files."
