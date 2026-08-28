/**
 * #19d Brief 2b — Shared confirm dialog for lifecycle resolution generation.
 *
 * Used by DirectorsClient + OfficersClient former-section per-row affordances.
 * Mirrors the hand-rolled modal shell pattern used by EditFormerDirectorModal
 * et al (modal-surface / modal-header / modal-footer classes).
 *
 * Framing: present-day acknowledgment — "this resolution is adopted today by
 * the current board/shareholders to record a past event." NOT "match the
 * historical board."
 *
 * docKey is derived by the caller from the row's end_reason (revocation
 * routes to director_removal; everything else to *_departure). The dialog
 * receives `instrument` ('board' | 'shareholder') and `docKey` ready-to-post.
 *
 * Language: passed in as `language` (users.preferred_language) — independent
 * of the UI locale per the Two-Layer Language Model. UI labels in this
 * dialog follow the UI locale (via useTranslations), but the value sent
 * to the route as `language` is the document language.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, FileSignature, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export interface LifecycleDialogProps {
  companyId: string;
  /**
   * docKey is grouped by event family so adding a new family is a single-line
   * union extension. share family (issuance + cessation + transfer) all
   * present after the #19d Phase 3 close slice.
   */
  docKey:
    // director family
    | 'director_appointment'
    | 'director_appointment_vacancy'
    | 'director_departure'
    | 'director_removal'
    // officer family
    | 'officer_appointment'
    | 'officer_departure'
    // share family
    | 'share_issuance'
    | 'share_cessation'
    | 'share_transfer';
  instrument: 'board' | 'shareholder';
  /**
   * Optional generate-time docKey choices. When present (length > 0) the dialog
   * renders a radio picker and derives the effective docKey + instrument from the
   * SELECTED option (POSTing the chosen docKey). When ABSENT, the dialog uses the
   * single docKey/instrument props and behaves byte-identically — the existing
   * non-appointment render sites pass no options.
   */
  docKeyOptions?: Array<{
    value: string;
    labelFr: string;
    labelEn: string;
    hintFr: string;
    hintEn: string;
    docKey: LifecycleDialogProps['docKey'];
    instrument: 'board' | 'shareholder';
  }>;
  eventId: string;
  /**
   * Person/holder display label. For director_* and officer_* docKeys this is
   * the person's `full_name`. For share_* docKeys the caller passes the output
   * of `holderName(shareholding.holders)` (joint holders comma-separated,
   * entity holders by `legal_name`). The dialog itself is name-agnostic — it
   * just renders this string.
   */
  personName: string;
  /** Role/title label to show in the event-facts block (e.g. "Administrateur"
   *  or "Président" or "Actionnaire"). Caller localizes. */
  roleLabel: string;
  /** ISO YYYY-MM-DD — the event's effective date (end_date for departures /
   *  cessation, appointment_date for appointments). Caller passes raw;
   *  dialog formats. */
  eventDate: string;
  /** Pre-localized end-reason label for departure / cessation docKeys; omit otherwise. */
  reasonLabel?: string;
  /**
   * Optional additional pre-localized fact rows rendered in the event-facts
   * block after the reason row. The share_cessation case passes shares +
   * share class here. When undefined, the block renders exactly as before.
   */
  extraFacts?: Array<{ label: string; value: string }>;
  /** Document language — passed straight to the route. Independent of UI locale. */
  language: 'fr' | 'en';
  onClose: () => void;
  onSuccess: () => void;
}

export default function GenerateLifecycleResolutionDialog({
  companyId,
  docKey,
  instrument,
  docKeyOptions,
  eventId,
  personName,
  roleLabel,
  eventDate,
  reasonLabel,
  extraFacts,
  language,
  onClose,
  onSuccess,
}: LifecycleDialogProps) {
  const t = useTranslations('lifecycle');
  // UI-locale formatter for the event-facts date readout. Document content
  // is formatted in `language` by the server orchestrator — this is the
  // dialog's display only.
  const uiLocale = t('_locale') === 'fr' ? 'fr' : 'en';

  const today = new Date().toISOString().slice(0, 10);
  const [resolutionDate, setResolutionDate] = useState<string>(today);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Generate-time docKey choice. Defaults to the first option (election is listed
  // first). Empty / unused when no docKeyOptions are passed.
  const [selectedDocKeyValue, setSelectedDocKeyValue] = useState<string>(
    docKeyOptions?.[0]?.value ?? '',
  );

  // SINGLE SOURCE for docKey + instrument. With a picker present, both come from
  // the SELECTED option; otherwise they fall back to the single props — so with
  // no docKeyOptions every consumer (POST, body, signedBy, heading) reads exactly
  // the prop values and renders byte-identically to today.
  const selectedOption = docKeyOptions?.find((o) => o.value === selectedDocKeyValue);
  const effectiveDocKey = selectedOption?.docKey ?? docKey;
  const effectiveInstrument = selectedOption?.instrument ?? instrument;

  async function handleGenerate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/minute-book/generate-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          docKey: effectiveDocKey,
          eventId,
          resolutionDate,
          language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setError(data.error || t('errorGeneric'));
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch {
      setError(t('errorNetwork'));
      setSubmitting(false);
    }
  }

  const body = effectiveInstrument === 'board' ? t('bodyBoard') : t('bodyShareholder');
  const signedBy =
    effectiveInstrument === 'board' ? t('signedByBoard') : t('signedByShareholders');

  // Role-label heading derived from the docKey family prefix. Explicit mapping
  // (not docKey.startsWith('officer') ? ... : ...) so adding a future family
  // is a single new arm rather than re-debugging a ternary fall-through.
  const roleLabelHeading = effectiveDocKey.startsWith('officer')
    ? t('roleOfficer')
    : effectiveDocKey.startsWith('share')
      ? t('roleShareholder')
      : t('roleDirector');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-heading)]">
            <FileSignature className="h-5 w-5 text-[var(--text-muted)]" />
            {t('dialogTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-body)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Subtitle: person name */}
        <div className="px-6 pt-4">
          <p className="text-sm text-[var(--text-muted)]">{personName}</p>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Framing note */}
          <p className="text-sm text-[var(--text-body)]">{body}</p>

          {/* Event-facts block (read-only) */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
            <div className="flex justify-between gap-3 py-1">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {t('personLabel')}
              </span>
              <span className="text-right">{personName}</span>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {roleLabelHeading}
              </span>
              <span className="text-right">{roleLabel}</span>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {t('eventDateLabel')}
              </span>
              <span className="text-right">
                {formatDate(eventDate, uiLocale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
            {reasonLabel && (
              <div className="flex justify-between gap-3 py-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  {t('reasonLabel')}
                </span>
                <span className="text-right">{reasonLabel}</span>
              </div>
            )}
            {extraFacts?.map((fact) => (
              <div key={fact.label} className="flex justify-between gap-3 py-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  {fact.label}
                </span>
                <span className="text-right">{fact.value}</span>
              </div>
            ))}
          </div>

          {/* Signed-by label (role only — no name enumeration, per brief
              finding #5: keeps PATH-A simple for the shareholder-instrument
              removal case where active shareholders aren't loaded on the
              Administrateurs page). */}
          <div className="text-xs text-[var(--text-muted)]">{signedBy}</div>

          {/* Generate-time docKey picker — only when options are passed (e.g.
              director appointment: shareholder election vs board vacancy fill).
              Absent for all other callers → byte-identical render. */}
          {docKeyOptions && docKeyOptions.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {uiLocale === 'fr'
                  ? 'Comment cet administrateur a-t-il été nommé ?'
                  : 'How was this director appointed?'}
              </label>
              <div className="space-y-2">
                {docKeyOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm transition-colors hover:border-amber-400 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <input
                      type="radio"
                      name="docKeyChoice"
                      value={opt.value}
                      checked={selectedDocKeyValue === opt.value}
                      onChange={() => setSelectedDocKeyValue(opt.value)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {uiLocale === 'fr' ? opt.labelFr : opt.labelEn}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {uiLocale === 'fr' ? opt.hintFr : opt.hintEn}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Resolution date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('resolutionDateLabel')}
            </label>
            <input
              type="date"
              value={resolutionDate}
              onChange={(e) => setResolutionDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t('resolutionDateNote')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 modal-footer modal-surface px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)]"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={submitting || !resolutionDate}
            className="flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2 text-sm font-semibold text-[var(--cta-text)] shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? t('generating') : t('generate')}
          </button>
        </div>
      </div>
    </div>
  );
}
