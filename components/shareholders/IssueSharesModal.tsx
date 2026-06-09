'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { ShareClass, ShareholderEntityType, EntityDescriptor, ShareholderEntity } from '@/lib/supabase/people-types';
import { logActivity } from '@/lib/activity-log';

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

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

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
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [shareClassId, setShareClassId] = useState(shareClasses[0]?.id || '');
  const [quantity, setQuantity] = useState('100');
  const [pricePerShare, setPricePerShare] = useState('');
  const [issueDate, setIssueDate] = useState(''); // Atom 3 polish: empty by default (both paths)
  const [certificateNumber, setCertificateNumber] = useState(
    String(nextCertificateNumber).padStart(3, '0')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Entity-mode state (Slice 2b-i: zero-signatory entity creation) --------
  const [entityMode, setEntityMode] = useState(false);
  const [entityType, setEntityType] = useState<ShareholderEntityType>('corporation');
  const [legalName, setLegalName] = useState('');
  const [entityNumber, setEntityNumber] = useState(''); // NEQ, corporation-only
  const [entityDescriptor, setEntityDescriptor] = useState<EntityDescriptor>('corporation');
  const [entityDate, setEntityDate] = useState(''); // date_incorporated (corp) | date_constituted (trust)
  const [entAddressLine1, setEntAddressLine1] = useState('');
  const [entAddressCity, setEntAddressCity] = useState('');
  const [entAddressProvince, setEntAddressProvince] = useState('QC');
  const [entAddressPostal, setEntAddressPostal] = useState('');
  // Existing-entity selection (parallel path — not a new entity, reuse entity_id).
  const [selectedExistingEntity, setSelectedExistingEntity] = useState<ShareholderEntity | null>(null);

  // Update default share class if list changes
  useEffect(() => {
    if (!shareClassId && shareClasses.length > 0) {
      setShareClassId(shareClasses[0].id);
    }
  }, [shareClasses, shareClassId]);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (selectedExistingEntity) {
      // Existing entity selected — holder already resolved, no field validation.
    } else if (entityMode) {
      if (!legalName.trim()) {
        setError(t('errorEntityName'));
        return;
      }
      if (entityType === 'corporation' && !entityNumber.trim()) {
        setError(t('errorNeq'));
        return;
      }
    } else if (!personValue) {
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
      const price = pricePerShare.trim()
        ? parseFloat(pricePerShare)
        : null;
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
        // Call 1 — atomic entity + (zero) signatories. entity_descriptor is sent
        // only for corporations ('' → NULL for trusts, satisfying the Slice-1 CHECK).
        const { data: entityId, error: entErr } = await supabase.rpc('create_entity_with_signatories', {
          p_entity: {
            company_id: companyId,
            entity_type: entityType,
            legal_name: legalName.trim(),
            entity_number: entityType === 'corporation' ? entityNumber.trim() : '',
            entity_descriptor: entityType === 'corporation' ? entityDescriptor : '',
            date_incorporated: entityType === 'corporation' ? entityDate : '',
            date_constituted: entityType === 'trust' ? entityDate : '',
            address_line1: entAddressLine1.trim(),
            address_city: entAddressCity.trim(),
            address_province: entAddressProvince,
            address_postal_code: entAddressPostal.trim(),
          },
          p_signatories: [],
        });
        if (entErr) throw new Error(entErr.message);
        holders = [{ holder_type: 'entity', entity_id: entityId as string }];
        holderName = legalName.trim();
        holderDetails = { entity_id: entityId };
      } else {
        let personId: string;
        if (personValue!.mode === 'new') {
          const { data: newPerson, error: insertErr } = await supabase
            .from('company_people')
            .insert({
              company_id: companyId,
              full_name: personValue!.fullName,
              email: personValue!.email || null,
              phone: personValue!.phone || null,
              address_line1: personValue!.addressLine1 || null,
              address_city: personValue!.addressCity || null,
              address_province: personValue!.addressProvince || null,
              address_postal_code: personValue!.addressPostalCode || null,
              address_country: personValue!.addressCountry,
              is_canadian_resident: personValue!.isCanadianResident,
            })
            .select('id')
            .single();

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
    entityMode,
    entityType,
    legalName,
    entityNumber,
    entityDescriptor,
    entityDate,
    entAddressLine1,
    entAddressCity,
    entAddressProvince,
    entAddressPostal,
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
              companyId={companyId}
              value={personValue}
              onChange={setPersonValue}
              label={t('holderLabel')}
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
                    setLegalName('');
                    setEntityNumber('');
                  }}
                  className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  {t('selectExistingInstead')}
                </button>
              </div>

              {/* Legal name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t('legalName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="9453-2281 Québec Inc."
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Entity type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t('entityType')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as ShareholderEntityType)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="corporation">{t('entityTypeCorporation')}</option>
                  <option value="trust">{t('entityTypeTrust')}</option>
                </select>
              </div>

              {/* Conditional row: NEQ (corp, required) + descriptor (corp only) */}
              {entityType === 'corporation' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {t('neq')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={entityNumber}
                      onChange={(e) => setEntityNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      maxLength={10}
                      placeholder="1234567890"
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {t('descriptor')}
                    </label>
                    <select
                      value={entityDescriptor}
                      onChange={(e) => setEntityDescriptor(e.target.value as EntityDescriptor)}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value="corporation">{t('descriptorCorporation')}</option>
                      <option value="holding">{t('descriptorHolding')}</option>
                      <option value="nonprofit">{t('descriptorNonprofit')}</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Date — label + target column depend on entity type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {entityType === 'corporation' ? t('dateIncorporated') : t('dateConstituted')}
                </label>
                <input
                  type="date"
                  value={entityDate}
                  onChange={(e) => setEntityDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t('address')}
                </label>
                <input
                  type="text"
                  value={entAddressLine1}
                  onChange={(e) => setEntAddressLine1(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {t('city')}
                  </label>
                  <input
                    type="text"
                    value={entAddressCity}
                    onChange={(e) => setEntAddressCity(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {t('province')}
                  </label>
                  <select
                    value={entAddressProvince}
                    onChange={(e) => setEntAddressProvince(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {t('postalCode')}
                  </label>
                  <input
                    type="text"
                    value={entAddressPostal}
                    onChange={(e) => setEntAddressPostal(e.target.value)}
                    placeholder="J8B 1A1"
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Signatories come in Slice 2b-ii — visible, deliberate absence */}
              <p className="text-[11px] text-zinc-400">{t('signatoriesNote')}</p>
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
                {locale === 'fr' ? 'Optionnel — utile pour les dossiers fiscaux' : 'Optional — useful for tax records'}
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
            disabled={saving || shareClasses.length === 0 || !issueDate || (selectedExistingEntity ? false : entityMode ? !legalName.trim() : !personValue)}
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

