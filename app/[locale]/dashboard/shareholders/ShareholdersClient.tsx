'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { Zap, PieChart, Info, Loader2, Plus } from 'lucide-react';
import CapTableChart from '@/components/shareholders/CapTableChart';
import { LegalTerm } from '@/components/ui/LegalTerm';
import ShareClassCard from '@/components/shareholders/ShareClassCard';
import ShareholderCard from '@/components/shareholders/ShareholderCard';
import IssueSharesModal from '@/components/shareholders/IssueSharesModal';
import ShareClassModal from '@/components/shareholders/ShareClassModal';
import EditShareholdingModal from '@/components/shareholders/EditShareholdingModal';
import EditPersonModal from '@/components/people/EditPersonModal';
import EndShareholdingModal from '@/components/shareholders/EndShareholdingModal';
import TransferShareholdingModal from '@/components/shareholders/TransferShareholdingModal';
import EditFormerShareholdingModal from '@/components/shareholders/EditFormerShareholdingModal';
import GenerateLifecycleResolutionDialog from '@/components/lifecycle/GenerateLifecycleResolutionDialog';
import { holderName, type RawHolder } from '@/lib/minute-book/holder-name';
import { getDocumentState } from '@/lib/minute-book/state';
import { formatDate } from '@/lib/utils';
import type {
  CompanyPerson,
  ShareClass,
  ShareholdingWithDetails,
  ShareholdingHolderWithDetails,
  DirectorMandate,
  OfficerAppointment,
} from '@/lib/supabase/people-types';

interface ShareholdersClientProps {
  /** users.preferred_language — document language for generated resolutions.
   *  Independent of UI locale (Two-Layer Language Model, CLAUDE.md §3). */
  preferredLanguage: 'fr' | 'en';
}

export default function ShareholdersClient({ preferredLanguage }: ShareholdersClientProps) {
  const t = useTranslations('shareholders');
  const tDocs = useTranslations('documents');
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
  const [showShareClassModal, setShowShareClassModal] = useState(false);
  const [editingShareClass, setEditingShareClass] = useState<ShareClass | null>(null);
  const [editingShareholding, setEditingShareholding] = useState<ShareholdingWithDetails | null>(null);
  // L'IDENTITE, distincte de la participation ci-dessus. Personnes physiques
  // seulement : la carte ne leve ce lien que si !isEntity && person.
  const [editingPerson, setEditingPerson] = useState<CompanyPerson | null>(null);
  // #19d Phase 3 (cessation) — per-row state for end / edit-former / generate.
  const [endingShareholding, setEndingShareholding] = useState<ShareholdingWithDetails | null>(null);
  // #19d Phase 3 close — per-holding "Transférer" target. PER-HOLDING granularity
  // mirrors the cessation / issuance slots above.
  const [transferingShareholding, setTransferingShareholding] = useState<ShareholdingWithDetails | null>(null);
  const [editingFormerShareholding, setEditingFormerShareholding] = useState<ShareholdingWithDetails | null>(null);
  const [generatingForShareholding, setGeneratingForShareholding] = useState<ShareholdingWithDetails | null>(null);
  // #19d Phase 3 (issuance) — per-holding state for the share_issuance generate dialog.
  const [generatingIssuanceForShareholding, setGeneratingIssuanceForShareholding] = useState<ShareholdingWithDetails | null>(null);
  // #19d Phase 3 close — per-holding state for the share_transfer generate
  // dialog. Distinct from generatingForShareholding (cessation) so the
  // former-row dispatch can branch on sh.end_reason without setter collision.
  const [generatingTransferForShareholding, setGeneratingTransferForShareholding] = useState<ShareholdingWithDetails | null>(null);
  // from_shareholding_id → {transfer.id, transfer_date, to-side holders}.
  // Built from a side-fetch in fetchData; the former-holdings per-row dispatch
  // uses this to resolve the correct eventId / eventDate / transferee name
  // when a row's end_reason === 'transfer'.
  const [transferByFromShId, setTransferByFromShId] = useState<Map<string, { id: string; transfer_date: string; to_holders: RawHolder[] | null }>>(new Map());
  // Per-row lifecycle act state (from /api/minute-book/event-completeness)
  // keyed by `${event_type}|${event_id}|${event_phase}` — mirrors DirectorsClient
  // pattern. Used to flip Generate→Voir + show "À signer" badge once a doc
  // has been generated for a given act.
  const [actsMap, setActsMap] = useState<Map<string, { satisfied: boolean; documentId: string | null; documentSource: 'uploaded' | 'generated' | null; documentIsFinalized: boolean | null }>>(new Map());
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Aligned with the ten server pages: status='active' + single(), and NO
    // .limit(1). It was limit(1) — not the missing sort — that made this silent:
    // it truncated to one row BEFORE single() could object, so two active companies
    // resolved to an arbitrary one while the page header resolved none. No ORDER BY
    // on purpose: two active companies should be impossible, and a case that should
    // be impossible must fail, not be made deterministic.
    const { data: company } = await supabase
      .from('companies').select('id, incorporation_date').eq('user_id', user.id).eq('status', 'active').single();
    if (!company) { setLoading(false); return; }

    setCompanyId(company.id);
    setIncorporationDate(company.incorporation_date);
    const cid = company.id;

    const { data: classesRaw } = await supabase
      .from('share_classes').select('*').eq('company_id', cid).order('created_at', { ascending: true });
    setShareClasses((classesRaw as ShareClass[]) || []);

    // Atom 2: holder identity lives on shareholding_holders. SELECT embeds the
    // join with both polymorphic targets (person + entity). Transitional
    // `person` field is hydrated from holders[0]?.person per Q-R-G2-C — null
    // for entity holders / joint holdings; deprecated, slated for removal in
    // atom 3. Downstream consumers should read `holders` directly.
    const { data: shRaw } = await supabase
      .from('shareholdings')
      .select('*, holders:shareholding_holders(*, person:company_people(*), entity:shareholder_entities(*)), share_class:share_classes(*)')
      .eq('company_id', cid).order('issue_date', { ascending: true });
    setShareholdings((shRaw || []).map((row: any) => {
      const holders = ((row.holders ?? []) as ShareholdingHolderWithDetails[])
        .slice()
        .sort((a, b) => a.display_order - b.display_order);
      return {
        ...row,
        holders,
        person: holders[0]?.person ?? null,
        share_class: row.share_class as ShareClass,
      } as ShareholdingWithDetails;
    }));

    const { data: mandatesRaw } = await supabase
      .from('director_mandates').select('*').eq('company_id', cid).eq('is_active', true);
    setDirectorMandates((mandatesRaw as DirectorMandate[]) || []);

    const { data: officersRaw } = await supabase
      .from('officer_appointments').select('*').eq('company_id', cid).eq('is_active', true);
    setOfficerAppointments((officersRaw as OfficerAppointment[]) || []);

    // #19d Phase 3 close — pull share_transfers + embed to-side holders so
    // the former-holdings per-row dispatch can resolve transferee at render.
    // Keyed by from_shareholding_id (the source holding that appears in the
    // former-holdings view). Disambiguated embed via !to_shareholding_id.
    const { data: transfersRaw } = await supabase
      .from('share_transfers')
      .select('id, from_shareholding_id, transfer_date, to_sh:shareholdings!to_shareholding_id(holders:shareholding_holders(holder_type, person:company_people(full_name), entity:shareholder_entities(legal_name)))')
      .eq('company_id', cid);
    const trMap = new Map<string, { id: string; transfer_date: string; to_holders: RawHolder[] | null }>();
    for (const tr of ((transfersRaw ?? []) as unknown) as Array<{ id: string; from_shareholding_id: string; transfer_date: string; to_sh: { holders: RawHolder[] | null } | null }>) {
      trMap.set(tr.from_shareholding_id, { id: tr.id, transfer_date: tr.transfer_date, to_holders: tr.to_sh?.holders ?? null });
    }
    setTransferByFromShId(trMap);

    // #19d Phase 3 — pull per-act satisfaction map for cessation acts.
    // Non-fatal: if it 404s / 500s, rows render as if no acts are satisfied.
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
        console.warn('[ShareholdersClient] event-completeness fetch non-OK:', res.status);
      }
    } catch (e) {
      console.warn('[ShareholdersClient] event-completeness fetch failed:', e);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentShareholdings = useMemo(
    () => shareholdings.filter((s) => s.end_date === null),
    [shareholdings]
  );

  // #19d Phase 3 — former holdings are listed PER-HOLDING (NOT grouped by
  // person), since a person may have partially ceased holdings while
  // retaining other active ones. This matches the brief's locked
  // PER-HOLDING capture granularity. Sort newest-cessation first.
  const formerShareholdings = useMemo(
    () =>
      shareholdings
        .filter((s) => s.end_date !== null)
        .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? '')),
    [shareholdings]
  );

  const totalIssued = useMemo(() => currentShareholdings.reduce((sum, s) => sum + s.quantity, 0), [currentShareholdings]);

  // Atom 3: group active holdings by a unified holder key (person_id OR
  // entity_id) so entity-holders render a card like persons. Each group keeps
  // the resolved personId (null for entities) for director/officer lookups.
  const shareholderGroups = useMemo(() => {
    const map = new Map<string, { key: string; personId: string | null; holdings: ShareholdingWithDetails[] }>();
    const order: string[] = [];
    currentShareholdings.forEach((sh) => {
      const h0 = sh.holders?.[0];
      const key = h0?.person_id ?? h0?.entity_id ?? null;
      if (key === null) return;
      let group = map.get(key);
      if (!group) {
        group = { key, personId: h0?.person_id ?? null, holdings: [] };
        map.set(key, group);
        order.push(key);
      }
      group.holdings.push(sh);
    });
    return order.map((k) => map.get(k)!);
  }, [currentShareholdings]);

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

  const hasShareholders = currentShareholdings.length > 0;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            {locale === 'fr' ? 'Structure du capital' : 'Capital Structure'}
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
                  ? "Les actionnaires sont les propriétaires de l'entreprise. Le registre des actionnaires et le tableau de capitalisation sont des documents légaux essentiels."
                  : 'Shareholders are the owners of the company. The shareholder register and cap table are essential legal documents.'}
              </div>
            )}
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {hasShareholders
            ? locale === 'fr'
              ? `${totalIssued.toLocaleString('fr-CA')} actions émises`
              : `${totalIssued.toLocaleString('en-CA')} shares issued`
            : locale === 'fr' ? 'Aucun actionnaire enregistré' : 'No shareholders registered'}
        </p>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div />
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
          <CapTableChart key={`${totalIssued}-${currentShareholdings.length}`} shareholdings={currentShareholdings} totalIssued={totalIssued} />

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {locale === 'fr' ? "Classes d'actions" : 'Share Classes'}
            </h3>
            <div className="space-y-2">
              {shareClasses.map((sc) => (
                <ShareClassCard
                  key={sc.id}
                  shareClass={sc}
                  onEdit={(sc) => { setEditingShareClass(sc); setShowShareClassModal(true); }}
                />
              ))}
              <button
                type="button"
                onClick={() => { setEditingShareClass(null); setShowShareClassModal(true); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--amber-400)] hover:bg-[rgba(245,185,30,0.06)] hover:text-[var(--text-body)]"
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
              {shareholderGroups.map((group) => (
                <ShareholderCard
                  key={group.key}
                  shareholdings={group.holdings}
                  totalIssuedShares={totalIssued}
                  directorMandates={group.personId ? getDirectorMandatesForPerson(group.personId) : []}
                  officerAppointments={group.personId ? getOfficerAppointmentsForPerson(group.personId) : []}
                  onEdit={(sh) => { setEditingPerson(null); setEditingShareholding(sh); }}
                  onEditPerson={(p) => { setEditingShareholding(null); setEditingPerson(p); }}
                  onEndShareholding={(sh) => setEndingShareholding(sh)}
                  getIssuanceAct={(id) => actsMap.get(`shareholding|${id}|issuance`)}
                  onGenerateIssuance={(sh) => setGeneratingIssuanceForShareholding(sh)}
                  onTransfer={(sh) => setTransferingShareholding(sh)}
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
            {locale === 'fr'
              ? <>Aucun <LegalTerm termKey="actionnaire" lang="fr" /> enregistré</>
              : <>No <LegalTerm termKey="actionnaire" lang="en" /> registered</>}
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

      {/* #19d Phase 3 — former-shareholders section. PER-HOLDING list (one row
          per former holding) so partial cessations show distinctly from full
          exits. Per-row affordances mirror DirectorsClient: "À signer" badge +
          Voir le document when a cessation resolution already exists in
          event_documents; otherwise "Générer la résolution" opens the
          GenerateLifecycleResolutionDialog. Edit affordance opens
          EditFormerShareholdingModal. */}
      {formerShareholdings.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-heading)] mb-3">
            {t('formerSectionTitle', { count: formerShareholdings.length })}
          </h2>
          <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            {formerShareholdings.map((sh) => {
              const name =
                holderName(sh.holders as unknown as RawHolder[]) ??
                (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');
              return (
                <div key={sh.id} className="text-sm">
                  <div className="font-medium text-[var(--text-body)]">{name}</div>
                  <div className="mt-1 flex items-start justify-between gap-3 text-xs text-[var(--text-muted)]">
                    <div>
                      <span className="font-medium">{t('formerShareholder')}</span>
                      {' — '}
                      {sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                      {sh.share_class.name}
                      {sh.certificate_number ? ` · #${sh.certificate_number}` : ''}
                      {' · '}
                      {t('startedOn', {
                        date: formatDate(sh.issue_date, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
                      })}
                      {sh.end_date && (
                        <>
                          {' · '}
                          {t('endedOn', {
                            date: formatDate(sh.end_date, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
                          })}
                        </>
                      )}
                      {sh.end_reason && (
                        <span>
                          {' · '}
                          {t(`endReasons.${sh.end_reason}`)}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {(() => {
                        // Per-row affordance lookup. Transferred rows
                        // (end_reason === 'transfer') route to a share_transfer
                        // act keyed by share_transfers.id; everything else
                        // routes to share_cessation keyed by shareholdings.id.
                        if (!sh.end_date) return null;
                        const isTransfer = sh.end_reason === 'transfer';
                        const transfer = isTransfer ? transferByFromShId.get(sh.id) : undefined;
                        if (isTransfer && !transfer) {
                          // share_transfers row not loaded yet (race) — render
                          // nothing for this slot rather than risk wrong dispatch.
                          // Act still surfaces on Complétude.
                          return null;
                        }
                        const key = isTransfer
                          ? `share_transfer|${transfer!.id}|transfer`
                          : `shareholding|${sh.id}|cessation`;
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
                            onClick={() =>
                              isTransfer
                                ? setGeneratingTransferForShareholding(sh)
                                : setGeneratingForShareholding(sh)
                            }
                            className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
                          >
                            {t('generateResolution')}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setEditingFormerShareholding(sh)}
                        className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
                      >
                        {t('edit')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasShareholders && shareClasses.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {locale === 'fr' ? "Classes d'actions disponibles" : 'Available Share Classes'}
          </h3>
          <div className="space-y-2">
            {shareClasses.map((sc) => (
              <ShareClassCard
                key={sc.id}
                shareClass={sc}
                onEdit={(sc) => { setEditingShareClass(sc); setShowShareClassModal(true); }}
              />
            ))}
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

      {showShareClassModal && companyId && (
        <ShareClassModal
          companyId={companyId}
          shareClass={editingShareClass}
          onClose={() => { setShowShareClassModal(false); setEditingShareClass(null); }}
          onSuccess={() => { setShowShareClassModal(false); setEditingShareClass(null); fetchData(); }}
        />
      )}

      {editingPerson && companyId && (
        <EditPersonModal
          person={editingPerson}
          companyId={companyId}
          onClose={() => setEditingPerson(null)}
          onSuccess={() => { setEditingPerson(null); fetchData(); }}
        />
      )}
      {editingShareholding && companyId && (
        <EditShareholdingModal
          shareholding={editingShareholding}
          shareClasses={shareClasses}
          onClose={() => setEditingShareholding(null)}
          onSuccess={() => { setEditingShareholding(null); fetchData(); }}
        />
      )}

      {endingShareholding && (
        <EndShareholdingModal
          shareholding={endingShareholding}
          onClose={() => setEndingShareholding(null)}
          onSuccess={() => { setEndingShareholding(null); fetchData(); }}
        />
      )}

      {transferingShareholding && (
        <TransferShareholdingModal
          shareholding={transferingShareholding}
          onClose={() => setTransferingShareholding(null)}
          onSuccess={() => { setTransferingShareholding(null); fetchData(); }}
        />
      )}

      {editingFormerShareholding && (
        <EditFormerShareholdingModal
          shareholding={editingFormerShareholding}
          isTransfer={editingFormerShareholding.end_reason === 'transfer'}
          transferDate={transferByFromShId.get(editingFormerShareholding.id)?.transfer_date ?? null}
          onClose={() => setEditingFormerShareholding(null)}
          onSuccess={() => { setEditingFormerShareholding(null); fetchData(); }}
        />
      )}

      {generatingForShareholding && companyId && (() => {
        // #19d Phase 3 — share_cessation dispatch. docKey is fixed (only one
        // cessation key per locked decision — endReason is carried as a token,
        // not a docKey discriminator). Instrument='board' per the registry
        // entry; signers come from the board's current state. extraFacts
        // passes shares + share class to the dialog's event-facts block.
        const sh = generatingForShareholding;
        const name =
          holderName(sh.holders as unknown as RawHolder[]) ??
          (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');
        const reasonLabel = sh.end_reason
          ? t(`endReasons.${sh.end_reason}`)
          : undefined;
        const extraFacts = [
          {
            label: locale === 'fr' ? 'Actions' : 'Shares',
            value: sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA'),
          },
          {
            label: locale === 'fr' ? "Classe d'actions" : 'Share class',
            value: sh.share_class.name,
          },
        ];
        return (
          <GenerateLifecycleResolutionDialog
            companyId={companyId}
            docKey="share_cessation"
            instrument="board"
            eventId={sh.id}
            personName={name}
            roleLabel={locale === 'fr' ? 'Actionnaire' : 'Shareholder'}
            eventDate={sh.end_date ?? ''}
            reasonLabel={reasonLabel}
            extraFacts={extraFacts}
            language={preferredLanguage}
            onClose={() => setGeneratingForShareholding(null)}
            onSuccess={() => { setGeneratingForShareholding(null); fetchData(); }}
          />
        );
      })()}

      {generatingTransferForShareholding && companyId && (() => {
        // #19d Phase 3 close — share_transfer dispatch. Looks up the
        // share_transfers row by from_shareholding_id (sh.id is the SOURCE
        // holding shown in the former-holdings view). Dialog gets
        // eventId=transfer.id (NOT sh.id) so the orchestrator's
        // share_transfer arm finds the right row.
        const sh = generatingTransferForShareholding;
        const transfer = transferByFromShId.get(sh.id);
        if (!transfer) return null;
        const transferorName =
          holderName(sh.holders as unknown as RawHolder[]) ??
          (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');
        const transfereeName =
          holderName(transfer.to_holders) ??
          (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');
        const extraFacts: Array<{ label: string; value: string }> = [
          {
            label: locale === 'fr' ? 'Actions' : 'Shares',
            value: sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA'),
          },
          {
            label: locale === 'fr' ? "Classe d'actions" : 'Share class',
            value: sh.share_class.name,
          },
          {
            label: t('newHolder'),
            value: transfereeName,
          },
        ];
        return (
          <GenerateLifecycleResolutionDialog
            companyId={companyId}
            docKey="share_transfer"
            instrument="board"
            eventId={transfer.id}
            personName={transferorName}
            roleLabel={locale === 'fr' ? 'Actionnaire (cédant)' : 'Shareholder (transferor)'}
            eventDate={transfer.transfer_date}
            extraFacts={extraFacts}
            language={preferredLanguage}
            onClose={() => setGeneratingTransferForShareholding(null)}
            onSuccess={() => { setGeneratingTransferForShareholding(null); fetchData(); }}
          />
        );
      })()}

      {generatingIssuanceForShareholding && companyId && (() => {
        // #19d Phase 3 — share_issuance dispatch. Mirrors cessation: extraFacts
        // surfaces shares + share class (+ price-per-share when recorded) for
        // the dialog's event-facts block. eventDate is the holding's issue_date
        // (event = past issuance; resolutionDate defaults to today per §8.45).
        const sh = generatingIssuanceForShareholding;
        const name =
          holderName(sh.holders as unknown as RawHolder[]) ??
          (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');
        const extraFacts: Array<{ label: string; value: string }> = [
          {
            label: locale === 'fr' ? 'Actions' : 'Shares',
            value: sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA'),
          },
          {
            label: locale === 'fr' ? "Classe d'actions" : 'Share class',
            value: sh.share_class.name,
          },
        ];
        if (sh.issue_price_per_share != null && Number(sh.issue_price_per_share) > 0) {
          const formatted = new Intl.NumberFormat(
            locale === 'fr' ? 'fr-CA' : 'en-CA',
            { style: 'currency', currency: 'CAD',
              ...(locale === 'en' ? { currencyDisplay: 'narrowSymbol' as const } : {}) },
          ).format(Number(sh.issue_price_per_share));
          extraFacts.push({
            label: locale === 'fr' ? 'Prix par action' : 'Price per share',
            value: formatted,
          });
        }
        return (
          <GenerateLifecycleResolutionDialog
            companyId={companyId}
            docKey="share_issuance"
            instrument="board"
            eventId={sh.id}
            personName={name}
            roleLabel={locale === 'fr' ? 'Actionnaire' : 'Shareholder'}
            eventDate={sh.issue_date}
            extraFacts={extraFacts}
            language={preferredLanguage}
            onClose={() => setGeneratingIssuanceForShareholding(null)}
            onSuccess={() => { setGeneratingIssuanceForShareholding(null); fetchData(); }}
          />
        );
      })()}
    </div>
  );
}
