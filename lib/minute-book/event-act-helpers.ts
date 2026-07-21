/**
 * A-1 — Pure, i18n-free helpers over an EventActStatus.
 *
 * Extracted VERBATIM from EventActRow.tsx: the document-title block (:142-154)
 * and the generate data-integrity guard (:204-208). Both reproduce the original
 * expressions exactly — this is a move, not a rewrite. Extracted so ONE
 * implementation serves the Complétude row, the shared useEventGenerate hook,
 * and the A3 board (A-3), which needs both independently: the title to drive
 * useRowUpload's `event` source, the guard to drive its Générer button's
 * disabled state.
 *
 * i18n-FREE BY DESIGN. The roleLabel / reasonLabel derivations that need
 * useTranslations namespaces stay in the hook (they cannot live in a lib).
 * These two are safe to call from a lib, a server component, or a feeder.
 *
 * deriveDocKey is NOT duplicated here — it is already shared
 * (lib/obligations/derive-dockey.ts) and is reused by both helpers.
 */

import type { EventActStatus } from './event-completeness';
import { deriveDocKey } from '@/lib/obligations/derive-dockey';
import { LIFECYCLE_TEMPLATES } from '@/lib/pdf/lifecycle-templates';

/**
 * The act's document title — the canonical legal title from the template
 * registry, falling back to the engine's own category label when the act's
 * docKey can't be derived or the registry entry is missing (so a row never
 * renders empty).
 *
 * #156 — follows the DOCUMENT's language (`documents.language`) when a doc
 * exists, else the user's preferred_language; NEVER the UI locale (which stays
 * for chrome only).
 */
export function resolveEventDocTitle(
  act: EventActStatus,
  preferredLanguage: 'fr' | 'en',
): string {
  const titleLang = act.documentLanguage ?? preferredLanguage;
  const derivation = deriveDocKey(act);
  const registryTitle = derivation
    ? titleLang === 'en'
      ? LIFECYCLE_TEMPLATES[derivation.docKey]?.titleEn
      : LIFECYCLE_TEMPLATES[derivation.docKey]?.titleFr
    : undefined;
  return registryTitle ?? (titleLang === 'en' ? act.label_en : act.label_fr);
}

/**
 * True when Générer must be blocked. Surfaces the data-integrity gap up-front
 * instead of letting the user hit a 400 from the orchestrator: getEndReasonLabel
 * and the server-side orchestrator both THROW when end_reason is missing for a
 * docKey whose requiredVars include 'endReason' (director_departure +
 * officer_departure). director_removal is exempt — the act of removal IS the
 * reason.
 */
export function isEventGenerateDisabled(act: EventActStatus): boolean {
  const derivation = deriveDocKey(act);
  return (
    !derivation ||
    (act.event_phase === 'departure' &&
      derivation.docKey !== 'director_removal' &&
      !act.endReason)
  );
}
