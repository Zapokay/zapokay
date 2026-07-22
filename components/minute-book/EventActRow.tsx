'use client';

/**
 * #19d Brief 1 — Single act row inside an EventSection.
 *
 * Mirrors RequirementRow's visual grammar (state icon, label, right-side
 * affordances) but reads from an EventActStatus (the lifecycle engine's
 * shape) instead of a ChecklistItem. The three-state classification is
 * computed via the SAME getDocumentState helper so téléversé / généré /
 * missing icons and the "À signer" badge stay in lockstep with the
 * requirements rows.
 *
 * Affordance scope (Brief 1 generate + Brief 2 upload/replace):
 *   missing   → [Téléverser] + [Générer]
 *   généré    → [À signer badge] + [Voir le document] + [Téléverser] + [Régénérer]
 *   téléversé → [Voir le document] + [Remplacer]
 *
 * Téléverser uploads the user's OWN signed PDF and SUPERSEDES any existing
 * doc on the act (generated draft or prior upload) via replaceDocumentId —
 * exactly one event_documents link remains. No deriveDocKey on upload: no
 * template is rendered, only the act's (event_type, event_id, event_phase)
 * tuple is linked. The actual upload + link write live in the parent
 * (CompletenessPage.handleEventFileSelected → uploadDocument).
 *
 * docKey + instrument derivation mirrors DirectorsClient / OfficersClient /
 * ShareholdersClient:
 *   director_mandate    | departure with end_reason='revocation' → director_removal + shareholder
 *   director_mandate    | departure otherwise                    → director_departure + board
 *   director_mandate    | appointment                            → director_appointment + shareholder
 *   officer_appointment | departure                              → officer_departure + board
 *   officer_appointment | appointment                            → officer_appointment + board
 *   shareholding        | issuance                               → share_issuance + board
 *   shareholding        | cessation                              → share_cessation + board
 *   share_transfer      | transfer                               → share_transfer + board
 *
 * Defensive note on departure end_reason: getEndReasonLabel + the server-side
 * orchestrator THROW when end_reason is missing for docKeys whose
 * requiredVars includes 'endReason' (director_departure + officer_departure).
 * We mirror the upstream consumer pattern (DirectorsClient line 419-422):
 * pass reasonLabel only when end_reason is present; the orchestrator surfaces
 * a 400 if the data is incomplete, which is the same error path the user
 * would hit from the Administrateurs page.
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, Upload } from 'lucide-react';
import { useEventGenerate } from '@/components/lifecycle/useEventGenerate';
import { getDocumentState } from '@/lib/minute-book/state';
import {
  isEventGenerateDisabled,
  resolveEventDocTitle,
} from '@/lib/minute-book/event-act-helpers';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';
import { obligationsForDocKey } from '@/lib/obligations/req-obligations';
import { deriveDocKey, type DocKeyDerivation } from '@/lib/obligations/derive-dockey';
import { formatDate, addDays } from '@/lib/utils';
import { ObligationMarker } from '@/components/ui/ObligationMarker';
import { ObligationModal } from '@/components/ui/ObligationModal';
import { useObligationModalContent } from '@/components/ui/useObligationModalContent';

interface EventActRowProps {
  act: EventActStatus;
  companyId: string;
  locale: 'fr' | 'en';
  /** Document language for the generated resolution. Independent of UI locale
   *  per the Two-Layer Language Model (CLAUDE.md §3). */
  preferredLanguage: 'fr' | 'en';
  /** Called after a successful generation so the parent refetches the
   *  event-completeness payload and the row flips to "À signer". */
  onGenerated: () => void;
  /** Brief 2 — called when the user picks a signed PDF to upload/replace on
   *  this act. The parent (CompletenessPage) owns the upload + event_documents
   *  link write. `title` is the registry FR legal title the row already
   *  resolved (same source as the row name), used as the document title. */
  onEventFileSelected?: (file: File, act: EventActStatus, title: string) => Promise<void>;
}

export default function EventActRow({
  act,
  companyId,
  locale,
  preferredLanguage,
  onGenerated,
  onEventFileSelected,
}: EventActRowProps) {
  const tDocs = useTranslations('documents');
  const tEvents = useTranslations('events');
  // Reuse the existing requirement-row upload strings (Téléverser / Remplacer /
  // uploading) — Brief 2 adds no new upload copy.
  const tReq = useTranslations('requirementRow');
  const tObl = useTranslations('obligationNotice');
  const buildObligationContent = useObligationModalContent();

  // A-1 — the generate dialog, its open state, and the i18n-dependent
  // derivation it needs (personName / roleLabel / reasonLabel, incl. the
  // directors+officers endReasons namespaces) now live in the shared hook, so
  // the A3 board drives the SAME dialog from the same code. addToast is
  // omitted: only the hook's eventRef branch can surface a user-facing error,
  // and this row always passes the act it already holds.
  const { openGenerate, dialogElement } = useEventGenerate({
    companyId,
    locale,
    preferredLanguage,
  });

  const [obligationOpen, setObligationOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const state = getDocumentState({
    satisfied: act.satisfied,
    source: act.documentSource,
    is_finalized: act.documentIsFinalized,
  });
  const isSignedFinal = state === 'téléversé';
  const isUnsigned = state === 'généré';
  const isMissing = state === 'missing';

  const personName = act.personName ?? '—';
  const derivation = deriveDocKey(act);
  const reqObligations = obligationsForDocKey(derivation?.docKey);
  const reqDeadline =
    reqObligations.length > 0 && act.date
      ? formatDate(addDays(act.date, 30), locale)
      : null;

  // Row label uses the canonical FR resolution title from the template
  // registry (single source of truth — same string that the generated PDF
  // carries). Matches the page convention: legal document names are French
  // and not localized; only chrome (section titles, buttons, dividers) is
  // localized via i18n.
  //
  // Fallback path: an act whose docKey can't be derived (currently only
  // share* acts, which are filtered out upstream) or whose registry entry
  // somehow goes missing — fall back to the engine's localized category
  // label so the row never renders empty.
  // #156 — the title follows the document's language (`documents.language`)
  // when a doc exists, else the user's preferred_language; NEVER the UI locale
  // (which stays for chrome only). A-1 — the derivation itself (registry lookup,
  // #156 language rule, empty-row fallback) now lives in the shared pure helper,
  // so the row, the generate hook, and the A3 board all resolve ONE title.
  const docTitle = resolveEventDocTitle(act, preferredLanguage);
  const rowLabel = `${docTitle} — ${personName}`;

  // Brief 2 — user picked a signed PDF to upload/replace on this act. Reset the
  // input value so the SAME file can be re-picked after an error.
  async function handleEventFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !onEventFileSelected) return;
    setIsUploading(true);
    try {
      await onEventFileSelected(f, act, docTitle);
    } finally {
      setIsUploading(false);
    }
  }

  const uploadButtonClass =
    'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div>
    <div className="group flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--card-bg)] transition-colors">
      {/* Left side: state icon + label */}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {isMissing ? (
          <XCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
        ) : isSignedFinal ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 flex-shrink-0 text-amber-500"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
          </svg>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className={`text-sm truncate ${
              act.satisfied ? 'text-[var(--text-muted)]' : 'text-[var(--text-body)] font-medium'
            }`}
          >
            {rowLabel}
          </span>
          {reqObligations.length > 0 && reqDeadline && !act.filed && (
            <ObligationMarker
              label={tObl('marker.label')}
              deadline={reqDeadline}
              onClick={() => setObligationOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Right side: state-driven affordances */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {isUnsigned && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)]">
            {tDocs('toSignBadge')}
          </span>
        )}

        {act.satisfied && act.documentId && (
          <a
            href={`/api/documents/${act.documentId}/download?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors"
          >
            {tEvents('viewDocument')}
          </a>
        )}

        {/* Brief 2 — Téléverser (upload own signed PDF) on missing + draft rows.
            On a draft (généré) this SUPERSEDES the draft via the parent's
            replaceDocumentId. */}
        {(isMissing || isUnsigned) && onEventFileSelected && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={uploadButtonClass}
          >
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? tReq('uploadingButton') : tReq('uploadButton')}
          </button>
        )}

        {(isMissing || isUnsigned) && derivation && (
          <button
            type="button"
            onClick={() =>
              openGenerate({ source: { kind: 'act', act }, onSuccess: onGenerated })
            }
            disabled={isEventGenerateDisabled(act)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isUnsigned ? tEvents('regenerate') : tEvents('generate')}
          </button>
        )}

        {/* Brief 2 — Remplacer (replace the already-uploaded signed doc). */}
        {isSignedFinal && onEventFileSelected && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={uploadButtonClass}
          >
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? tReq('uploadingButton') : tReq('replace')}
          </button>
        )}

        {onEventFileSelected && (
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleEventFileChange}
            style={{ display: 'none' }}
          />
        )}
      </div>

      {dialogElement}
    </div>
      {obligationOpen && (
        <ObligationModal
          open={obligationOpen}
          onClose={() => setObligationOpen(false)}
          {...buildObligationContent({ subtitle: rowLabel, deadline: reqDeadline ?? '' })}
        />
      )}
    </div>
  );
}
