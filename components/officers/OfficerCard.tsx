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
    <div className="group rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 transition-shadow hover:shadow-md">
      {/* Role header */}
      <div className="mb-3 text-[11px] font-bold tracking-widest text-[var(--warning-text)]">
        {titleLabel}
      </div>

      {/* Avatar + info */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={{ background: 'var(--person-avatar-bg)', color: 'var(--person-avatar-text)' }}
        >
          {getInitials(person.full_name)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[var(--text-heading)]">
            {person.full_name}
          </h3>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
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
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}
          >
            <Star className="h-3 w-3 fill-current" />
            {locale === 'fr' ? 'Signataire autorisé' : 'Authorized signatory'}
          </div>
        )}

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-body)]">
              {locale === 'fr' ? 'Aussi' : 'Also'}
            </span>
            {' : '}
            {otherRoles.join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--card-border)] pt-3">
        <button
          type="button"
          onClick={() => onEdit(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--card-border)] hover:text-[var(--text-heading)]"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={() => onReplace(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--info-text)] transition-colors hover:bg-[var(--info-bg)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('replace')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(officer)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--error-text)] transition-colors hover:bg-[var(--error-bg)]"
        >
          <UserMinus className="h-3.5 w-3.5" />
          {t('remove')}
        </button>
      </div>
    </div>
  );
}

