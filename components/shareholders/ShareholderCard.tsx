'use client';

import { useTranslations } from 'next-intl';
import { Pencil, ArrowRightLeft, LogOut } from 'lucide-react';
import type {
  ShareholdingWithDetails,
  DirectorMandate,
  OfficerAppointment,
} from '@/lib/supabase/people-types';
import { formatDate } from '@/lib/utils';

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
  /**
   * #19d Phase 3 (cessation) — per-holding "Terminer" affordance. PER-HOLDING
   * granularity is a locked decision (brief 2026-05-26): one End modal per
   * shareholding row, not one per shareholder card. For multi-holding cards
   * the button is rendered next to each detail row; for single-holding cards
   * it sits in the bottom action bar next to Edit.
   */
  onEndShareholding: (shareholding: ShareholdingWithDetails) => void;
  /**
   * #19d Phase 3 (issuance) — per-holding "Générer émission" affordance.
   * Mirrors the cessation pattern, but for the issuance act on ACTIVE
   * holdings. Returns undefined for founding-cohort holdings (issue_date <=
   * incorporation_date) since event-completeness doesn't enumerate those.
   */
  getIssuanceAct: (shareholdingId: string) => { satisfied: boolean; documentId: string | null } | undefined;
  onGenerateIssuance: (shareholding: ShareholdingWithDetails) => void;
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

// =============================================================================
// Component
// =============================================================================

export default function ShareholderCard({
  shareholdings,
  totalIssuedShares,
  directorMandates,
  officerAppointments,
  onEdit,
  onEndShareholding,
  getIssuanceAct,
  onGenerateIssuance,
}: ShareholderCardProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  // Per-holding issuance affordance. Returns null for founding-cohort holdings
  // (no act enumerated). Mirrors the cessation per-row pattern on the
  // former-shareholders list in ShareholdersClient.tsx (L323-411).
  function renderIssuanceAffordance(sh: ShareholdingWithDetails) {
    const act = getIssuanceAct(sh.id);
    if (!act) return null;
    if (act.satisfied && act.documentId) {
      return (
        <>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)]">
            {t('issuanceGenerated')}
          </span>
          <a
            href={`/api/documents/${act.documentId}/download?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
          >
            {t('viewDocument')}
          </a>
        </>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onGenerateIssuance(sh)}
        className="text-xs font-medium text-[var(--amber-500,#F59E0B)] hover:underline"
      >
        {t('generateIssuance')}
      </button>
    );
  }

  // Atom 2: ShareholdingWithDetails.person is nullable (Q-R-G2-C transitional).
  // In practice unreachable here — ShareholdersClient.tsx's shareholderPersonIds
  // already filters out null-person rows upstream. The guard is a type-honesty
  // formality, removed in atom 3 when the card is rebuilt for entity holders.
  if (shareholdings.length === 0 || !shareholdings[0].person) return null;

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
    <div className="group rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 transition-shadow hover:shadow-md">
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
            {totalQuantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
            {locale === 'fr' ? 'actions' : 'shares'}{' '}
            <span>{classLabel}</span>
            {' · '}
            <span className="font-medium text-[var(--text-body)]">{pct}%</span>
            {' '}
            {locale === 'fr' ? 'du capital' : 'of capital'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5 pl-16">
        {/* Issue date */}
        <p className="text-sm text-[var(--text-muted)]">
          {locale === 'fr'
            ? `Émises le ${formatDate(primary.issue_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
            : `Issued ${formatDate(primary.issue_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        </p>

        {/* Certificate number */}
        {primary.certificate_number && (
          <p className="text-sm text-[var(--text-muted)]">
            {locale === 'fr' ? 'Certificat' : 'Certificate'} #{primary.certificate_number}
          </p>
        )}

        {/* Multiple holdings detail — per-holding Terminer button (#19d Phase 3
            locked decision: capture granularity is PER-HOLDING, not per-card). */}
        {shareholdings.length > 1 && (
          <div className="mt-1 space-y-1 rounded-md bg-[var(--card-bg)] px-3 py-2">
            {shareholdings.map((sh) => (
              <div key={sh.id} className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--text-muted)]">
                  {sh.quantity.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}{' '}
                  {sh.share_class.name}
                  {sh.certificate_number ? ` · #${sh.certificate_number}` : ''}
                  {' · '}
                  {formatDate(sh.issue_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  {renderIssuanceAffordance(sh)}
                  <button
                    type="button"
                    onClick={() => onEndShareholding(sh)}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--card-border)] hover:text-[var(--text-heading)]"
                    title={t('endShareholding')}
                  >
                    <LogOut className="h-3 w-3" />
                    {t('terminate')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Other roles ("Aussi") */}
        {otherRoles.length > 0 && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
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
          onClick={() => onEdit(primary)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--card-border)] hover:text-[var(--text-heading)]"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </button>
        {/* Single-holding case: bottom-bar Terminer targets the only holding.
            Multi-holding case shows Terminer on each detail row above instead,
            to enforce PER-HOLDING capture granularity. */}
        {shareholdings.length === 1 && (
          <button
            type="button"
            onClick={() => onEndShareholding(primary)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--card-border)] hover:text-[var(--text-heading)]"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t('terminate')}
          </button>
        )}
        {/* Single-holding case: issuance affordance sits alongside Terminer.
            Multi-holding case renders one per holding row above instead. */}
        {shareholdings.length === 1 && (
          <div className="flex items-center gap-3">
            {renderIssuanceAffordance(primary)}
          </div>
        )}
        <button
          type="button"
          disabled
          className="group/btn flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] opacity-60"
          title={locale === 'fr' ? 'Bientôt disponible' : 'Coming soon'}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {t('transfer')}
        </button>
      </div>
    </div>
  );
}

