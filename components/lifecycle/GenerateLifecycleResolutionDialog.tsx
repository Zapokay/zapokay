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
  docKey:
    | 'director_appointment'
    | 'director_departure'
    | 'director_removal'
    | 'officer_appointment'
    | 'officer_departure';
  instrument: 'board' | 'shareholder';
  eventId: string;
  personName: string;
  /** Role/title label to show in the event-facts block (e.g. "Administrateur"
   *  or "Président"). Caller localizes. */
  roleLabel: string;
  /** ISO YYYY-MM-DD — the event's effective date (end_date for departures,
   *  appointment_date for appointments). Caller passes raw; dialog formats. */
  eventDate: string;
  /** Pre-localized end-reason label for departure docKeys; omit otherwise. */
  reasonLabel?: string;
  /** Document language — passed straight to the route. Independent of UI locale. */
  language: 'fr' | 'en';
  onClose: () => void;
  onSuccess: () => void;
}

export default function GenerateLifecycleResolutionDialog({
  companyId,
  docKey,
  instrument,
  eventId,
  personName,
  roleLabel,
  eventDate,
  reasonLabel,
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

  async function handleGenerate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/minute-book/generate-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          docKey,
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

  const body = instrument === 'board' ? t('bodyBoard') : t('bodyShareholder');
  const signedBy =
    instrument === 'board' ? t('signedByBoard') : t('signedByShareholders');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="flex items-center justify-between modal-header px-6 py-4">
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
                {docKey.startsWith('officer') ? t('roleOfficer') : t('roleDirector')}
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
          </div>

          {/* Signed-by label (role only — no name enumeration, per brief
              finding #5: keeps PATH-A simple for the shareholder-instrument
              removal case where active shareholders aren't loaded on the
              Administrateurs page). */}
          <div className="text-xs text-[var(--text-muted)]">{signedBy}</div>

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
        <div className="flex items-center justify-end gap-3 modal-footer px-6 py-4">
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
