'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import UploadDocumentModal from '@/components/documents/UploadDocumentModal';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';
import { resolveEventDocTitle } from '@/lib/minute-book/event-act-helpers';
import { parseLocalDate } from '@/lib/utils';

// Matches CompletenessPage's cap + UploadZone's cap.
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * The three prefill sources a row upload can originate from:
 *  - requirement:    a Complétude document row — the ChecklistItem is in hand.
 *  - requirementRef: the A3 board (Phase B-2) — only requirementKey+year are known,
 *                    so the hook fetches the item on demand (GET completeness).
 *  - event:          a lifecycle event row — carries eventLink + the already-resolved
 *                    title (EventActRow's #156 registry derivation stays there; the
 *                    hook does NOT recompute it, so no drift and no signature churn).
 *  - eventRef:       the A3 board (A-3) — only the eventLink triple is known, so the
 *                    hook fetches the act on demand (GET event-completeness), resolves
 *                    the locked title via resolveEventDocTitle, then falls through to
 *                    the identical `event` active-state. Symmetric with requirementRef.
 */
export type UploadSource =
  | { kind: 'requirement'; item: ChecklistItem }
  | { kind: 'requirementRef'; requirementKey: string; year: number | null }
  | { kind: 'event'; act: EventActStatus; title: string; year: number | null }
  | { kind: 'eventRef'; eventLink: { event_type: string; event_id: string; event_phase: string } };

export interface UploadRequest {
  file: File;
  /** Fired by the modal's onUploadComplete — the caller owns toast + refetch. */
  onSuccess: () => void;
  source: UploadSource;
}

export interface RowUploadContext {
  companyId: string;
  framework: 'LSA' | 'CBCA';
  locale: string;
  preferredLanguage: 'fr' | 'en';
  addToast: (message: string, type: 'success' | 'error') => void;
}

// Resolved, ready-to-render modal inputs (post source→prefill mapping).
interface ActiveUpload {
  file: File;
  onSuccess: () => void;
  prefill: {
    requirementKey?: string | null;
    requirementYear?: number | null;
    docType?: string;
    docYear?: number | null;
    title?: string;
  };
  eventLink?: { event_type: string; event_id: string; event_phase: string };
  replaceDocumentId?: string;
}

/**
 * useRowUpload — ONE source of truth for row-driven document uploads: Complétude
 * document rows + lifecycle event rows today, the A3 board in Phase B-2. Owns
 * validation, the session gate, the source→prefill mapping, the on-demand item
 * fetch (board), and the UploadDocumentModal render. The caller supplies onSuccess
 * (its own toast + refetch); the hook is toast-agnostic beyond validation errors.
 *
 * 'use client' REQUIRED — uses useState; tsc cannot catch a missing directive
 * (Lesson 28 / the 3a regression).
 */
export function useRowUpload(ctx: RowUploadContext): {
  openUpload: (req: UploadRequest) => Promise<void>;
  modalElement: ReactNode;
} {
  const { companyId, framework, locale, preferredLanguage, addToast } = ctx;
  const fr = locale === 'fr';
  const tDocs = useTranslations('documents');
  const tMB = useTranslations('minuteBook');
  const tEvents = useTranslations('events');
  const [active, setActive] = useState<ActiveUpload | null>(null);

  // ChecklistItem → prefill + replace target. Title follows UI locale (matches the
  // current doc-row modal render); the modal owns the doc-language field separately.
  const resolveItem = useCallback(
    (item: ChecklistItem): Pick<ActiveUpload, 'prefill' | 'replaceDocumentId'> => {
      // The year does NOT belong in the document's NAME — it's captured in
      // document_year and rendered once, middot-separated, at each surface
      // (composeDisplayName). Baking "— {year}" here produced doubled/em-dash
      // years in the Vault + Binder; the stored title is now always the clean
      // localized requirement title.
      const title = fr ? item.title_fr : item.title_en;
      return {
        prefill: {
          requirementKey: item.requirement_key,
          requirementYear: item.year,
          docType: item.document_type,
          docYear: item.category === 'annual' ? item.year : null,
          title,
        },
        replaceDocumentId: item.satisfied ? (item.document_id ?? undefined) : undefined,
      };
    },
    [fr],
  );

  const openUpload = useCallback(
    async (req: UploadRequest): Promise<void> => {
      const { file, source, onSuccess } = req;

      // 1. Validation — identical to both current handlers.
      if (file.type !== 'application/pdf') {
        addToast(tDocs('onlyPdf'), 'error');
        return;
      }
      if (file.size > MAX_SIZE) {
        addToast(tDocs('tooLarge'), 'error');
        return;
      }

      // 2. Session gate — UX-only "Session expirée"; the route is the auth authority.
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addToast(tDocs('sessionExpired'), 'error');
        return;
      }

      // 3. source → resolved modal inputs.
      if (source.kind === 'requirement') {
        if (source.item.satisfied && !source.item.document_id) {
          console.warn(
            '[useRowUpload] Row marked satisfied but document_id is null; falling back to fresh upload.',
            { requirementKey: source.item.requirement_key, year: source.item.year },
          );
        }
        setActive({ file, onSuccess, ...resolveItem(source.item) });
      } else if (source.kind === 'requirementRef') {
        // A3 board (B-2): fetch the checklist, find the item, then behave like 'requirement'.
        const res = await fetch('/api/minute-book/completeness', { cache: 'no-store' });
        const data = res.ok ? await res.json() : null;
        const item: ChecklistItem | undefined = data?.checklist?.find(
          (i: ChecklistItem) =>
            i.requirement_key === source.requirementKey &&
            (i.year ?? null) === (source.year ?? null),
        );
        if (!item) {
          addToast(tMB('completeness.requirementNotFound'), 'error');
          return;
        }
        setActive({ file, onSuccess, ...resolveItem(item) });
      } else if (source.kind === 'eventRef') {
        // A3 board (A-3): only the eventLink triple is known — fetch the acts,
        // find it by the triple, derive the locked title, then behave like
        // 'event'. Mirrors requirementRef (fetch→find→same active-state) and
        // useEventGenerate's eventRef branch.
        const { eventLink } = source;
        const res = await fetch('/api/minute-book/event-completeness', { cache: 'no-store' });
        const data = res.ok ? await res.json() : null;
        const act: EventActStatus | undefined = data?.acts?.find(
          (a: EventActStatus) =>
            a.event_type === eventLink.event_type &&
            a.event_id === eventLink.event_id &&
            a.event_phase === eventLink.event_phase,
        );
        if (!act) {
          // ALWAYS logged — a miss must never be silently swallowed.
          console.error('[useRowUpload] act not found for eventLink', eventLink);
          addToast(tEvents('actNotFound'), 'error');
          return;
        }
        const title = resolveEventDocTitle(act, preferredLanguage);
        const year = parseLocalDate(act.date).getFullYear();
        setActive({
          file,
          onSuccess,
          prefill: { docType: 'resolution', docYear: year, title },
          eventLink: {
            event_type: act.event_type,
            event_id: act.event_id,
            event_phase: act.event_phase,
          },
          replaceDocumentId: act.satisfied && act.documentId ? act.documentId : undefined,
        });
      } else {
        // event — eventLink + locked 'resolution' type + the EventActRow-resolved title.
        const { act, title, year } = source;
        setActive({
          file,
          onSuccess,
          prefill: { docType: 'resolution', docYear: year, title },
          eventLink: {
            event_type: act.event_type,
            event_id: act.event_id,
            event_phase: act.event_phase,
          },
          replaceDocumentId: act.satisfied && act.documentId ? act.documentId : undefined,
        });
      }
    },
    [addToast, tDocs, tMB, tEvents, preferredLanguage, resolveItem],
  );

  // The modal fires onUploadComplete (→ caller's toast + refetch) then, ~600ms later,
  // onClose (→ reset). Mirrors the two current renders exactly.
  const modalElement = active ? (
    <UploadDocumentModal
      isOpen={true}
      file={active.file}
      mode="row"
      companyId={companyId}
      framework={framework}
      locale={locale}
      preferredLanguage={preferredLanguage}
      prefill={active.prefill}
      eventLink={active.eventLink}
      replaceDocumentId={active.replaceDocumentId}
      onClose={() => setActive(null)}
      onUploadComplete={() => active.onSuccess()}
      onError={(msg) => addToast(msg, 'error')}
    />
  ) : null;

  return { openUpload, modalElement };
}
