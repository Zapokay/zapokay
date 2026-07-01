// External-obligation notice contract. v1: QC REQ director/officer-change filing.
// A3-READY: today a static docKey->obligations map fills this; later the A3 obligation
// engine replaces the map as the source, same contract shape. Do NOT couple to A3.
// YELLOW: the REQ obligation WORDING is lawyer-pending (see obligationNotice.* i18n +
// PENDING LAWYER GREEN tripwire). The obligation FACTS (art. 41 LPLE, 30 days, both
// regimes) are Harvey-verified GREEN.

export interface ObligationNotice {
  obligationName: string;
  jurisdiction: string;
  deadlineDays: number;
  statutoryBasis: string;
  triggeredBy: string;
  helpKey?: string;
}

const REQ_QC: ObligationNotice = {
  obligationName: 'req',
  jurisdiction: 'QC',
  deadlineDays: 30,
  statutoryBasis: 'art. 41 LPLE (RLRQ, c. P-44.1)',
  triggeredBy: 'roster_change',
  helpKey: 'req',
};

export const OBLIGATIONS_BY_DOCKEY: Record<string, ObligationNotice[]> = {
  director_appointment: [REQ_QC],
  director_appointment_vacancy: [REQ_QC],
  director_departure: [REQ_QC],
  director_removal: [REQ_QC],
  officer_appointment: [REQ_QC],
  officer_departure: [REQ_QC],
};

type MaybeKey = string | null | undefined;

export function obligationsForDocKey(docKey: MaybeKey): ObligationNotice[] {
  if (!docKey) return [];
  const table = OBLIGATIONS_BY_DOCKEY;
  const found = table[docKey];
  return found ?? [];
}
