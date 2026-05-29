'use client';

/**
 * #19d Phase 3 close — Transfer-shareholding modal.
 *
 * Captures an individual-to-individual full share transfer. ALL writes happen
 * inside the transfer_shares() RPC's implicit subtransaction (5 statements,
 * atomic) — see 20260527120000_phase19d_transfer_schema_atom.sql §4:
 *   1. END the source holding (end_date = transfer_date, end_reason = 'transfer')
 *   2. CREATE the destination holding (same share_class, same quantity, same
 *      original issue_date, source = 'transfer')
 *   3. WIRE the destination holder (individual)
 *   4. RECORD the share_transfers row
 *   5. LOG activity_log with event_type = 'share_transfer_created'
 *
 * DO NOT call logActivity from this modal — the RPC owns step (5) atomically
 * with steps (1-4). Duplicating it here would double-write the activity row.
 *
 * v1 product locks (enforced by RPC + mirrored client-side for clear errors):
 *   - Source must have exactly 1 individual holder (no joint, no entity)
 *   - Full quantity transfer only (destination inherits source.quantity)
 *   - Same share class implied (destination inherits source.share_class_id)
 *   - transfer_date in [source.issue_date, today]
 *   - Optional TEXT consideration (free-form; empty string → null)
 *   - Target picker EXCLUDES the source's current holder (avoid transfer-to-self).
 *     Other existing shareholders ARE allowed — consolidation is a legitimate v1 flow.
 *
 * Person picker: re-uses components/people/PersonSelector (canonical existing-OR-
 * inline-new component, also consumed by IssueSharesModal). When the picker
 * yields mode === 'new', this modal inserts the company_people row FIRST
 * (mirroring IssueSharesModal.tsx:90-111 verbatim) before invoking
 * transfer_shares with the resulting person_id. Auto-create is intentionally
 * NOT inside the RPC — v1 keeps the RPC ind-only with a pre-existing person_id
 * contract (entity holders + auto-create are post-v1 hardening).
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, ArrowRightLeft, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { ShareholdingWithDetails } from '@/lib/supabase/people-types';
import { holderName, type RawHolder } from '@/lib/minute-book/holder-name';

// =============================================================================
// Types
// =============================================================================

interface TransferShareholdingModalProps {
  shareholding: ShareholdingWithDetails;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function TransferShareholdingModal({
  shareholding,
  onClose,
  onSuccess,
}: TransferShareholdingModalProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [transferDate, setTransferDate] = useState(today);
  const [consideration, setConsideration] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Source's current holder. v1 lock guarantees exactly one individual holder
  // (the RPC will raise if violated); we mirror that here to scope the
  // exclusion list cleanly. Resolution path mirrors ShareholdersClient's
  // grouping accessor (sh.holders?.[0]?.person_id).
  const currentHolderPersonId = shareholding.holders?.[0]?.person_id ?? null;
  const transferorName =
    holderName(shareholding.holders as unknown as RawHolder[]) ??
    (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');

  const handleConfirm = useCallback(async () => {
    setError(null);

    if (!personValue) {
      setError(
        locale === 'fr'
          ? 'Veuillez sélectionner un nouveau titulaire.'
          : 'Please select a new holder.',
      );
      return;
    }
    if (personValue.mode === 'new' && !personValue.fullName.trim()) {
      setError(
        locale === 'fr'
          ? 'Veuillez saisir le nom du nouveau titulaire.'
          : 'Please enter the new holder name.',
      );
      return;
    }
    if (!transferDate) {
      setError(
        locale === 'fr'
          ? 'La date du transfert est requise.'
          : 'Transfer date is required.',
      );
      return;
    }
    if (transferDate < shareholding.issue_date) {
      setError(
        locale === 'fr'
          ? "La date du transfert ne peut pas précéder la date d'émission de la détention source."
          : 'Transfer date cannot precede the source shareholding issue date.',
      );
      return;
    }
    if (transferDate > today) {
      setError(
        locale === 'fr'
          ? 'La date du transfert ne peut pas être dans le futur.'
          : 'Transfer date cannot be in the future.',
      );
      return;
    }

    setSaving(true);

    try {
      // Resolve target person_id. When the picker is in 'new' mode, insert
      // company_people FIRST so the resulting id can be passed to the RPC.
      // Mirrors IssueSharesModal.tsx:90-111 verbatim.
      let toPersonId: string;
      if (personValue.mode === 'new') {
        const { data: newPerson, error: insertErr } = await supabase
          .from('company_people')
          .insert({
            company_id: shareholding.company_id,
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
        toPersonId = newPerson.id;
      } else {
        toPersonId = personValue.personId;
      }

      // transfer_shares — atomic 5-statement RPC. PG RAISE EXCEPTION messages
      // (joint-source, entity-source, date guards, missing source) surface
      // verbatim through rpcErr.message.
      const { error: rpcErr } = await supabase.rpc('transfer_shares', {
        p_from_shareholding_id: shareholding.id,
        p_to_person_id: toPersonId,
        p_transfer_date: transferDate,
        p_consideration: consideration.trim() || null,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [
    personValue,
    transferDate,
    consideration,
    shareholding,
    supabase,
    onSuccess,
    locale,
    today,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — max-h + overflow-y mirrors IssueSharesModal because
          PersonSelector's inline-new form can grow taller than the viewport
          on small screens. */}
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <ArrowRightLeft className="h-5 w-5 text-amber-500" />
            {t('transferShareholdingTitle')}
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
            {t('transferShareholdingIntro', {
              qty: shareholding.quantity,
              className: shareholding.share_class.name,
              transferorName,
            })}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {t('transferShareholdingSubtext')}
          </p>

          {/* New holder picker */}
          <PersonSelector
            companyId={shareholding.company_id}
            value={personValue}
            onChange={setPersonValue}
            excludePersonIds={currentHolderPersonId ? [currentHolderPersonId] : []}
            label={t('newHolder')}
          />

          {/* Transfer date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('transferDate')} <span style={{ color: 'var(--error-text)' }}>*</span>
            </label>
            <input
              type="date"
              value={transferDate}
              min={shareholding.issue_date}
              max={today}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Consideration */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('considerationOptional')}
            </label>
            <input
              type="text"
              value={consideration}
              onChange={(e) => setConsideration(e.target.value)}
              placeholder={t('considerationPlaceholder')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
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
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !personValue}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('confirmTransfer')}
          </button>
        </div>
      </div>
    </div>
  );
}
