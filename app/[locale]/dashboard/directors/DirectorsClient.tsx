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
} from 'lucide-react';
import DirectorCard from '@/components/directors/DirectorCard';
import { LegalTerm } from '@/components/ui/LegalTerm';
import AddDirectorModal from '@/components/directors/AddDirectorModal';
import RemoveDirectorModal from '@/components/directors/RemoveDirectorModal';
import EditFormerDirectorModal from '@/components/directors/EditFormerDirectorModal';
import GenerateLifecycleResolutionDialog from '@/components/lifecycle/GenerateLifecycleResolutionDialog';
import { getDocumentState } from '@/lib/minute-book/state';
import { formatDate } from '@/lib/utils';
import type {
  CompanyPerson,
  DirectorMandate,
  DirectorWithPerson,
  OfficerAppointment,
  Shareholding,
  ShareholdingHolder,
  ShareClass,
} from '@/lib/supabase/people-types';

interface DirectorsClientProps {
  /** users.preferred_language — document language for generated resolutions.
   *  Independent of UI locale (Two-Layer Language Model, CLAUDE.md §3). */
  preferredLanguage: 'fr' | 'en';
}

export default function DirectorsClient({ preferredLanguage }: DirectorsClientProps) {
  const t = useTranslations('directors');
  const tDocs = useTranslations('documents');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [directors, setDirectors] = useState<DirectorWithPerson[]>([]);
  // Phase 1C: keep person embed on ended rows so the "former directors"
  // section can render full_name without a separate lookup. The card prop
  // `endedMandates: DirectorMandate[]` still accepts these via covariance.
  const [endedMandates, setEndedMandates] = useState<DirectorWithPerson[]>([]);
  const [officerAppointments, setOfficerAppointments] = useState<OfficerAppointment[]>([]);
  const [shareholdings, setShareholdings] = useState<(Shareholding & { share_class: ShareClass; holders: ShareholdingHolder[] })[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDirector, setEditingDirector] = useState<DirectorWithPerson | null>(null);
  const [removingDirector, setRemovingDirector] = useState<DirectorWithPerson | null>(null);
  // Phase 1B-CAPTURE Bundle 2: per-row edit affordance on former-mandate rows.
  const [editingFormerMandate, setEditingFormerMandate] = useState<DirectorWithPerson | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // #19d Brief 2b — per-row lifecycle act state (from event-completeness)
  // keyed by `${event_type}|${event_id}|${event_phase}`. Each former row's
  // departure act is looked up here to decide button vs draft-state.
  const [actsMap, setActsMap] = useState<Map<string, { satisfied: boolean; documentId: string | null; documentSource: 'uploaded' | 'generated' | null; documentIsFinalized: boolean | null }>>(new Map());
  // Generate-dialog target: the mandate row that opened the dialog.
  const [generatingFor, setGeneratingFor] = useState<DirectorWithPerson | null>(null);

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

    // Phase 1B-view: fetch ALL mandates (active + ended). Active rows remain
    // the default display list (`directors`); ended rows feed the per-card
    // history disclosure via `endedMandates` filtered by person_id.
    // Phase 1B-CAPTURE Bundle 2: exclude soft-deleted rows from both partitions
    // (audit §8d row 1 — leak filter into former section).
    const { data: mandatesRaw } = await supabase
      .from('director_mandates')
      .select('*, person:company_people(*)')
      .eq('company_id', cid)
      .is('deleted_at', null)
      .order('appointment_date', { ascending: true });

    const activeRows = (mandatesRaw || []).filter((row: any) => row.is_active);
    const endedRows = (mandatesRaw || []).filter((row: any) => !row.is_active);
    setDirectors(activeRows.map((row: any) => ({ ...row, person: row.person as CompanyPerson })));
    setEndedMandates(endedRows.map((row: any) => ({ ...row, person: row.person as CompanyPerson })));

    const { data: officersRaw } = await supabase
      .from('officer_appointments').select('*').eq('company_id', cid).eq('is_active', true);
    setOfficerAppointments((officersRaw as OfficerAppointment[]) || []);

    // Atom 2: embed shareholding_holders so getShareholdingsForPerson can
    // join through the polymorphic holder table. Minimal embed (no person /
    // entity hydration) — only holder_type + person_id are consumed here.
    const { data: sharesRaw } = await supabase
      .from('shareholdings')
      .select('*, share_class:share_classes(*), holders:shareholding_holders(*)')
      .eq('company_id', cid).is('end_date', null);
    setShareholdings((sharesRaw || []).map((row: any) => ({
      ...row,
      share_class: row.share_class as ShareClass,
      holders: (row.holders ?? []) as ShareholdingHolder[],
    })));

    // #19d Brief 2b — pull the per-act satisfaction map (event-completeness).
    // Non-fatal: if it 404s / 500s, the rows simply render as if no acts
    // are satisfied (button shown). Logged to console for visibility.
    try {
      const res = await fetch('/api/minute-book/event-completeness');
      if (res.ok) {
        const payload = (await res.json()) as {
          acts?: Array<{ event_type: string; event_id: string; event_phase: string; satisfied: boolean; documentId: string | null; documentSource: 'uploaded' | 'generated' | null; documentIsFinalized: boolean | null }>;
        };
        const m = new Map<string, { satisfied: boolean; documentId: string | null; documentSource: 'uploaded' | 'generated' | null; documentIsFinalized: boolean | null }>();
        for (const a of payload.acts ?? []) {
          m.set(`${a.event_type}|${a.event_id}|${a.event_phase}`, {
            satisfied: a.satisfied,
            documentId: a.documentId,
            documentSource: a.documentSource,
            documentIsFinalized: a.documentIsFinalized,
          });
        }
        setActsMap(m);
      } else {
        console.warn('[DirectorsClient] event-completeness fetch non-OK:', res.status);
      }
    } catch (e) {
      console.warn('[DirectorsClient] event-completeness fetch failed:', e);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isCBCA = jurisdiction === 'CBCA';
  const totalDirectors = directors.length;
  const canadianDirectors = directors.filter((d) => d.person.is_canadian_resident).length;
  const residencyPct = totalDirectors > 0 ? Math.round((canadianDirectors / totalDirectors) * 100) : 0;
  const residencyOk = !isCBCA || residencyPct >= 25;
  const existingDirectorPersonIds = directors.map((d) => d.person_id);

  // Phase 1C: derive fully-former directors (ended rows whose person_id is NOT
  // present in the active list). Group multiple ended mandates under the same
  // person so e.g. an appoint→remove→re-appoint→remove history shows as one
  // entry with two periods listed. People with an active card show their
  // ended segments via the per-card disclosure, NOT here — no overlap.
  const activePersonIdSet = new Set(directors.map((d) => d.person_id));
  const formerDirectors = Object.values(
    endedMandates
      .filter((m) => !activePersonIdSet.has(m.person_id))
      .reduce((acc, m) => {
        if (!acc[m.person_id]) {
          acc[m.person_id] = { person_id: m.person_id, person: m.person, mandates: [] };
        }
        acc[m.person_id].mandates.push(m);
        return acc;
      }, {} as Record<string, { person_id: string; person: CompanyPerson; mandates: DirectorMandate[] }>)
  );

  function getOfficerAppointmentsForPerson(personId: string) { return officerAppointments.filter((oa) => oa.person_id === personId); }
  function getEndedMandatesForPerson(personId: string) { return endedMandates.filter((em) => em.person_id === personId); }
  // Atom 2: a person "holds" a shareholding when they appear as an individual
  // holder on its shareholding_holders join row. Entity-typed director scenarios
  // (director sits via a corporate trustee) are atom 3+ scope per Q-R-G2-B.
  function getShareholdingsForPerson(personId: string) {
    return shareholdings.filter((sh) =>
      sh.holders?.some((h) => h.holder_type === 'individual' && h.person_id === personId) ?? false
    );
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
            {locale === 'fr' ? "Conseil d'administration" : 'Board of Directors'}
          </h1>
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
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {totalDirectors > 0
            ? locale === 'fr'
              ? `${totalDirectors} administrateur${totalDirectors > 1 ? 's' : ''} actif${totalDirectors > 1 ? 's' : ''}`
              : `${totalDirectors} active director${totalDirectors > 1 ? 's' : ''}`
            : locale === 'fr' ? 'Aucun administrateur enregistré' : 'No directors registered'}
        </p>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div />
        <button
          type="button"
          onClick={() => { setEditingDirector(null); setShowAddModal(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-4 py-2 text-sm font-semibold text-[var(--navy-900)] shadow-sm transition-colors hover:bg-[var(--spark-400)]"
        >
          <Zap className="h-4 w-4" />
          {t('addDirector')}
        </button>
      </div>

      {/* CBCA residency compliance badge (sole 25%-resident readout for this page).
          Active-count was previously rendered here as well; removed 2026-05-22 to dedupe
          against the H1 subtitle. Outer conditional tightened to `isCBCA` so LSAQ tenants
          do not see an empty bar. See docs/audit-people-surfaces-2026-05-22.md B.1. */}
      {totalDirectors > 0 && isCBCA && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-3">
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${residencyOk ? 'bg-emerald-100 text-emerald-700' : 'border'}`}
            style={residencyOk ? undefined : { backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-border)' }}
          >
            {residencyOk ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {locale === 'fr'
              ? <><LegalTerm termKey="resident_canadien" lang="fr" /> : {residencyPct}%</>
              : <><LegalTerm termKey="resident_canadien" lang="en" />: {residencyPct}%</>}
            {residencyOk ? ' ✔' : locale === 'fr' ? ' — minimum 25% requis' : ' — 25% minimum required'}
          </div>
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
              endedMandates={getEndedMandatesForPerson(director.person_id)}
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
            {locale === 'fr'
              ? <>Aucun <LegalTerm termKey="administrateur" lang="fr" /> enregistré</>
              : <>No <LegalTerm termKey="administrateur" lang="en" /> registered</>}
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

      {/* Phase 1C: Former directors section. Visible by default (not collapsed)
          so adds/removes give immediate feedback. Hidden entirely when no
          fully-former directors exist. Each person grouped — multiple
          ended mandates listed as periods under one name. */}
      {formerDirectors.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-heading)] mb-3">
            {t('formerSectionTitle', { count: formerDirectors.length })}
          </h2>
          <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            {formerDirectors.map((group) => (
              <div key={group.person_id} className="text-sm">
                <div className="font-medium text-[var(--text-body)]">{group.person.full_name}</div>
                <div className="mt-1 space-y-0.5 text-xs">
                  {group.mandates.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-3 text-[var(--text-muted)]">
                      <div>
                        <span className="font-medium">{t('formerDirector')}</span>
                        {' — '}
                        {t('startedOn', {
                          date: formatDate(m.appointment_date, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
                        })}
                        {m.end_date && (
                          <>
                            {' · '}
                            {t('endedOn', {
                              date: formatDate(m.end_date, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
                            })}
                          </>
                        )}
                        {m.end_reason && (
                          <span>
                            {' · '}
                            {t(`endReasons.${m.end_reason}`)}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {(() => {
                          // Per-row departure-act lookup. Only render the affordance
                          // when the row has an end_date (the act is flaggable per the
                          // #19c rules — see lib/minute-book/event-completeness.ts L13).
                          if (!m.end_date) return null;
                          const key = `director_mandate|${m.id}|departure`;
                          const act = actsMap.get(key);
                          if (act?.satisfied && act.documentId) {
                            const state = getDocumentState({
                              satisfied: act.satisfied,
                              source: act.documentSource,
                              is_finalized: act.documentIsFinalized,
                            });
                            return (
                              <>
                                {state === 'généré' && (
                                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)]">
                                    {tDocs('toSignBadge')}
                                  </span>
                                )}
                                <a
                                  href={`/api/documents/${act.documentId}/download?preview=true`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
                                >
                                  {t('viewDocument')}
                                </a>
                              </>
                            );
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => setGeneratingFor(m as DirectorWithPerson)}
                              className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
                            >
                              {t('generateResolution')}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => setEditingFormerMandate(m as DirectorWithPerson)}
                          className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
                        >
                          {t('edit')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
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
      {editingFormerMandate && (
        <EditFormerDirectorModal
          mandate={editingFormerMandate}
          onClose={() => setEditingFormerMandate(null)}
          onSuccess={() => { setEditingFormerMandate(null); fetchData(); }}
        />
      )}
      {generatingFor && companyId && (() => {
        // docKey derivation (Brief 2b lock):
        //   end_reason === 'revocation' → director_removal (shareholder)
        //   everything else              → director_departure (board)
        const isRemoval = generatingFor.end_reason === 'revocation';
        const docKey = isRemoval ? 'director_removal' : 'director_departure';
        const instrument: 'board' | 'shareholder' = isRemoval ? 'shareholder' : 'board';
        // Reason label only needed for director_departure (the board-acknowledged
        // departures); director_removal omits endReason per the registry.
        const reasonLabel =
          !isRemoval && generatingFor.end_reason
            ? t(`endReasons.${generatingFor.end_reason}`)
            : undefined;
        return (
          <GenerateLifecycleResolutionDialog
            companyId={companyId}
            docKey={docKey}
            instrument={instrument}
            eventId={generatingFor.id}
            personName={generatingFor.person.full_name}
            roleLabel={locale === 'fr' ? 'Administrateur' : 'Director'}
            eventDate={generatingFor.end_date ?? ''}
            reasonLabel={reasonLabel}
            language={preferredLanguage}
            onClose={() => setGeneratingFor(null)}
            onSuccess={() => { setGeneratingFor(null); fetchData(); }}
          />
        );
      })()}
    </div>
  );
}
