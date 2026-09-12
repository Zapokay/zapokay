'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Zap, Loader2 } from 'lucide-react';
import PersonSelector, {
  type PersonSelectorValue,
} from '@/components/people/PersonSelector';
import type { OfficerTitle, OfficerEndReason } from '@/lib/supabase/people-types';
import { logActivity } from '@/lib/activity-log';
import { libelleTitre } from '@/lib/officer-titles';
import { useResolveurCatalogue } from '@/lib/i18n/client-messages';
import { champsManquants, type ChampPersonne } from '@/lib/data-gaps';
import { chargePersonne, insererPersonne } from '@/lib/person-payload';

// =============================================================================
// End-reason options (labels resolved via t('endReasons.{value}'))
// =============================================================================

const END_REASON_VALUES: OfficerEndReason[] = [
  'resignation',
  'revocation',
  'term_expired',
  'death',
  'disqualification',
];

// =============================================================================
// Types
// =============================================================================

interface AddOfficerModalProps {
  companyId: string;
  incorporationDate: string | null;
  /**
   * La residence canadienne s'applique-t-elle a cette societe ? DECIDE en
   * amont par residencyApplies(), jamais recalcule ici : cette modale
   * TRANSPORTE, elle ne compare pas.
   */
  residencyApplies: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Title options
// =============================================================================

/**
 * ⛔ DES VALEURS, PLUS DE LIBELLÉS. Cette liste portait les cinq textes de la
 * liste déroulante — c'était la table de libellés n° 9. Elle ne porte plus que
 * l'ORDRE des options ; chaque texte vient du catalogue par `libelleTitre`.
 */
const TITLE_VALUES: OfficerTitle[] = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'custom',
];

// =============================================================================
// Component
// =============================================================================

export default function AddOfficerModal({
  companyId,
  incorporationDate,
  residencyApplies,
  onClose,
  onSuccess,
}: AddOfficerModalProps) {
  const t = useTranslations('officers');
  const tCommon = useTranslations('common');
  const tCatalogue = useResolveurCatalogue();
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const defaultAppointmentDate = incorporationDate || new Date().toISOString().split('T')[0];

  // ---- State ----------------------------------------------------------------
  const [personValue, setPersonValue] = useState<PersonSelectorValue | null>(null);
  const [title, setTitle] = useState<OfficerTitle>('president');
  const [customTitle, setCustomTitle] = useState('');
  const [isSigningAuthority, setIsSigningAuthority] = useState(false);
  const [stillInOffice, setStillInOffice] = useState(true);
  const [appointmentDate, setAppointmentDate] = useState(defaultAppointmentDate);
  const [endDate, setEndDate] = useState('');
  const [endReason, setEndReason] = useState<OfficerEndReason | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictOfficer, setConflictOfficer] = useState<{ id: string; personId: string; name: string; titleLabel: string } | null>(null);

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

  /**
   * ★ LA MÊME DÉCLARATION QUE CHEZ LES ADMINISTRATEURS, ET LE MÊME APPEL.
   * `champsManquants` décide ; le bouton et handleSave lisent la même liste.
   * Rien n'est réécrit ici : remplir `officer` dans lib/data-gaps.ts suffit à
   * faire apparaître l'astérisque, la garde et la ligne à l'export.
   */
  const manquants: ChampPersonne[] =
    personValue?.mode === 'new'
      ? champsManquants('officer', {
          address_city: personValue.addressCity,
          address_country: personValue.addressCountry,
        })
      : [];
  const domicileIncomplet = manquants.length > 0;
  // Le message NOMME ce qui manque, et il passe par la fente de PersonSelector.
  const messageDomicile = !domicileIncomplet
    ? undefined
    : manquants.length === 2 ? t('errorCityAndCountry')
    : manquants[0] === 'address_city' ? t('errorCity')
    : t('errorCountry');

  // ---- Save -----------------------------------------------------------------
  const handleSave = useCallback(async (replaceConflict = false) => {
    if (!personValue) {
      setError(t('errorSelectPerson'));
      return;
    }
    // Ceinture : le bouton est déjà désactivé. Recalculée depuis `personValue`
    // — qui EST dans les dépendances — pour ne jamais lire une liste périmée.
    if (personValue.mode === 'new') {
      const absents = champsManquants('officer', {
        address_city: personValue.addressCity,
        address_country: personValue.addressCountry,
      });
      if (absents.length > 0) {
        setError(
          absents.length === 2 ? t('errorCityAndCountry')
          : absents[0] === 'address_city' ? t('errorCity')
          : t('errorCountry'),
        );
        return;
      }
    }
    if (!appointmentDate) {
      setError(t('errorAppointmentDate'));
      return;
    }
    if (title === 'custom' && !customTitle.trim()) {
      setError(t('errorCustomTitle'));
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
      // SAFEGUARD 1 — active-title-uniqueness check. SKIP in retroactive mode
      // (toggle OFF) so back-dating a former CEO does not collide with the
      // sitting CEO. Also skipped for 'custom' titles (free-form, no uniqueness).
      if (stillInOffice && title !== 'custom' && !replaceConflict) {
        const { data: existing, error: existingErr } = await supabase
          .from('officer_appointments')
          .select('id, person_id, company_people(full_name)')
          .eq('company_id', companyId)
          .eq('title', title)
          .eq('is_active', true)
          .limit(1);

        // ⚠️ A FAILED LOOKUP IS NOT "NO CONFLICT" — falling through appoints a
        // second active holder of the same title, inverting this guard's purpose.
        if (existingErr) {
          console.error('[AddOfficerModal] active-title lookup failed:', existingErr);
          throw new Error(tCommon('saveFailed'));
        }

        if (existing && existing.length > 0) {
          const existingPerson = existing[0].company_people;
          const name = Array.isArray(existingPerson)
            ? (existingPerson[0] as { full_name: string } | undefined)?.full_name ?? ''
            : (existingPerson as { full_name: string } | null)?.full_name ?? '';
          // Cette branche ne s'atteint pas pour `custom` (garde à L178).
          const titleLabel = libelleTitre({ title, custom_title: null }, tCatalogue);
          setConflictOfficer({ id: existing[0].id, personId: existing[0].person_id, name, titleLabel });
          setSaving(false);
          return;
        }
      }

      // If replacing, deactivate the existing officer first
      if (replaceConflict && conflictOfficer) {
        const { error: deactivateErr } = await supabase
          .from('officer_appointments')
          .update({ is_active: false })
          .eq('id', conflictOfficer.id);
        // ⚠️ STOP BEFORE THE INSERT. A silent failure here leaves the old officer
        // active and appoints a second one to the same title (art. 31(3°)).
        if (deactivateErr) {
          console.error('[AddOfficerModal] deactivating the replaced officer failed:', deactivateErr);
          throw new Error(tCommon('saveFailed'));
        }
        setConflictOfficer(null);
      }

      let personId: string;

      if (personValue.mode === 'new') {
        // ★ UNE SEULE PORTE D'ÉCRITURE — lib/person-payload.ts, `address_line2`
        //   comprise.
        const { data: newPerson, error: insertErr } = await insererPersonne(
          supabase,
          chargePersonne(companyId, personValue),
        );

        if (insertErr || !newPerson) {
          throw new Error(insertErr?.message || 'Failed to create person');
        }
        personId = newPerson.id;
      } else {
        personId = personValue.personId;
      }

      // Create officer appointment — retroactive mode inserts inactive row
      // with end_date + end_reason; normal mode is unchanged.
      const appointmentPayload: Record<string, unknown> = {
        company_id: companyId,
        person_id: personId,
        title,
        custom_title: title === 'custom' ? customTitle.trim() : null,
        is_primary_signing_authority: isSigningAuthority,
        appointment_date: appointmentDate,
        is_active: stillInOffice,
      };
      if (!stillInOffice) {
        appointmentPayload.end_date = endDate;
        appointmentPayload.end_reason = endReason;
      }

      const { error: appointErr } = await supabase
        .from('officer_appointments')
        .insert(appointmentPayload);

      if (appointErr) {
        throw new Error(appointErr.message);
      }

      const titleFrMap: Record<string, string> = {
        president: 'Président·e',
        vice_president: 'Vice-président·e',
        secretary: 'Secrétaire',
        treasurer: 'Trésorier·ère',
        director_general: 'Directeur·rice général·e',
      };
      const fullName = personValue.mode === 'new' ? personValue.fullName : personValue.person.full_name;
      const titleLabel = title === 'custom' ? customTitle.trim() : (titleFrMap[title] || title);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Option A: single _added event; retroactive carries end metadata in details.
        const titleFr = stillInOffice
          ? `Dirigeant nommé : ${fullName} — ${titleLabel}`
          : `Dirigeant nommé (rétroactif) : ${fullName} — ${titleLabel}`;
        const titleEn = stillInOffice
          ? `Officer appointed: ${fullName} — ${title}`
          : `Officer appointed (retroactive): ${fullName} — ${title}`;
        const details: Record<string, unknown> = { person_id: personId, title };
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
          'officer_added',
          titleFr,
          titleEn,
          details
        );
      }

      onSuccess();
    } catch (err) {
      // ⚠️ NEVER a raw err.message on screen — a network throw surfaced
      // "TypeError: Load failed", in English, inside a French UI.
      console.error('[AddOfficerModal] save failed:', err);
      setError(tCommon('saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [personValue, title, customTitle, isSigningAuthority, stillInOffice, appointmentDate, endDate, endReason, companyId, conflictOfficer, supabase, onSuccess, t, tCommon, tCatalogue, locale]);

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
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
            exigences="officer"
            residencyApplies={residencyApplies}
            companyId={companyId}
            value={personValue}
            onChange={setPersonValue}
            label={t('person')}
            error={messageDomicile}
            excludePersonIds={conflictOfficer ? [conflictOfficer.personId] : []}
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
              {TITLE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {libelleTitre({ title: value, custom_title: null }, tCatalogue)}
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
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{t('stillInOffice')}</span>
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

          {/* Retroactive mode: end_date + end_reason */}
          {!stillInOffice && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('endDate')} <span className="text-red-500">*</span>
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
                  {t('endReason')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value as OfficerEndReason | '')}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
        <div className="sticky bottom-0 flex items-center justify-end gap-3 modal-footer modal-surface px-6 py-4">
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
            disabled={saving || !personValue || (!stillInOffice && !endReason) || domicileIncomplet}
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

