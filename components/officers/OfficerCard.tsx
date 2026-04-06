'use client';

import { useTranslations } from 'next-intl';
import { Pencil, UserMinus, RefreshCw, Star } from 'lucide-react';
import type {
  OfficerWithPerson,
  DirectorMandate,
  Shareholding,
  ShareClass,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface OfficerCardProps {
  officer: OfficerWithPerson;
  /** Active director mandates for this person */
  directorMandates: DirectorMandate[];
  /** Active shareholdings for this person */
  shareholdings: (Shareholding & { share_class: ShareClass })[];
  onEdit: (officer: OfficerWithPerson) => void;
  onReplace: (officer: OfficerWithPerson) => void;
  onRemove: (officer: OfficerWithPerson) => void;
}

// =============================================================================
// Helpers
// =============================================================================

const TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'PRÉSIDENT·E', en: 'PRESIDENT' },
  vice_president: { fr: 'VICE-PRÉSIDENT·E', en: 'VICE PRESIDENT' },
  secretary: { fr: 'SECRÉTAIRE', en: 'SECRETARY' },
  treasurer: { fr: 'TRÉSORIER·IÈRE', en: 'TREASURER' },
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

export default function OfficerCard({
  officer,
  directorMandates,
  shareholdings,
  onEdit,
  onReplace,
  onRemove,
}: OfficerCardProps) {
  const t = useTranslations('officers');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const { person } = officer;
  const totalShares = shareholdings.reduce((sum, s) => sum + s.quantity, 0);

  // Role header label
  const titleLabel =
    officer.title === 'custom'
      ? (officer.custom_title || 'Custom').toUpperCase()
      : (TITLE_LABELS[officer.title]?.[locale] ?? officer.title.toUpperCase());

  // Build "Aussi :" roles line
  const otherRoles: string[] = [];

  if (directorMandates.length > 0) {
    otherRoles.push(locale === 'fr' ? 'Administrateur' : 'Director');
  }

  if (totalShares > 0) {
    otherRoles.push(
      locale === 'fr'
        ? `Actionnaire (${totalShares} actions)`
        : `Shareholder (${totalShares} shares)`
    );
  }

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-800/60">
      {/* Role header */}
      <div className="mb-3 text-[11px] font-bold tracking-widest text-amber-600 dark:text-amber-400">
        {titleLabel}
      </div>

      {/* Avatar + info */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-base font-bold text-amber-700 dark:from-amber-900/50 dark:to-amber-800/50 dark:text-amber-300">
          {getInitials(person.full_name)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr'
              ? `En poste depuis le ${formatDate(officer.appointment_date, locale)}`
              : `In office since ${formatDate(officer.appointment_date, locale)}`}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-2">
        {/* Signing authority badge */}
        {officer.is_primary_signing_authority && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <Star className="h-3 w-3 fill-current" />
            {locale === 'fr' ? 'Signataire autorisé' : 'Authorized signatory'}
          </div>
        )}

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-700/60">
        <button
          type="button"
          onClick={() => onEdit(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={() => onReplace(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('replace')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
        >
          <UserMinus className="h-3.5 w-3.5" />
          {t('remove')}
        </button>
      </div>
    </div>
  );
}

