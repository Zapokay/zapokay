/**
 * #19d Brief 2a — Server-side lifecycle label helpers.
 *
 * Two pure functions used by the lifecycle-document orchestrator to resolve
 * localized values for resolution body tokens:
 *
 *   getEndReasonLabel(reason, locale, scope)
 *     - 'director' scope reads messages/{fr,en}.json → directors.endReasons.*
 *     - 'officer'  scope reads messages/{fr,en}.json → officers.endReasons.*
 *     - Scoping matters: FR director "Révocation" vs FR officer "Destitution".
 *
 *   getOfficerTitleLabel(title, customTitle, locale)
 *     - Canonical {fr,en} map for {president, vice_president, secretary, treasurer}.
 *     - When title === 'custom', returns customTitle verbatim (no localization).
 *
 * Tier-4 follow-up: 5 React components currently duplicate the officer-title
 * label map (OfficerCard.tsx:36, RemoveOfficerModal.tsx:26,
 * ReplaceOfficerModal.tsx:29, EditFormerOfficerModal.tsx:40,
 * OfficersClient.tsx:28). Migrate them to consume getOfficerTitleLabel and
 * move officer-title labels into messages/{fr,en}.json. Out of scope for
 * Brief 2a — title map intentionally lives only here for now.
 */

import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import type { ShareholderEntitySignatoryRole } from '@/lib/supabase/people-types';

export type LifecycleLocale = 'fr' | 'en';
export type EndReasonScope = 'director' | 'officer' | 'shareholder';

type EndReasonKey =
  | 'resignation'
  | 'revocation'
  | 'death'
  | 'disqualification'
  | 'term_expired'
  | 'redemption'
  | 'cancellation'
  | 'conversion'
  | 'transfer';

type OfficerTitleKey =
  | 'president'
  | 'vice_president'
  | 'secretary'
  | 'treasurer'
  | 'custom';

interface MessagesShape {
  directors?: { endReasons?: Partial<Record<EndReasonKey, string>> };
  officers?: { endReasons?: Partial<Record<EndReasonKey, string>> };
  shareholders?: { endReasons?: Partial<Record<EndReasonKey, string>> };
}

const MESSAGES: Record<LifecycleLocale, MessagesShape> = {
  fr: frMessages as unknown as MessagesShape,
  en: enMessages as unknown as MessagesShape,
};

/**
 * Resolve the localized end-reason label for a director or officer act.
 *
 * @throws if the locale or scope is invalid, or if the reason has no
 *         entry in messages JSON for the requested locale/scope. Loud
 *         failure preferred over silently emitting a code identifier
 *         into a legal document.
 */
export function getEndReasonLabel(
  reason: string,
  locale: LifecycleLocale,
  scope: EndReasonScope,
): string {
  if (locale !== 'fr' && locale !== 'en') {
    throw new Error(`getEndReasonLabel: invalid locale "${locale}"`);
  }
  if (scope !== 'director' && scope !== 'officer' && scope !== 'shareholder') {
    throw new Error(`getEndReasonLabel: invalid scope "${scope}"`);
  }
  const bag = MESSAGES[locale];
  const map =
    scope === 'director'
      ? bag.directors?.endReasons
      : scope === 'officer'
        ? bag.officers?.endReasons
        : bag.shareholders?.endReasons;
  const label = map?.[reason as EndReasonKey];
  if (!label || label.trim() === '') {
    throw new Error(
      `getEndReasonLabel: no label for reason="${reason}" scope="${scope}" locale="${locale}"`,
    );
  }
  return label;
}

/**
 * Localized director-role label for the resolution-shell signatory roster
 * (board-instrument resolutions only). Narrow 2-key helper; widened
 * getSignatoryRoleLabel deliberately deferred (YAGNI — shareholder branch
 * does not consume a roster title today).
 */
const DIRECTOR_ROLE_LABELS: Record<LifecycleLocale, string> = {
  fr: 'Administrateur',
  en: 'Director',
};

export function getDirectorRoleLabel(locale: LifecycleLocale): string {
  if (locale !== 'fr' && locale !== 'en') {
    throw new Error(`getDirectorRoleLabel: invalid locale "${locale}"`);
  }
  return DIRECTOR_ROLE_LABELS[locale];
}

/**
 * Canonical officer-title map. Single source of truth (server-side) until the
 * 5 React duplicates are migrated under the Tier-4 follow-up noted above.
 */
const OFFICER_TITLE_LABELS: Record<
  Exclude<OfficerTitleKey, 'custom'>,
  Record<LifecycleLocale, string>
> = {
  president:      { fr: 'Président',           en: 'President' },
  vice_president: { fr: 'Vice-président',      en: 'Vice-President' },
  secretary:      { fr: 'Secrétaire',          en: 'Secretary' },
  treasurer:      { fr: 'Trésorier',           en: 'Treasurer' },
};

/**
 * Resolve the localized officer title.
 *
 * When `title === 'custom'`, `customTitle` is returned verbatim (no
 * localization — the user authored it). When customTitle is missing for a
 * custom title, throws (caller must surface a config error rather than ship
 * a resolution with a blank office name).
 */
export function getOfficerTitleLabel(
  title: string,
  customTitle: string | null | undefined,
  locale: LifecycleLocale,
): string {
  if (locale !== 'fr' && locale !== 'en') {
    throw new Error(`getOfficerTitleLabel: invalid locale "${locale}"`);
  }
  if (title === 'custom') {
    if (!customTitle || customTitle.trim() === '') {
      throw new Error(
        'getOfficerTitleLabel: title="custom" but customTitle is empty',
      );
    }
    return customTitle;
  }
  const entry = OFFICER_TITLE_LABELS[title as Exclude<OfficerTitleKey, 'custom'>];
  if (!entry) {
    throw new Error(`getOfficerTitleLabel: unknown title "${title}"`);
  }
  return entry[locale];
}

/**
 * Signatory-role labels for entity signatories (Atom 3 Slice 2b-ii). Reuses the
 * canonical OFFICER_TITLE_LABELS for the 4 overlapping roles (single source per
 * §8.48 — reference, not copy) + 'trustee'. 'custom' is modal chrome: its select
 * option label + the free-text custom_role are i18n / user content, not this map.
 */
const SIGNATORY_ROLE_LABELS: Record<
  Exclude<ShareholderEntitySignatoryRole, 'custom'>,
  Record<LifecycleLocale, string>
> = {
  trustee:        { fr: 'Fiduciaire', en: 'Trustee' },
  president:      OFFICER_TITLE_LABELS.president,
  vice_president: OFFICER_TITLE_LABELS.vice_president,
  secretary:      OFFICER_TITLE_LABELS.secretary,
  treasurer:      OFFICER_TITLE_LABELS.treasurer,
};

export function getSignatoryRoleLabel(
  role: Exclude<ShareholderEntitySignatoryRole, 'custom'>,
  locale: LifecycleLocale,
): string {
  return SIGNATORY_ROLE_LABELS[role][locale];
}
