// External-obligation notice contract. v1: QC REQ director/officer-change filing.
// The docKey→obligation mapping and the obligation FACTS (art. 41 LPLE, 30 days,
// both regimes — Harvey-verified GREEN) now come from the FILING REGISTRY
// (filing-registry.ts, entry `qc_req_roster_update`) — this module is a thin VIEW
// that adapts a roster FilingRule into the ObligationNotice shape the event feeder
// and EventActRow already consume. Do NOT re-list docKeys or facts here.
// YELLOW: the REQ obligation WORDING is lawyer-pending (obligationNotice.* i18n +
// PENDING LAWYER GREEN tripwire).

import { FILING_REGISTRY, filingForDocKey, type FilingRule } from './filing-registry';

export interface ObligationNotice {
  obligationName: string;
  jurisdiction: string;
  deadlineDays: number;
  statutoryBasis: string;
  triggeredBy: string;
  helpKey?: string;
}

/**
 * Adapt a roster FilingRule into the ObligationNotice shape. `obligationName` and
 * `jurisdiction` are notice-shape identifiers (obligationName is consumed by
 * feeders/req.ts for the row id) — not filing-need data, so they stay here as the
 * roster REQ's fixed identity; the drift-prone facts come from the registry.
 */
function toNotice(rule: FilingRule): ObligationNotice {
  return {
    obligationName: 'req',
    jurisdiction: 'QC',
    deadlineDays: rule.deadlineDays ?? 0,
    statutoryBasis: rule.statutoryBasis,
    triggeredBy: rule.triggeredBy ?? '',
    helpKey: rule.helpKey ?? undefined,
  };
}

/**
 * Backward-compat view (docKey → notices), derived from the registry's roster
 * entries. Preserves the former literal map's shape for any direct reader.
 */
export const OBLIGATIONS_BY_DOCKEY: Record<string, ObligationNotice[]> = Object.fromEntries(
  FILING_REGISTRY.flatMap((r) => (r.docKeys ?? []).map((k) => [k, [toNotice(r)]] as const)),
);

type MaybeKey = string | null | undefined;

export function obligationsForDocKey(docKey: MaybeKey): ObligationNotice[] {
  if (!docKey) return [];
  const rule = filingForDocKey(docKey);
  return rule ? [toNotice(rule)] : [];
}
