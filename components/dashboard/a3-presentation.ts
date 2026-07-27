/**
 * A3 board — presentation lookups (pure; no i18n VALUES, keys only; no engine
 * coupling). Design: docs/design/zapokay_a3_board.html (Aria v2.5), handoff §1–§11.
 *
 * TWO INDEPENDENT axes, never a combined switch (handoff §3):
 *   - verb VISUAL   ← exposure   (VERB_TREATMENT)
 *   - verb LABEL    ← actionKind (VERB_LABEL)
 * `tone` values are semantic slugs; the components map them to Tailwind clusters
 * consuming the --st-* / --lv-* / --act-gov-* tokens added to app/globals.css.
 *
 * Icons are lucide-react (house idiom). Five picks are closest-twins flagged for
 * Aria's eyeball at Dom's camera gate: to_finalize→Contrast, remediate→Meh,
 * consult→HelpCircle, file_externally→Landmark, and upload→Upload (Aria drew a
 * down-arrow-to-line; lucide Upload is an up-arrow — direction differs, build
 * with Upload for now, Aria confirms or swaps at the gate).
 */

import {
  CirclePlus,
  Contrast,
  Clock,
  RotateCcw,
  Meh,
  HelpCircle,
  Check,
  Landmark,
  Info,
  Link2,
  SquareArrowOutUpRight,
  Calendar,
  Layers,
  List,
  ArrowRight,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type {
  Obligation,
  ObligationStatus,
  ObligationLiveness,
  ObligationAction,
  ExposureClass,
} from '@/lib/obligations/obligation';

export interface ChipSpec {
  tone: string;
  Icon: LucideIcon;
  labelKey: string;
}

// 2a — STATUS → chip. `satisfied` never reaches the board (ranker drops it).
// `as const satisfies` rather than a `Record<…>` ANNOTATION: the annotation widened
// every labelKey to `string`, erasing the i18n literal before it reached `t(...)`.
// ChipSpec still enforces the shape; the literals now survive. Key set is unchanged,
// so A3Item's narrowed `STATUS_CHIP[o.status]` index still resolves.
export const STATUS_CHIP = {
  open:        { tone: 'open',  Icon: CirclePlus, labelKey: 'status.open' },
  to_finalize: { tone: 'final', Icon: Contrast,   labelKey: 'status.to_finalize' },
  due_soon:    { tone: 'soon',  Icon: Clock,      labelKey: 'status.due_soon' },
  overdue:     { tone: 'over',  Icon: Clock,      labelKey: 'status.overdue' },
} as const satisfies Record<Exclude<ObligationStatus, 'satisfied'>, ChipSpec>;

// 2b — LIVENESS tier badge. `live` carries NO badge (absence = live, the default).
// `as const satisfies` — same reason as STATUS_CHIP above.
export const TIER_BADGE = {
  regularize: { tone: 'regularize', Icon: RotateCcw, labelKey: 'tier.regularize' },
  remediate:  { tone: 'remediate',  Icon: Meh,       labelKey: 'tier.remediate' },
} as const satisfies Record<Exclude<ObligationLiveness, 'live'>, ChipSpec>;

// 2c — verb VISUAL keyed on EXPOSURE only.
export const VERB_TREATMENT: Record<ExposureClass, 'gov' | 'internal'> = {
  external: 'gov',
  internal: 'internal',
};

// 2d — verb LABEL keyed on ACTIONKIND only (a SEPARATE lookup from 2c).
// `review` / `none` have no emitter today → absent (A3Item warns if encountered).
export interface VerbSpec {
  Icon: LucideIcon;
  labelKey: string;
}
// TOTAL record with explicit `undefined`s, not `Partial<Record<…>>`. A3Item indexes
// this with the FULL ObligationAction union (`VERB_LABEL[o.actionKind]`, twice), so a
// 2-key `as const` object would fail that index — the record has to name every action.
// The explicit absences are also what the prose below used to say implicitly.
// Both call sites keep their existing `if (!verb)` / `fileVerb?.` guards unchanged.
export const VERB_LABEL = {
  finalize:        { Icon: Check,    labelKey: 'verb.finalize' },
  file_externally: { Icon: Landmark, labelKey: 'verb.file_externally' }, // Harvey-pending copy
  // Retired in B-2: completeness rows render Complétude's own buttons
  // (requirementRow.uploadButton + GenerateDocumentButton default), so the board's
  // verb.upload / verb.generate labels are never used.
  upload:    undefined,
  generate:  undefined,
  // No emitter today — no feeder produces these actionKinds. A3Item warns if one
  // ever appears (see the console.warn in its else-branch).
  review:    undefined,
  none:      undefined,
} as const satisfies Record<ObligationAction, VerbSpec | undefined>;

// remediate OVERRIDES the verb — a 3rd action-STATE (quiet consult affordance),
// NOT a 5th verb in the external/internal enum (handoff §11).
export const CONSULT = {
  tone: 'consult',
  Icon: HelpCircle,
  labelKey: 'verb.consult',
} as const;

// REQ (req_filing) rows carry null titles + a docKey → resolve the label from
// i18n keyed on docKey (Step 3). 5 keys reach a row today; director_appointment_
// vacancy is options-only (inert), mapped for completeness/future-proofing.
// `as const satisfies` rather than a `Record<string, string>` ANNOTATION: the
// annotation widened the VALUES to `string`, so the i18n literals were erased before
// resolveTitle could pass them to `t`. Record<string,string> still enforces the shape.
export const DOCKEY_LABEL_KEY = {
  director_appointment:         'docKey.director_appointment',
  director_appointment_vacancy: 'docKey.director_appointment_vacancy', // inert today
  director_departure:           'docKey.director_departure',
  director_removal:             'docKey.director_removal',
  officer_appointment:          'docKey.officer_appointment',
  officer_departure:            'docKey.officer_departure',
} as const satisfies Record<string, string>;

/** The i18n keys DOCKEY_LABEL_KEY can yield — derived, so it cannot drift from the map. */
export type DocKeyLabelKey = (typeof DOCKEY_LABEL_KEY)[keyof typeof DOCKEY_LABEL_KEY];

/** Type predicate — an `as const` map has no string index signature, so a raw docKey
 *  must be proven to be one of its keys before indexing. No cast required. */
function isDocKey(key: string): key is keyof typeof DOCKEY_LABEL_KEY {
  return key in DOCKEY_LABEL_KEY;
}

// Shared non-axis icons (board chrome + item furniture).
export const ICONS = {
  depDimmed: Link2,
  depLit: SquareArrowOutUpRight,
  due: Calendar,
  foundation: Layers,
  showMore: List,
  arrow: ArrowRight,
  heroBadge: Zap,
  guide: Info,
} as const;

/**
 * Step 3 — title resolution. completeness + deadline rows ship ready localized
 * strings (locale-pick with the other as fallback); req_filing rows ship null
 * titles + a docKey → resolve from i18n. Never renders the raw "[REQ:…]"
 * placeholder for a mapped docKey. `t` is scoped to the `dashboard.a3Board`
 * namespace, so DOCKEY_LABEL_KEY values are relative keys.
 */
export function resolveTitle(
  o: Pick<Obligation, 'titleFr' | 'titleEn' | 'docKey'>,
  locale: string,
  // Typed to the DERIVED key union, not `string`: a `(key: string) => string` parameter
  // is contravariant with next-intl's `t`, whose own parameter is the narrow MessageKeys
  // union — so passing the real `t` in fails once typed messages are declared.
  t: (key: DocKeyLabelKey) => string,
): string {
  const ready = locale === 'en' ? (o.titleEn ?? o.titleFr) : (o.titleFr ?? o.titleEn);
  if (ready) return ready;
  // Narrow into a const before indexing: DOCKEY_LABEL_KEY is `as const`, so it has no
  // string index signature — and a predicate narrows the EXPRESSION it was handed, so
  // `o.docKey` must be captured first rather than re-read in the branch.
  const docKey = o.docKey;
  if (docKey !== null && isDocKey(docKey)) return t(DOCKEY_LABEL_KEY[docKey]);
  return o.docKey ? `[REQ:${o.docKey}]` : ''; // last-resort; should not occur in v1
}
