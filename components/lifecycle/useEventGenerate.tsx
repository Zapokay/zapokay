'use client';

/**
 * A-1 — useEventGenerate: ONE source of truth for event-resolution generation.
 *
 * Mirrors the B-1 useRowUpload extraction. Owns the dialog's open state and the
 * i18n-DEPENDENT derivation that used to live inline in EventActRow.tsx:121-213
 * (personName, roleLabel, reasonLabel), so the Complétude row and the A3 board
 * (A-3) drive the SAME dialog from the same code. The i18n-free parts
 * (deriveDocKey, resolveEventDocTitle, isEventGenerateDisabled) are pure lib
 * helpers, NOT duplicated here.
 *
 * Two sources, mirroring UploadSource's requirement / requirementRef split:
 *  - act:      the caller already holds the EventActStatus (Complétude row).
 *  - eventRef: only the (event_type, event_id, event_phase) triple is known —
 *              the hook fetches the acts and finds it, then falls through to the
 *              IDENTICAL dialog path. Built now, first consumed in A-3 (board),
 *              exactly as requirementRef was built in B-1 and consumed in B-2.
 *
 * This hook does NOT wrap GenerateLifecycleResolutionDialog's behavior — the
 * dialog is unchanged and still owns the resolution-date field, the docKey
 * picker, and the POST to /api/minute-book/generate-lifecycle. The 7 direct
 * dialog callers (Directors/Officers/ShareholdersClient) render it from their
 * own table rows, not from an EventActStatus, and stay on the raw dialog.
 *
 * 'use client' REQUIRED — uses useState; tsc cannot catch a missing directive
 * (Lesson 28 / the 3a regression).
 */

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import GenerateLifecycleResolutionDialog from '@/components/lifecycle/GenerateLifecycleResolutionDialog';
import { isEventGenerateDisabled } from '@/lib/minute-book/event-act-helpers';
import type {
  EventActStatus,
  EventCompletenessResponse,
} from '@/lib/minute-book/event-completeness';
import { deriveDocKey, type DocKeyDerivation } from '@/lib/obligations/derive-dockey';

/**
 * Moved verbatim from EventActRow.tsx:63-68. Mirrors OfficersClient.tsx
 * TITLE_LABELS — kept local per the same Tier-3 extraction follow-up.
 * lib/i18n/lifecycle-labels.ts has a server-side equivalent but it THROWS on an
 * unknown title; this prefers a soft fallback (display the raw title) to
 * silently degrade rather than crash a render.
 */
const OFFICER_TITLE_LABELS: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};

/** The act identity triple — the board's only handle on an event (A-3). */
export interface EventLink {
  event_type: string;
  event_id: string;
  event_phase: string;
}

export type EventGenerateSource =
  | { kind: 'act'; act: EventActStatus }
  | { kind: 'eventRef'; eventLink: EventLink };

export interface EventGenerateRequest {
  source: EventGenerateSource;
  /** Fired after a successful generation — the caller owns refetch/refresh. */
  onSuccess: () => void;
}

export interface EventGenerateContext {
  companyId: string;
  locale: string;
  /** Document language for the generated resolution. Independent of UI locale
   *  per the Two-Layer Language Model (CLAUDE.md §3). */
  preferredLanguage: 'fr' | 'en';
  /**
   * OPTIONAL: only the eventRef branch can produce a user-facing error (the
   * fetch-miss). The act branch is synchronous and cannot fail, so the
   * Complétude row omits this. The board supplies it in A-3. A miss is ALWAYS
   * console.error'd regardless, so it is never silently swallowed.
   */
  addToast?: (message: string, tone: 'success' | 'error') => void;
}

/** Resolved, ready-to-render dialog inputs (post act→props derivation). */
interface ActiveGenerate {
  act: EventActStatus;
  derivation: DocKeyDerivation;
  personName: string;
  roleLabel: string;
  reasonLabel?: string;
  onSuccess: () => void;
}

export function useEventGenerate(ctx: EventGenerateContext): {
  openGenerate: (req: EventGenerateRequest) => Promise<void>;
  dialogElement: ReactNode;
} {
  const { companyId, locale, preferredLanguage, addToast } = ctx;
  // End-reason labels live under directors / officers (already shipped); the
  // namespace is picked by the act's event_type. `events` carries the
  // eventRef fetch-miss string.
  const tEvents = useTranslations('events');
  const tDirectors = useTranslations('directors');
  const tOfficers = useTranslations('officers');
  const [active, setActive] = useState<ActiveGenerate | null>(null);

  // EventActRow typed its `locale` prop 'fr' | 'en'; the ctx widens it to string
  // to match useRowUpload. Narrow once — for the only two values that ever
  // arrive this is identical to the original `locale === 'fr' ? …` tests.
  const uiLang: 'fr' | 'en' = locale === 'fr' ? 'fr' : 'en';

  // act → dialog inputs. Moved VERBATIM from EventActRow.tsx:121-198.
  // Returns null when the docKey can't be derived — the original guarded the
  // dialog render with `dialogOpen && derivation`, and openDialog was blocked by
  // generateDisabled (whose first term is !derivation), so this is equivalent.
  const resolveAct = useCallback(
    (act: EventActStatus): Omit<ActiveGenerate, 'onSuccess'> | null => {
      const derivation = deriveDocKey(act);
      if (!derivation) return null;

      const personName = act.personName ?? '—';

      // Role label resolution. Directors get the canonical role string; officers
      // resolve through OFFICER_TITLE_LABELS (custom titles use the user-authored
      // string verbatim, with a non-localized fallback when the custom value is
      // blank). For non-officer events the dialog still receives a sensible value.
      let roleLabel = '';
      if (act.event_type === 'director_mandate') {
        roleLabel = uiLang === 'fr' ? 'Administrateur' : 'Director';
      } else if (act.event_type === 'officer_appointment') {
        const title = act.officerTitle;
        if (title === 'custom') {
          roleLabel =
            act.officerCustomTitle && act.officerCustomTitle.trim().length > 0
              ? act.officerCustomTitle
              : uiLang === 'fr'
                ? 'Dirigeant·e'
                : 'Officer';
        } else if (title && OFFICER_TITLE_LABELS[title]) {
          roleLabel = OFFICER_TITLE_LABELS[title][uiLang];
        } else {
          roleLabel = title ?? (uiLang === 'fr' ? 'Dirigeant·e' : 'Officer');
        }
      } else if (act.event_type === 'shareholding') {
        roleLabel = uiLang === 'fr' ? 'Actionnaire' : 'Shareholder';
      }

      // reasonLabel: only meaningful for departure phases AND only when the doc
      // registry actually requires endReason (director_removal omits it — the act
      // of removal IS the reason).
      let reasonLabel: string | undefined;
      if (
        act.event_phase === 'departure' &&
        derivation.docKey !== 'director_removal' &&
        act.endReason
      ) {
        try {
          const ns = act.event_type === 'officer_appointment' ? tOfficers : tDirectors;
          reasonLabel = ns(`endReasons.${act.endReason}`);
        } catch {
          // Missing translation — let the server error surface rather than ship a
          // code identifier into the dialog readout.
          reasonLabel = undefined;
        }
      }

      return { act, derivation, personName, roleLabel, reasonLabel };
    },
    [uiLang, tDirectors, tOfficers],
  );

  const openGenerate = useCallback(
    async (req: EventGenerateRequest): Promise<void> => {
      const { source, onSuccess } = req;

      // 1. source → the act.
      let act: EventActStatus | undefined;
      if (source.kind === 'act') {
        act = source.act;
      } else {
        // A-3 (board): only the eventLink triple is known. Fetch the acts and
        // find it, then behave exactly like 'act'. Mirrors useRowUpload's
        // requirementRef branch (fetch → find → identical path).
        const { eventLink } = source;
        const res = await fetch('/api/minute-book/event-completeness', {
          cache: 'no-store',
        });
        const data: EventCompletenessResponse | null = res.ok ? await res.json() : null;
        act = data?.acts?.find(
          (a) =>
            a.event_type === eventLink.event_type &&
            a.event_id === eventLink.event_id &&
            a.event_phase === eventLink.event_phase,
        );
        if (!act) {
          // ALWAYS logged, toast or not — a miss must never be silently swallowed.
          console.error('[useEventGenerate] act not found for eventLink', eventLink);
          addToast?.(tEvents('actNotFound'), 'error');
          return;
        }
      }

      // 2. Data-integrity guard — the SAME pure helper the caller's button uses
      //    for its disabled attribute. Mirrors the original openDialog's
      //    `if (generateDisabled) return;` (a silent no-op: on the act path the
      //    button is already disabled, so this is unreachable belt-and-braces).
      if (isEventGenerateDisabled(act)) {
        console.warn(
          '[useEventGenerate] generate blocked by the data-integrity guard',
          { event_type: act.event_type, event_id: act.event_id, event_phase: act.event_phase },
        );
        return;
      }

      // 3. act → resolved dialog inputs.
      const resolved = resolveAct(act);
      if (!resolved) return; // unreachable: isEventGenerateDisabled covers !derivation
      setActive({ ...resolved, onSuccess });
    },
    [addToast, tEvents, resolveAct],
  );

  // null-unless-active: an idle hook renders zero dialog DOM. Matches the
  // original `{dialogOpen && derivation && <Dialog … />}` render at
  // EventActRow.tsx:338-356 — same props, no extraFacts (that prop is
  // ShareholdersClient's alone).
  const dialogElement = active ? (
    <GenerateLifecycleResolutionDialog
      companyId={companyId}
      docKey={active.derivation.docKey}
      instrument={active.derivation.instrument}
      docKeyOptions={active.derivation.options}
      eventId={active.act.event_id}
      personName={active.personName}
      roleLabel={active.roleLabel}
      eventDate={active.act.date}
      reasonLabel={active.reasonLabel}
      language={preferredLanguage}
      onClose={() => setActive(null)}
      onSuccess={() => {
        setActive(null);
        active.onSuccess();
      }}
    />
  ) : null;

  return { openGenerate, dialogElement };
}
