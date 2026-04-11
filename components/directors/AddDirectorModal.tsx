'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import { logActivity } from '@/lib/activity-log';

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

      const fullName = personValue.mode === 'new' ? personValue.fullName : personValue.person.full_name;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          companyId,
          user.id,
          'director_added',
          `Administrateur ajouté : ${fullName}`,
          `Director added: ${fullName}`,
          { person_id: personId }
        );
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

