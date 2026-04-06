'use client';

import { useTranslations } from 'next-intl';
import { MapPin, Pencil, UserMinus, Flag } from 'lucide-react';
import type {
  DirectorWithPerson,
  OfficerAppointment,
  Shareholding,
  ShareClass,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface DirectorCardProps {
  director: DirectorWithPerson;
  /** Active officer appointments for this person */
  officerAppointments: OfficerAppointment[];
  /** Active shareholdings for this person */
  shareholdings: (Shareholding & { share_class: ShareClass })[];
  onEdit: (director: DirectorWithPerson) => void;
  onRemove: (director: DirectorWithPerson) => void;
}

// =============================================================================
// Helpers
// =============================================================================

const OFFICER_TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// =============================================================================
// Component
// =============================================================================

export default function DirectorCard({
  director,
  officerAppointments,
  shareholdings,
  onEdit,
  onRemove,
}: DirectorCardProps) {
  const t = useTranslations('directors');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const { person } = director;
  const totalShares = shareholdings.reduce((sum, s) => sum + s.quantity, 0);

  // Build "Aussi :" roles line
  const otherRoles: string[] = [];

  officerAppointments.forEach((oa) => {
    if (oa.title === 'custom') {
      otherRoles.push(oa.custom_title || 'Custom');
    } else {
      const labels = OFFICER_TITLE_LABELS[oa.title];
      otherRoles.push(labels ? labels[locale] : oa.title);
    }
  });

  if (totalShares > 0) {
    otherRoles.push(
      locale === 'fr'
        ? `Actionnaire (${totalShares} actions)`
        : `Shareholder (${totalShares} shares)`
    );
  }

  // Location string
  const location = [person.address_city, person.address_province]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Top section: Avatar + info */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-base font-bold text-amber-700 dark:from-amber-900/50 dark:to-amber-800/50 dark:text-amber-300">
          {getInitials(person.full_name)}
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? `Administrateur depuis le ${formatDate(director.appointment_date, locale)}`
              : `Director since ${formatDate(director.appointment_date, locale)}`}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 space-y-2">
        {/* Location */}
        {location && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span>{location}</span>
          </div>
        )}

        {/* Canadian resident badge */}
        <div className="flex items-center gap-2 text-sm">
          <Flag className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          {person.is_canadian_resident ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              {locale === 'fr' ? 'Résident canadien' : 'Canadian resident'}
            </span>
          ) : (
            <span className="text-zinc-500">
              {locale === 'fr' ? 'Non-résident' : 'Non-resident'}
            </span>
          )}
        </div>

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
        <button
          type="button"
          onClick={() => onEdit(director)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(director)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
        >
          <UserMinus className="h-3.5 w-3.5" />
          {t('remove')}
        </button>
      </div>
    </div>
  );
}

