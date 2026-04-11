'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, RefreshCw, Loader2, ArrowRight } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { OfficerWithPerson } from '@/lib/supabase/people-types';

// =============================================================================
// Helpers
// =============================================================================

const TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

function getRoleLabel(officer: OfficerWithPerson, locale: string): string {
  if (officer.title === 'custom') {
    return officer.custom_title || 'Custom';
  }
  return TITLE_LABELS[officer.title]?.[locale as 'fr' | 'en'] ?? officer.title;
}

// =============================================================================
// Types
// =============================================================================

interface ReplaceOfficerModalProps {
  officer: OfficerWithPerson;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function ReplaceOfficerModal({
  officer,
  companyId,
  onClose,
  onSuccess,
}: ReplaceOfficerModalProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];
  const roleLabel = getRoleLabel(officer, locale);

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [endDate, setEndDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [isSigningAuthority, setIsSigningAuthority] = useState(
    officer.is_primary_signing_authority
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Resolve incoming person ID
      let incomingPersonId: string;

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
        incomingPersonId = newPerson.id;
      } else {
        incomingPersonId = personValue.personId;
      }

      // 2. End outgoing officer appointment
      const { error: endErr } = await supabase
        .from('officer_appointments')
        .update({
          is_active: false,
          end_date: endDate,
        })
        .eq('id', officer.id);

      if (endErr) throw new Error(endErr.message);

      // 3. Create new appointment for incoming person (same role)
      const { error: createErr } = await supabase
        .from('officer_appointments')
        .insert({
          company_id: companyId,
          person_id: incomingPersonId,
          title: officer.title,
          custom_title: officer.custom_title,
          is_primary_signing_authority: isSigningAuthority,
          appointment_date: startDate,
          is_active: true,
        });

      if (createErr) throw new Error(createErr.message);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }, [personValue, endDate, startDate, isSigningAuthority, officer, companyId, supabase, onSuccess, t]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="flex items-center justify-between modal-header px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-heading)]">
            <RefreshCw className="h-5 w-5 text-[var(--text-muted)]" />
            {t('replaceOfficer')}
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
          {/* Context: who is being replaced */}
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {locale === 'fr'
                ? `Remplacer ${officer.person.full_name} comme ${roleLabel} ?`
                : `Replace ${officer.person.full_name} as ${roleLabel}?`}
            </p>
            {/* Visual: outgoing → incoming */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 rounded-md bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {officer.person.full_name}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
              <div className="flex-1 rounded-md bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                {personValue
                  ? personValue.mode === 'existing'
                    ? personValue.person.full_name
                    : personValue.fullName || '…'
                  : '?'}
              </div>
            </div>
          </div>

          {/* Select incoming person */}
          <PersonSelector
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            excludePersonIds={[officer.person_id]}
            label={locale === 'fr' ? 'Nouveau titulaire' : 'New appointee'}
          />

          {/* Dates row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {locale === 'fr' ? 'Fin de mandat (sortant)' : 'End date (outgoing)'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {locale === 'fr' ? 'Entrée en poste (entrant)' : 'Start date (incoming)'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

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
            disabled={saving || !personValue}
            className="flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2 text-sm font-semibold text-[var(--cta-text)] shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('confirmReplace')}
          </button>
        </div>
      </div>
    </div>
  );
}

