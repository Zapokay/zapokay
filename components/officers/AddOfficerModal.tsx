'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { OfficerTitle } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface AddOfficerModalProps {
  companyId: string;
  incorporationDate: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Title options
// =============================================================================

const TITLE_OPTIONS: { value: OfficerTitle; fr: string; en: string }[] = [
  { value: 'president', fr: 'Président·e', en: 'President' },
  { value: 'vice_president', fr: 'Vice-président·e', en: 'Vice President' },
  { value: 'secretary', fr: 'Secrétaire', en: 'Secretary' },
  { value: 'treasurer', fr: 'Trésorier·ière', en: 'Treasurer' },
  { value: 'custom', fr: 'Autre (personnalisé)', en: 'Other (custom)' },
];

// =============================================================================
// Component
// =============================================================================

export default function AddOfficerModal({
  companyId,
  incorporationDate,
  onClose,
  onSuccess,
}: AddOfficerModalProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [title, setTitle] = useState<OfficerTitle>('president');
  const [customTitle, setCustomTitle] = useState('');
  const [isSigningAuthority, setIsSigningAuthority] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(
    incorporationDate || new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictOfficer, setConflictOfficer] = useState<{ id: string; name: string; titleLabel: string } | null>(null);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async (replaceConflict = false) => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }
    if (!appointmentDate) {
      setError(t('errorAppointmentDate'));
      return;
    }
    if (title === 'custom' && !customTitle.trim()) {
      setError(t('errorCustomTitle'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Check for title conflict (non-custom roles only)
      if (title !== 'custom' && !replaceConflict) {
        const { data: existing } = await supabase
          .from('officer_appointments')
          .select('id, company_people(full_name)')
          .eq('company_id', companyId)
          .eq('title', title)
          .eq('is_active', true)
          .limit(1);

        if (existing && existing.length > 0) {
          const existingPerson = existing[0].company_people;
          const name = Array.isArray(existingPerson)
            ? (existingPerson[0] as { full_name: string } | undefined)?.full_name ?? ''
            : (existingPerson as { full_name: string } | null)?.full_name ?? '';
          const titleLabel = TITLE_OPTIONS.find(o => o.value === title)?.[locale === 'fr' ? 'fr' : 'en'] ?? title;
          setConflictOfficer({ id: existing[0].id, name, titleLabel });
          setSaving(false);
          return;
        }
      }

      // If replacing, deactivate the existing officer first
      if (replaceConflict && conflictOfficer) {
        await supabase
          .from('officer_appointments')
          .update({ is_active: false })
          .eq('id', conflictOfficer.id);
        setConflictOfficer(null);
      }

      let personId: string;

      if (personValue.mode === 'new') {
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

      // Create officer appointment
      const { error: appointErr } = await supabase
        .from('officer_appointments')
        .insert({
          company_id: companyId,
          person_id: personId,
          title,
          custom_title: title === 'custom' ? customTitle.trim() : null,
          is_primary_signing_authority: isSigningAuthority,
          appointment_date: appointmentDate,
          is_active: true,
        });

      if (appointErr) {
        throw new Error(appointErr.message);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, title, customTitle, isSigningAuthority, appointmentDate, companyId, conflictOfficer, supabase, onSuccess, t, locale]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <Zap className="mr-1.5 inline h-4 w-4 text-amber-500" />
            {t('appointOfficer')}
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
            label={t('person')}
          />

          {/* Role selector */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('role')} <span className="text-red-500">*</span>
            </label>
            <select
              value={title}
              onChange={(e) => setTitle(e.target.value as OfficerTitle)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {TITLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {locale === 'fr' ? opt.fr : opt.en}
                </option>
              ))}
            </select>
          </div>

          {/* Custom title (visible only when title === 'custom') */}
          {title === 'custom' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('customTitle')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={locale === 'fr' ? 'Ex. : Directeur des opérations' : 'E.g.: Chief Operating Officer'}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {/* Signing authority toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={isSigningAuthority}
                onChange={(e) => setIsSigningAuthority(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('signingAuthority')}
            </span>
          </label>

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

          {/* Conflict dialog */}
          {conflictOfficer && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {locale === 'fr'
                  ? `Le poste de ${conflictOfficer.titleLabel} est déjà occupé par ${conflictOfficer.name}.`
                  : `The ${conflictOfficer.titleLabel} position is already held by ${conflictOfficer.name}.`}
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {locale === 'fr'
                  ? 'Voulez-vous remplacer ce dirigeant ?'
                  : 'Do you want to replace this officer?'}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  {locale === 'fr' ? 'Remplacer' : 'Replace'}
                </button>
                <button
                  type="button"
                  onClick={() => setConflictOfficer(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
                >
                  {locale === 'fr' ? 'Annuler' : 'Cancel'}
                </button>
              </div>
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
            onClick={() => handleSave()}
            disabled={saving || !personValue}
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

