'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Pencil, Loader2 } from 'lucide-react';
import type {
  OfficerWithPerson,
  OfficerEndReason,
  OfficerTitle,
} from '@/lib/supabase/people-types';
import { logActivity } from '@/lib/activity-log';

// =============================================================================
// End-reason options — force-pick per Bundle 1 §8.36 (no silent default).
// =============================================================================

const END_REASON_VALUES: OfficerEndReason[] = [
  'resignation',
  'revocation',
  'term_expired',
  'death',
  'disqualification',
];

// =============================================================================
// Title options — Q6: in-place UPDATE of title/custom_title.
// =============================================================================

const TITLE_VALUES: OfficerTitle[] = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'custom',
];

// Mirrors OfficerCard.tsx + OfficersClient.tsx TITLE_LABELS — kept local per
// Bundle 1 brief (extraction to lib/officer-title-labels.ts deferred).
const TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

// =============================================================================
// Types
// =============================================================================

interface EditFormerOfficerModalProps {
  appointment: OfficerWithPerson;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function EditFormerOfficerModal({
  appointment,
  onClose,
  onSuccess,
}: EditFormerOfficerModalProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [title, setTitle] = useState<OfficerTitle>(appointment.title);
  const [customTitle, setCustomTitle] = useState(appointment.custom_title || '');
  const [appointmentDate, setAppointmentDate] = useState(appointment.appointment_date);
  const [endDate, setEndDate] = useState(appointment.end_date || '');
  const [endReason, setEndReason] = useState<OfficerEndReason | ''>(appointment.end_reason || '');
  const [enteredInError, setEnteredInError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setError(null);

    // Soft-delete path
    if (enteredInError) {
      setSaving(true);
      try {
        const { error: deleteErr } = await supabase
          .from('officer_appointments')
          .update({
            deleted_at: new Date().toISOString(),
            is_active: false,
          })
          .eq('id', appointment.id);

        if (deleteErr) throw new Error(deleteErr.message);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logActivity(
            supabase,
            appointment.company_id,
            user.id,
            'officer_soft_deleted',
            `Entrée corrigée (créée par erreur) : ${appointment.person.full_name}`,
            `Entry corrected (created in error): ${appointment.person.full_name}`,
            { person_id: appointment.person_id, appointment_id: appointment.id }
          );
        }

        onSuccess();
      } catch (err: any) {
        setError(err.message || 'An error occurred');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Edit path
    if (title === 'custom' && !customTitle.trim()) {
      setError(
        locale === 'fr'
          ? 'Le titre personnalisé est requis.'
          : 'A custom title is required.'
      );
      return;
    }
    if (!endReason) {
      setError(locale === 'fr' ? 'Le motif de fin est requis.' : 'A reason is required.');
      return;
    }
    if (!endDate) {
      setError(locale === 'fr' ? 'La date de fin est requise.' : 'An end date is required.');
      return;
    }
    if (endDate < appointmentDate) {
      setError(
        locale === 'fr'
          ? 'La date de fin doit être postérieure à la date de nomination.'
          : 'End date must be on or after the appointment date.'
      );
      return;
    }

    setSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from('officer_appointments')
        .update({
          title,
          custom_title: title === 'custom' ? customTitle.trim() : null,
          appointment_date: appointmentDate,
          end_date: endDate,
          end_reason: endReason,
        })
        .eq('id', appointment.id);

      if (updateErr) throw new Error(updateErr.message);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          appointment.company_id,
          user.id,
          'officer_edited',
          `Entrée modifiée : ${appointment.person.full_name}`,
          `Entry edited: ${appointment.person.full_name}`,
          {
            person_id: appointment.person_id,
            appointment_id: appointment.id,
            title,
            custom_title: title === 'custom' ? customTitle.trim() : null,
            appointment_date: appointmentDate,
            end_date: endDate,
            end_reason: endReason,
          }
        );
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [
    enteredInError,
    title,
    customTitle,
    appointmentDate,
    endDate,
    endReason,
    appointment,
    supabase,
    onSuccess,
    locale,
  ]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
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
          {/* Person (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {locale === 'fr' ? 'Personne' : 'Person'}
            </label>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
              {appointment.person.full_name}
            </div>
          </div>

          {/* Title (Q6 — in-place UPDATE) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('title')}
            </label>
            <select
              value={title}
              onChange={(e) => setTitle(e.target.value as OfficerTitle)}
              disabled={enteredInError}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {TITLE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value === 'custom'
                    ? t('customTitle')
                    : TITLE_LABELS[value][locale]}
                </option>
              ))}
            </select>
            {title === 'custom' && (
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                disabled={enteredInError}
                placeholder={locale === 'fr' ? 'Titre personnalisé' : 'Custom title'}
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            )}
          </div>

          {/* Appointment date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('appointmentDate')}
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              disabled={enteredInError}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
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
              disabled={enteredInError}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* End reason — force-pick */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('endReason')}
            </label>
            <select
              value={endReason}
              onChange={(e) => setEndReason(e.target.value as OfficerEndReason | '')}
              disabled={enteredInError}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">{locale === 'fr' ? '— Sélectionner —' : '— Select —'}</option>
              {END_REASON_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`endReasons.${value}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Soft-delete (entered-in-error) */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={enteredInError}
                onChange={(e) => setEnteredInError(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('enteredInError')}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {t('enteredInErrorHelp')}
                </div>
              </div>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
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
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)]"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (!enteredInError && !endReason)}
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
