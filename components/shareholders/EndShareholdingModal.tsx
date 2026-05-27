'use client';

/**
 * #19d Phase 3 (cessation) — End-shareholding modal.
 *
 * Mirror of RemoveDirectorModal adapted for shareholdings:
 *   - Writes ONLY `end_date` + `end_reason` (shareholdings has NO `is_active`
 *     and NO `deleted_at` per Phase 10A Atom 4 — "former" is derived purely
 *     from end_date IS NOT NULL).
 *   - Picker excludes 'transfer' per #19d Phase 3 locked decision (2026-05-26):
 *     transfers go through the dedicated share_transfers table, not a
 *     shareholding end_reason mutation.
 *   - Capture granularity is PER-HOLDING (one modal per shareholding row),
 *     per locked brief decision.
 *   - Holder display name resolved via the shared holderName() helper so it
 *     stays in lockstep with the completeness engine + lifecycle orchestrator.
 *   - logActivity event_type 'shareholding_ended' (added to CHECK enum in
 *     migration 20260526120000_phase19d_cessation_activity_log_event_types.sql).
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import type {
  ShareholdingWithDetails,
  ShareholdingEndReason,
} from '@/lib/supabase/people-types';
import { holderName, type RawHolder } from '@/lib/minute-book/holder-name';
import { logActivity } from '@/lib/activity-log';

// =============================================================================
// Types
// =============================================================================

interface EndShareholdingModalProps {
  shareholding: ShareholdingWithDetails;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// End-reason options (labels resolved via t('endReasons.{value}'))
// =============================================================================

type CessationReason = Exclude<ShareholdingEndReason, 'transfer'>;

const END_REASON_VALUES: CessationReason[] = [
  'redemption',
  'cancellation',
  'conversion',
];

// =============================================================================
// Component
// =============================================================================

export default function EndShareholdingModal({
  shareholding,
  onClose,
  onSuccess,
}: EndShareholdingModalProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [endReason, setEndReason] = useState<CessationReason | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName =
    holderName(shareholding.holders as unknown as RawHolder[]) ??
    (locale === 'fr' ? '(détenteur inconnu)' : '(unknown holder)');

  const handleConfirm = useCallback(async () => {
    if (!endReason) {
      setError(
        locale === 'fr'
          ? 'Le motif de cessation est requis.'
          : 'A cessation reason is required.',
      );
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const { error: updateErr } = await supabase
        .from('shareholdings')
        .update({
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
          'shareholding_ended',
          `Détention terminée : ${displayName} (${shareholding.quantity} ${shareholding.share_class.name})`,
          `Shareholding ended: ${displayName} (${shareholding.quantity} ${shareholding.share_class.name})`,
          { shareholding_id: shareholding.id, end_reason: endReason },
        );
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [endDate, endReason, shareholding, supabase, onSuccess, locale, displayName]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="flex items-center justify-between modal-header px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {t('endShareholding')}
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
              ? `Terminer ${shareholding.quantity} action(s) de catégorie ${shareholding.share_class.name} détenue(s) par ${displayName} ?`
              : `End ${shareholding.quantity} ${shareholding.share_class.name} share(s) held by ${displayName}?`}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {locale === 'fr'
              ? 'Le détenteur restera dans le registre mais ne sera plus actionnaire actif sur cette détention.'
              : 'The holder will remain in the registry but will no longer be an active shareholder on this holding.'}
          </p>

          {/* End reason */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endReason')}
            </label>
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
        <div className="flex items-center justify-end gap-3 modal-footer px-6 py-4">
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
            disabled={saving || !endReason}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('confirmEnd')}
          </button>
        </div>
      </div>
    </div>
  );
}
