'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';

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
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [appointmentDate, setAppointmentDate] = useState(
    incorporationDate || new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Create director mandate
      const { error: mandateErr } = await supabase
        .from('director_mandates')
        .insert({
          company_id: companyId,
          person_id: personId,
          appointment_date: appointmentDate,
          is_active: true,
        });

      if (mandateErr) {
        throw new Error(mandateErr.message);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, appointmentDate, companyId, supabase, onSuccess, t]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <Zap className="mr-1.5 inline h-4 w-4 text-amber-500" />
            {t('addDirector')}
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
          {/* Person selector */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            excludePersonIds={existingDirectorPersonIds}
            label={t('person')}
            defaultToNew={existingDirectorPersonIds.length === 0}
          />

          {/* Appointment date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('appointmentDate')} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
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
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !personValue}
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

