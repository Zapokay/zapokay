'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import type { DirectorWithPerson, DirectorEndReason } from '@/lib/supabase/people-types';
import { logActivity } from '@/lib/activity-log';

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
  const supabase = createClient();

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

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          director.company_id,
          user.id,
          'director_removed',
          `Administrateur retiré : ${director.person.full_name}`,
          `Director removed: ${director.person.full_name}`,
          { person_id: director.person_id }
        );
      }

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
      <div className="relative z-10 w-full max-w-md rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="flex items-center justify-between modal-header px-6 py-4">
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

