'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import { logActivity } from '@/lib/activity-log';
import type { DirectorEndReason } from '@/lib/supabase/people-types';

// =============================================================================
// End-reason options (labels resolved via t('endReasons.{value}'))
// =============================================================================

const END_REASON_VALUES: DirectorEndReason[] = [
  'resignation',
  'revocation',
  'term_expired',
  'death',
  'disqualification',
];

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
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const defaultAppointmentDate = incorporationDate || new Date().toISOString().split('T')[0];

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [stillInOffice, setStillInOffice] = useState(true);
  const [appointmentDate, setAppointmentDate] = useState(defaultAppointmentDate);
  const [endDate, setEndDate] = useState('');
  const [endReason, setEndReason] = useState<DirectorEndReason | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle handler — retroactive mode clears dates to force explicit entry;
  // ON mode restores the appointment_date default.
  const handleStillInOfficeChange = useCallback((next: boolean) => {
    setStillInOffice(next);
    if (next) {
      setAppointmentDate(defaultAppointmentDate);
      setEndDate('');
    } else {
      setAppointmentDate('');
      setEndDate('');
    }
  }, [defaultAppointmentDate]);

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
    // Retroactive mode requires end_date + end_reason; end_date >= appointment_date.
    if (!stillInOffice) {
      if (!endDate) {
        setError(locale === 'fr' ? 'La date de fin est requise.' : 'End date is required.');
        return;
      }
      if (!endReason) {
        setError(locale === 'fr' ? 'Le motif de fin est requis.' : 'A reason is required.');
        return;
      }
      if (new Date(endDate) < new Date(appointmentDate)) {
        setError(
          locale === 'fr'
            ? 'La date de fin doit être postérieure ou égale à la date de nomination.'
            : 'End date must be on or after the appointment date.'
        );
        return;
      }
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

      // Create director mandate — retroactive mode inserts inactive row with
      // end_date + end_reason; normal mode is unchanged.
      const mandatePayload: Record<string, unknown> = {
        company_id: companyId,
        person_id: personId,
        appointment_date: appointmentDate,
        is_active: stillInOffice,
      };
      if (!stillInOffice) {
        mandatePayload.end_date = endDate;
        mandatePayload.end_reason = endReason;
      }

      const { error: mandateErr } = await supabase
        .from('director_mandates')
        .insert(mandatePayload);

      if (mandateErr) {
        throw new Error(mandateErr.message);
      }

      const fullName = personValue.mode === 'new' ? personValue.fullName : personValue.person.full_name;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Option A: single _added event; retroactive carries end metadata in details.
        const titleFr = stillInOffice
          ? `Administrateur ajouté : ${fullName}`
          : `Administrateur ajouté (rétroactif) : ${fullName}`;
        const titleEn = stillInOffice
          ? `Director added: ${fullName}`
          : `Director added (retroactive): ${fullName}`;
        const details: Record<string, unknown> = { person_id: personId };
        if (!stillInOffice) {
          details.ended = true;
          details.end_date = endDate;
          details.end_reason = endReason;
          details.retroactive = true;
        }
        await logActivity(
          supabase,
          companyId,
          user.id,
          'director_added',
          titleFr,
          titleEn,
          details
        );
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, appointmentDate, stillInOffice, endDate, endReason, companyId, supabase, onSuccess, t, locale]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="flex items-center justify-between modal-header px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--text-heading)]">
            <Zap className="mr-1.5 inline h-4 w-4 text-[var(--amber-400)]" />
            {t('addDirector')}
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
          {/* Person selector */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            excludePersonIds={existingDirectorPersonIds}
            label={t('person')}
            defaultToNew={existingDirectorPersonIds.length === 0}
          />

          {/* Still in office? toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={stillInOffice}
                onChange={(e) => handleStillInOfficeChange(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-[var(--text-body)]">{t('stillInOffice')}</span>
          </label>

          {/* Appointment date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
              {t('appointmentDate')} <span style={{ color: 'var(--error-text)' }}>*</span>
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-body)] focus:border-[var(--input-border-focus)] focus:outline-none transition-colors"
            />
          </div>

          {/* Retroactive mode: end_date + end_reason */}
          {!stillInOffice && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                  {t('endDate')} <span style={{ color: 'var(--error-text)' }}>*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-body)] focus:border-[var(--input-border-focus)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                  {t('endReason')} <span style={{ color: 'var(--error-text)' }}>*</span>
                </label>
                <select
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value as DirectorEndReason | '')}
                  className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-body)] focus:border-[var(--input-border-focus)] focus:outline-none transition-colors"
                >
                  <option value="">{locale === 'fr' ? '— Sélectionner —' : '— Select —'}</option>
                  {END_REASON_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {t(`endReasons.${value}`)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-border)' }}>
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
            disabled={saving || !personValue || (!stillInOffice && !endReason)}
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

