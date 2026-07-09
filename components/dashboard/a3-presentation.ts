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
  Plus,
  Upload,
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
export const STATUS_CHIP: Record<Exclude<ObligationStatus, 'satisfied'>, ChipSpec> = {
  open:        { tone: 'open',  Icon: CirclePlus, labelKey: 'status.open' },
  to_finalize: { tone: 'final', Icon: Contrast,   labelKey: 'status.to_finalize' },
  due_soon:    { tone: 'soon',  Icon: Clock,      labelKey: 'status.due_soon' },
  overdue:     { tone: 'over',  Icon: Clock,      labelKey: 'status.overdue' },
};

// 2b — LIVENESS tier badge. `live` carries NO badge (absence = live, the default).
export const TIER_BADGE: Record<Exclude<ObligationLiveness, 'live'>, ChipSpec> = {
  regularize: { tone: 'regularize', Icon: RotateCcw, labelKey: 'tier.regularize' },
  remediate:  { tone: 'remediate',  Icon: Meh,       labelKey: 'tier.remediate' },
};

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
export const VERB_LABEL: Partial<Record<ObligationAction, VerbSpec>> = {
  generate:        { Icon: Plus,     labelKey: 'verb.generate' },
  upload:          { Icon: Upload,   labelKey: 'verb.upload' },
  finalize:        { Icon: Check,    labelKey: 'verb.finalize' },
  file_externally: { Icon: Landmark, labelKey: 'verb.file_externally' }, // Harvey-pending copy
};

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
export const DOCKEY_LABEL_KEY: Record<string, string> = {
  director_appointment:         'docKey.director_appointment',
  director_appointment_vacancy: 'docKey.director_appointment_vacancy', // inert today
  director_departure:           'docKey.director_departure',
  director_removal:             'docKey.director_removal',
  officer_appointment:          'docKey.officer_appointment',
  officer_departure:            'docKey.officer_departure',
};

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
  t: (key: string) => string,
): string {
  const ready = locale === 'en' ? (o.titleEn ?? o.titleFr) : (o.titleFr ?? o.titleEn);
  if (ready) return ready;
  if (o.docKey && DOCKEY_LABEL_KEY[o.docKey]) return t(DOCKEY_LABEL_KEY[o.docKey]);
  return o.docKey ? `[REQ:${o.docKey}]` : ''; // last-resort; should not occur in v1
}
