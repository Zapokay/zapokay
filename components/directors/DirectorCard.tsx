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
    <div className="group rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 transition-shadow hover:shadow-md">
      {/* Top section: Avatar + info */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={{ background: 'var(--person-avatar-bg)', color: 'var(--person-avatar-text)' }}
        >
          {getInitials(person.full_name)}
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[var(--text-heading)]">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
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
          <div className="flex items-center gap-2 text-sm text-[var(--text-body)]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <span>{location}</span>
          </div>
        )}

        {/* Canadian resident badge */}
        <div className="flex items-center gap-2 text-sm">
          <Flag className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {person.is_canadian_resident ? (
            <span className="text-[var(--success-text)]">
              {locale === 'fr' ? 'Résident canadien' : 'Canadian resident'}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">
              {locale === 'fr' ? 'Non-résident' : 'Non-resident'}
            </span>
          )}
        </div>

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-body)]">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-[var(--card-border)] pt-3">
        <button
          type="button"
          onClick={() => onEdit(director)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--card-border)] hover:text-[var(--text-heading)]"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(director)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--error-text)] transition-colors hover:bg-[var(--error-bg)]"
        >
          <UserMinus className="h-3.5 w-3.5" />
          {t('remove')}
        </button>
      </div>
    </div>
  );
}

