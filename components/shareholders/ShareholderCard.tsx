'use client';

import { useTranslations } from 'next-intl';
import { Pencil, ArrowRightLeft } from 'lucide-react';
import type {
  ShareholdingWithDetails,
  DirectorMandate,
  OfficerAppointment,
} from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface ShareholderCardProps {
  /** All shareholdings for this person (may span multiple classes) */
  shareholdings: ShareholdingWithDetails[];
  totalIssuedShares: number;
  /** Active director mandates for this person */
  directorMandates: DirectorMandate[];
  /** Active officer appointments for this person */
  officerAppointments: OfficerAppointment[];
  onEdit: (shareholding: ShareholdingWithDetails) => void;
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

export default function ShareholderCard({
  shareholdings,
  totalIssuedShares,
  directorMandates,
  officerAppointments,
  onEdit,
}: ShareholderCardProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  if (shareholdings.length === 0) return null;

  const person = shareholdings[0].person;
  const totalQuantity = shareholdings.reduce((sum, s) => sum + s.quantity, 0);
  const pct = totalIssuedShares > 0 ? Math.round((totalQuantity / totalIssuedShares) * 100) : 0;

  // Use the first shareholding for display of date + certificate (most common: 1 holding)
  const primary = shareholdings[0];

  // Build "Aussi :" roles line
  const otherRoles: string[] = [];

  if (directorMandates.length > 0) {
    otherRoles.push(locale === 'fr' ? 'Administrateur' : 'Director');
  }

  officerAppointments.forEach((oa) => {
    if (oa.title === 'custom') {
      otherRoles.push(oa.custom_title || 'Custom');
    } else {
      const labels = OFFICER_TITLE_LABELS[oa.title];
      otherRoles.push(labels ? labels[locale] : oa.title);
    }
  });

  // Share class name(s)
  const classNames = Array.from(new Set(shareholdings.map((s) => s.share_class.name)));
  const classLabel = classNames.join(', ');

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-800/60">
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
            {totalQuantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
            {locale === 'fr' ? 'actions' : 'shares'}{' '}
            <span className="lowercase">{classLabel}</span>
            {' · '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{pct}%</span>
            {' '}
            {locale === 'fr' ? 'du capital' : 'of capital'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5 pl-16">
        {/* Issue date */}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {locale === 'fr'
            ? `Émises le ${formatDate(primary.issue_date, locale)}`
            : `Issued ${formatDate(primary.issue_date, locale)}`}
        </p>

        {/* Certificate number */}
        {primary.certificate_number && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {locale === 'fr' ? 'Certificat' : 'Certificate'} #{primary.certificate_number}
          </p>
        )}

        {/* Multiple holdings detail */}
        {shareholdings.length > 1 && (
          <div className="mt-1 space-y-1 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
            {shareholdings.map((sh) => (
              <p key={sh.id} className="text-xs text-zinc-500 dark:text-zinc-400">
                {sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                {sh.share_class.name}
                {sh.certificate_number ? ` · #${sh.certificate_number}` : ''}
                {' · '}
                {formatDate(sh.issue_date, locale)}
              </p>
            ))}
          </div>
        )}

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
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
          onClick={() => onEdit(primary)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        <button
          type="button"
          disabled
          className="group/btn flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 opacity-60"
          title={locale === 'fr' ? 'Bientôt disponible (Sprint 7)' : 'Coming soon (Sprint 7)'}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {t('transfer')}
        </button>
      </div>
    </div>
  );
}

