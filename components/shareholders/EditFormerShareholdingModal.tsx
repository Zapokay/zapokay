'use client';

/**
 * #19d Phase 3 (cessation) — Edit-former-shareholding modal.
 *
 * Mirror of EditFormerDirectorModal adapted for shareholdings:
 *   - EDIT-ONLY: no soft-delete affordance, no enteredInError checkbox.
 *     Phase 0c (2026-05-26) established that shareholdings has NO
 *     `deleted_at` and NO `is_active` column (Phase 10A Atom 4 invariant —
 *     "former" derived purely from end_date IS NOT NULL). With nothing to
 *     soft-delete TO, the affordance is dropped entirely rather than faked.
 *   - Editable fields: issue_date (the start), end_date, end_reason.
 *     quantity / share_class_id / certificate_number are out of scope
 *     (mirrors director-modal scope — dates + reason only).
 *   - End-reason picker mirrors EndShareholdingModal (3 values, excludes
 *     'transfer' — owned by future transfer flow per locked decision).
 *   - logActivity event_type 'shareholding_edited' (added to CHECK enum in
 *     migration 20260526120000_phase19d_cessation_activity_log_event_types.sql).
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Pencil, Loader2 } from 'lucide-react';
import type {
  ShareholdingWithDetails,
  ShareholdingEndReason,
} from '@/lib/supabase/people-types';
import { holderName, type RawHolder } from '@/lib/minute-book/holder-name';
import { logActivity } from '@/lib/activity-log';
import { formatDate } from '@/lib/utils';

// =============================================================================
// End-reason options (labels resolved via t('endReasons.{value}')) — force-pick
// per Bundle 1 §8.36 (no silent default; submit gated until non-empty).
// =============================================================================

type CessationReason = Exclude<ShareholdingEndReason, 'transfer'>;

const END_REASON_VALUES: CessationReason[] = [
  'redemption',
  'cancellation',
  'conversion',
];

// =============================================================================
// Types
// =============================================================================

interface EditFormerShareholdingModalProps {
  shareholding: ShareholdingWithDetails;
  isTransfer: boolean;
  transferDate?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function EditFormerShareholdingModal({
  shareholding,
  isTransfer,
  transferDate,
  onClose,
  onSuccess,
}: EditFormerShareholdingModalProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  // Both dates are DATE columns post-migration
  // (20260526120100_phase19d_shareholdings_end_date_to_date.sql) — supabase-js
  // returns plain "YYYY-MM-DD" strings that <input type="date"> accepts
  // verbatim. Mirrors EditFormerDirectorModal's pre-fill pattern.
  const [issueDate, setIssueDate] = useState(shareholding.issue_date);
  const [endDate, setEndDate] = useState(shareholding.end_date || '');
  const [endReason, setEndReason] = useState<CessationReason | ''>(
    (shareholding.end_reason as CessationReason | null) || '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName =
    holderName(shareholding.holders as unknown as RawHolder[]) ??
    (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');

  // #139 — formatted transfer date for the read-only banner (null when the
  // parent couldn't resolve a share_transfers row). formatDate is the date
  // chokepoint (§8.28/§8.54) — never bare new Date().
  const transferDateLabel = transferDate ? formatDate(transferDate, locale) : null;

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setError(null);

    // #139 — transfer-ended holdings are fully read-only: end_date/end_reason
    // are owned by the share_transfers record, and editing here would desync
    // the holding from transfer_date. Save is already disabled in the UI; this
    // early return makes the shareholdings.update below unreachable for them.
    if (isTransfer) return;

    if (!endReason) {
      setError(
        locale === 'fr'
          ? 'Le motif de cessation est requis.'
          : 'A cessation reason is required.',
      );
      return;
    }
    if (!endDate) {
      setError(
        locale === 'fr'
          ? 'La date de cessation est requise.'
          : 'A cessation date is required.',
      );
      return;
    }
    if (endDate < issueDate) {
      setError(
        locale === 'fr'
          ? "La date de cessation doit être postérieure à la date d'émission."
          : 'Cessation date must be on or after the issue date.',
      );
      return;
    }

    setSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from('shareholdings')
        .update({
          issue_date: issueDate,
          end_date: endDate,
          end_reason: endReason,
        })
        .eq('id', shareholding.id);

      if (updateErr) throw new Error(updateErr.message);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          shareholding.company_id,
          user.id,
          'shareholding_edited',
          `Entrée modifiée : ${displayName} (${shareholding.quantity} ${shareholding.share_class.name})`,
          `Entry edited: ${displayName} (${shareholding.quantity} ${shareholding.share_class.name})`,
          {
            shareholding_id: shareholding.id,
            issue_date: issueDate,
            end_date: endDate,
            end_reason: endReason,
          },
        );
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [isTransfer, issueDate, endDate, endReason, shareholding, supabase, onSuccess, locale, displayName]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="flex items-center justify-between modal-header px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-heading)]">
            <Pencil className="h-5 w-5 text-[var(--text-muted)]" />
            {t('editEntry')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-body)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* #139 — transfer-locked read-only notice. Matches the amber notice
              convention used in IssueSharesModal (stock Tailwind amber palette).
              Points to the share transfer record that owns this holding's end
              details. */}
          {isTransfer && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/10 dark:text-amber-300">
              {transferDateLabel
                ? t('transferLockedBannerDated', { date: transferDateLabel })
                : t('transferLockedBanner')}
            </div>
          )}
          {/* Holder (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('person')}
            </label>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
              {displayName}
            </div>
          </div>

          {/* Holding context (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {locale === 'fr' ? 'Détention' : 'Holding'}
            </label>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
              {shareholding.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
              {shareholding.share_class.name}
              {shareholding.certificate_number
                ? ` · #${shareholding.certificate_number}`
                : ''}
            </div>
          </div>

          {/* Issue date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('issueDate')}
            </label>
            {isTransfer ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
                {formatDate(issueDate, locale)}
              </div>
            ) : (
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            )}
          </div>

          {/* End date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endDate')}
            </label>
            {isTransfer ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
                {endDate ? formatDate(endDate, locale) : '—'}
              </div>
            ) : (
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            )}
          </div>

          {/* End reason — force-pick */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endReason')}
            </label>
            {isTransfer ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
                {t(`endReasons.${shareholding.end_reason}`)}
              </div>
            ) : (
              <select
                value={endReason}
                onChange={(e) =>
                  setEndReason(e.target.value as CessationReason | '')
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">
                  {locale === 'fr' ? '— Sélectionner —' : '— Select —'}
                </option>
                {END_REASON_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`endReasons.${value}`)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 modal-footer px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)]"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !endReason || isTransfer}
            className="flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2 text-sm font-semibold text-[var(--cta-text)] shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
