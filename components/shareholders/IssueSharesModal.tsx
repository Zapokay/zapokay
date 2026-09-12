'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2, Plus } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { ShareClass, ShareholderEntity, ShareholderEntitySignatoryRole } from '@/lib/supabase/people-types';
import { getSignatoryRoleLabel } from '@/lib/i18n/lifecycle-labels';
import { useResolveurCatalogue } from '@/lib/i18n/client-messages';
import { logActivity } from '@/lib/activity-log';
import {
  chargeEntite,
  VALEUR_ENTITE_VIDE,
  type ChargeEntite,
  type ValeurEntite,
} from '@/lib/entity-payload';
import EntityForm from '@/components/shareholders/EntityForm';
import { champsManquants, type ChampPersonne } from '@/lib/data-gaps';
import { chargePersonne, insererPersonne } from '@/lib/person-payload';

// =============================================================================
// Types
// =============================================================================

// Slice 2b-ii — one signatory form row (new-entity branch only).
type SignatoryFormRow = {
  key: string;
  personValue: PersonSelectorValue | null;
  role: '' | ShareholderEntitySignatoryRole; // '' = unpicked (force-pick per §8.36)
  customRole: string;
  startDate: string; // 'YYYY-MM-DD', '' = unpicked
};

// Named roles for the select (5); 'custom' is a separate option below them.
const SIGNATORY_ROLES: Exclude<ShareholderEntitySignatoryRole, 'custom'>[] = [
  'trustee', 'president', 'vice_president', 'secretary', 'treasurer',
];

// Force-pick (§8.36): a row is complete only with a person, a role, a custom_role
// when role==='custom', and a start date. Zero rows is valid (additive picker).
function signatoryRowsComplete(rows: SignatoryFormRow[]): boolean {
  return rows.every(
    (r) =>
      r.personValue !== null &&
      r.role !== '' &&
      (r.role !== 'custom' || r.customRole.trim() !== '') &&
      r.startDate !== '',
  );
}

interface IssueSharesModalProps {
  companyId: string;
  incorporationDate: string | null;
  shareClasses: ShareClass[];
  /** Current max certificate number so we can auto-increment */
  nextCertificateNumber: number;
  /**
   * La residence canadienne s'applique-t-elle a cette societe ? DECIDE en
   * amont par residencyApplies(), jamais recalcule ici : cette modale
   * TRANSPORTE, elle ne compare pas.
   */
  residencyApplies: boolean;
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
  residencyApplies,
  onClose,
  onSuccess,
}: IssueSharesModalProps) {
  const t = useTranslations('shareholders');
  const tCatalogue = useResolveurCatalogue();
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [shareClassId, setShareClassId] = useState(shareClasses[0]?.id || '');
  const [quantity, setQuantity] = useState('100');
  const [pricePerShare, setPricePerShare] = useState('1');
  const [issueDate, setIssueDate] = useState(''); // Atom 3 polish: empty by default (both paths)
  const [certificateNumber, setCertificateNumber] = useState(
    String(nextCertificateNumber).padStart(3, '0')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Entity-mode state (Slice 2b-i: zero-signatory entity creation) --------
  const [entityMode, setEntityMode] = useState(false);
  /**
   * ★ UN SEUL ETAT POUR L'ENTITE, a la place de onze. Sa forme et son etat
   * initial sont declares dans lib/entity-payload.ts — la creation et la
   * correction les partagent. VALEUR_ENTITE_VIDE reprend valeur pour valeur les
   * onze `useState` qu'il remplace.
   */
  const [valeurEntite, setValeurEntite] = useState<ValeurEntite>(VALEUR_ENTITE_VIDE);
  // Existing-entity selection (parallel path — not a new entity, reuse entity_id).
  const [selectedExistingEntity, setSelectedExistingEntity] = useState<ShareholderEntity | null>(null);
  // Slice 2b-ii — signatory rows for the NEW-entity branch (0 allowed; additive).
  const [signatoryRows, setSignatoryRows] = useState<SignatoryFormRow[]>([]);

  // Update default share class if list changes
  useEffect(() => {
    if (!shareClassId && shareClasses.length > 0) {
      setShareClassId(shareClasses[0].id);
    }
  }, [shareClasses, shareClassId]);

  /**
   * ⚠️ LA GARDE NE FRAPPE QUE LE CHEMIN PERSONNE. Cette modale porte DEUX
   * montages de PersonSelector et trois branches d'enregistrement :
   *
   *   · entité existante choisie → rien à saisir, rien à exiger ;
   *   · nouvelle entité (`entityMode`) → c'est `EntityForm` qui saisit, et le
   *     domicile d'une société est le LOT C, pas celui-ci ;
   *   · signataires d'entité → `entity_signatory` reste vide PAR DÉCISION.
   *
   * `cheminPersonne` isole la seule branche concernée ; en mode entité,
   * `manquants` est vide et le bouton retrouve exactement sa condition d'avant.
   */
  const cheminPersonne = !selectedExistingEntity && !entityMode;
  const manquants: ChampPersonne[] =
    cheminPersonne && personValue?.mode === 'new'
      ? champsManquants('shareholder', {
          address_city: personValue.addressCity,
          address_country: personValue.addressCountry,
        })
      : [];
  const domicileIncomplet = manquants.length > 0;
  const messageDomicile = !domicileIncomplet
    ? undefined
    : manquants.length === 2 ? t('errorCityAndCountry')
    : manquants[0] === 'address_city' ? t('errorCity')
    : t('errorCountry');

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (selectedExistingEntity) {
      // Existing entity selected — holder already resolved, no field validation.
    } else if (entityMode) {
      if (!valeurEntite.legalName.trim()) {
        setError(t('errorEntityName'));
        return;
      }
      if (valeurEntite.entityType === 'corporation' && !valeurEntite.entityNumber.trim()) {
        setError(t('errorNeq'));
        return;
      }
      if (!signatoryRowsComplete(signatoryRows)) {
        setError(t('signatoryIncomplete'));
        return;
      }
    } else if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    } else if (personValue.mode === 'new') {
      // Ceinture du CHEMIN PERSONNE, recalculée depuis `personValue`.
      const absents = champsManquants('shareholder', {
        address_city: personValue.addressCity,
        address_country: personValue.addressCountry,
      });
      if (absents.length > 0) {
        setError(
          absents.length === 2 ? t('errorCityAndCountry')
          : absents[0] === 'address_city' ? t('errorCity')
          : t('errorCountry'),
        );
        return;
      }
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
    const priceNum = parseFloat(pricePerShare);
    if (!pricePerShare.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setError(t('errorPrice'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const price = parseFloat(pricePerShare);
      const selectedClass = shareClasses.find((sc) => sc.id === shareClassId);
      const shareClassName = selectedClass?.name || '';

      // Resolve the holder: entity (Slice 2b-i, two-call) or individual person.
      let holders: Array<Record<string, string>>;
      let holderName: string;
      let holderDetails: Record<string, unknown>;

      if (selectedExistingEntity) {
        // Existing entity selected — reuse its id, SKIP create_entity_with_signatories.
        holders = [{ holder_type: 'entity', entity_id: selectedExistingEntity.id }];
        holderName = selectedExistingEntity.legal_name;
        holderDetails = { entity_id: selectedExistingEntity.id };
      } else if (entityMode) {
        // Slice 2b-ii: resolve each signatory row's person_id (INSERT new persons
        // first, mirroring the person-path shape). Widens the non-atomic window
        // (N person INSERTs + entity + shareholding) — tracked as Queue #161, accepted.
        const p_signatories: Array<{ person_id: string; role: string; custom_role: string | null; start_date: string }> = [];
        for (const r of signatoryRows) {
          let sigPersonId: string;
          if (r.personValue!.mode === 'new') {
            // ★ MÊME PORTE que les huit autres écritures — le signataire n'a
            //   aucune exigence, mais il n'a plus le droit de perdre un champ.
            const { data: np, error: npErr } = await insererPersonne(
              supabase,
              chargePersonne(companyId, r.personValue!),
            );
            if (npErr || !np) throw new Error(npErr?.message || 'Failed to create signatory person');
            sigPersonId = np.id;
          } else {
            sigPersonId = r.personValue!.personId;
          }
          p_signatories.push({
            person_id: sigPersonId,
            role: r.role,
            custom_role: r.role === 'custom' ? r.customRole.trim() : null,
            start_date: r.startDate,
          });
        }

        // Call 1 — atomic entity + its signatory roster (0..N).
        /**
         * ⛔ ANNOTATION EXPLICITE, JAMAIS UN CAST. `supabase.rpc` type sa
         * charge en `any` : sans ce `: ChargeEntite`, une cle d'adresse
         * oubliee repart en silence — c'est exactement ainsi que
         * `address_country` s'est perdue et que le COALESCE fabriquait. Un
         * `as` aurait fait taire la garde au lieu de la poser.
         *
         * ★ LES SIX CLES D'ADRESSE SONT ECRITES, meme quand la valeur est
         * nulle. `chargeEntite` transforme la saisie vide en `null` explicite.
         */
        // ★ La charge est CONSTRUITE par lib/entity-payload.ts, cle pour cle
        //   comme le litteral qu'elle remplace — preuve d'identite au commit.
        const p_entity: ChargeEntite = chargeEntite(companyId, valeurEntite);
        const { data: entityId, error: entErr } = await supabase.rpc('create_entity_with_signatories', {
          p_entity,
          p_signatories,
        });
        if (entErr) throw new Error(entErr.message);
        holders = [{ holder_type: 'entity', entity_id: entityId as string }];
        holderName = valeurEntite.legalName.trim();
        holderDetails = { entity_id: entityId };
      } else {
        let personId: string;
        if (personValue!.mode === 'new') {
          // ★ UNE SEULE PORTE D'ÉCRITURE — lib/person-payload.ts.
          const { data: newPerson, error: insertErr } = await insererPersonne(
            supabase,
            chargePersonne(companyId, personValue!),
          );

          if (insertErr || !newPerson) {
            throw new Error(insertErr?.message || 'Failed to create person');
          }
          personId = newPerson.id;
        } else {
          personId = personValue!.personId;
        }
        holders = [{ holder_type: 'individual', person_id: personId }];
        holderName = personValue!.mode === 'new' ? personValue!.fullName : personValue!.person.full_name;
        holderDetails = { person_id: personId };
      }

      // Call 2 (both paths) — atomic shareholding + holder link.
      const { error: shErr } = await supabase.rpc('create_shareholding_with_holders', {
        p_shareholding: {
          company_id: companyId,
          share_class_id: shareClassId,
          quantity: qty,
          issue_date: issueDate,
          issue_price_per_share: price,
          certificate_number: certificateNumber.trim() || null,
        },
        p_holders: holders,
      });

      if (shErr) throw new Error(shErr.message);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          companyId,
          user.id,
          'shares_issued',
          `Actions émises : ${qty} ${shareClassName} à ${holderName}`,
          `Shares issued: ${qty} ${shareClassName} to ${holderName}`,
          { ...holderDetails, share_class: shareClassName, quantity: qty }
        );
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [
    personValue,
    selectedExistingEntity,
    signatoryRows,
    entityMode,
    valeurEntite,
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

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
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
          {/* Holder: person selector (with "add a company / trust" branch) OR entity sub-panel */}
          {selectedExistingEntity ? (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-900/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {selectedExistingEntity.legal_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {selectedExistingEntity.legal_name}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">{t('entityBadge')}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExistingEntity(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : !entityMode ? (
            <PersonSelector
              exigences="shareholder"
              residencyApplies={residencyApplies}
              companyId={companyId}
              value={personValue}
              onChange={setPersonValue}
              label={t('holderLabel')}
              error={messageDomicile}
              placeholder={t('selectHolder')}
              includeEntities
              onSelectEntity={(entity) => {
                setSelectedExistingEntity(entity);
                setPersonValue(null);
              }}
              onAddEntity={() => {
                setEntityMode(true);
                setSelectedExistingEntity(null);
              }}
            />
          ) : (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
              {/* Header: entity label + escape back to the picker */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {t('newEntity')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEntityMode(false);
                    // Meme effet qu'avant l'extraction : seuls le nom et le
                    // NEQ sont vides au retour, le reste est conserve.
                    setValeurEntite((v) => ({ ...v, legalName: '', entityNumber: '' }));
                  }}
                  className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  {t('selectExistingInstead')}
                </button>
              </div>

              {/* ⛔ LE FORMULAIRE D'ENTITE EST UN COMPOSANT, PARTAGE AVEC LA
                  CORRECTION. Il etait tisse ici sur 178 lignes ; son rendu est
                  identique a l'octet (preuve au message de commit). L'enveloppe,
                  l'en-tete « Nouvelle entite » et les signataires restent ici :
                  ce sont des soucis de CREATION, pas des proprietes de l'entite. */}
              <EntityForm value={valeurEntite} onChange={setValeurEntite} />

              {/* Signatories (Slice 2b-ii) — 0 allowed; additive, force-pick per row */}
              <div className="space-y-3 border-t border-amber-200/60 pt-3 dark:border-amber-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {t('signatoriesTitle')}
                </p>
                {signatoryRows.map((row) => (
                  <div
                    key={row.key}
                    className="space-y-2 rounded-md border border-amber-200/70 bg-white/50 p-3 dark:border-amber-800/40 dark:bg-zinc-800/30"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <PersonSelector
                          exigences="entity_signatory"
                          residencyApplies={residencyApplies}
                          companyId={companyId}
                          value={row.personValue}
                          onChange={(pv) =>
                            setSignatoryRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, personValue: pv } : r)))
                          }
                          label={t('person')}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={t('removeSignatory')}
                        onClick={() => setSignatoryRows((rows) => rows.filter((r) => r.key !== row.key))}
                        className="mt-1 shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {t('role')} <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={row.role}
                          onChange={(e) =>
                            setSignatoryRows((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, role: e.target.value as SignatoryFormRow['role'] } : r)),
                            )
                          }
                          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          <option value="">{t('rolePlaceholder')}</option>
                          {SIGNATORY_ROLES.map((rk) => (
                            <option key={rk} value={rk}>{getSignatoryRoleLabel(rk, tCatalogue)}</option>
                          ))}
                          <option value="custom">{t('customRoleOption')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {t('signatoryStartDate')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={row.startDate}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) =>
                            setSignatoryRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, startDate: e.target.value } : r)))
                          }
                          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                    {row.role === 'custom' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {t('customRoleLabel')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={row.customRole}
                          onChange={(e) =>
                            setSignatoryRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, customRole: e.target.value } : r)))
                          }
                          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </div>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setSignatoryRows((rows) => [
                      ...rows,
                      { key: crypto.randomUUID(), personValue: null, role: '', customRole: '', startDate: '' },
                    ])
                  }
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  <Plus className="h-4 w-4" />
                  {t('addSignatory')}
                </button>
              </div>
            </div>
          )}

          {/* Share class */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('shareClass')} <span style={{ color: 'var(--error-text)' }}>*</span>
            </label>
            {shareClasses.length === 0 ? (
              <div
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--warning-bg)',
                  borderColor: 'var(--warning-border)',
                  color: 'var(--warning-text)',
                }}
              >
                {locale === 'fr'
                  ? "Aucune classe d'actions configurée. Fermez cette fenêtre et ajoutez une classe d'actions d'abord."
                  : 'No share classes configured. Close this window and add a share class first.'}
              </div>
            ) : (
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
            )}
          </div>

          {/* Quantity + Price per share row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('numberOfShares')} <span style={{ color: 'var(--error-text)' }}>*</span>
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
                {locale === 'fr' ? 'Prix par action (1 $ par défaut si inconnu)' : 'Price per share ($1 default if unknown)'}
              </p>
            </div>
          </div>

          {/* Issue date + Certificate row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('issueDate')} <span style={{ color: 'var(--error-text)' }}>*</span>
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
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                backgroundColor: 'var(--error-bg)',
                borderColor: 'var(--error-border)',
                color: 'var(--error-text)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 modal-footer modal-surface px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-[var(--hover)] dark:text-zinc-400"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || shareClasses.length === 0 || !issueDate || (selectedExistingEntity ? false : entityMode ? (!valeurEntite.legalName.trim() || !signatoryRowsComplete(signatoryRows)) : (!personValue || domicileIncomplet))}
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

