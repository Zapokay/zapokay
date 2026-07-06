/**
 * Lifecycle docKey derivation — extracted verbatim from EventActRow.tsx so both
 * the Complétude UI (the ObligationMarker row) and the A3 REQ feeder wiring
 * derive the same docKey from an EventActStatus. Pure function, NO behavior
 * change from the original inline version (EventActRow imports it back).
 */

import type { EventActStatus } from '@/lib/minute-book/event-completeness';

export interface DocKeyDerivation {
  docKey:
    | 'director_appointment'
    | 'director_appointment_vacancy'
    | 'director_departure'
    | 'director_removal'
    | 'officer_appointment'
    | 'officer_departure'
    | 'share_issuance'
    | 'share_cessation'
    | 'share_transfer';
  instrument: 'board' | 'shareholder';
  /** Optional generate-time docKey choices passed to the dialog picker. Present
   *  only for the director appointment case (election vs board vacancy fill); the
   *  row's display docKey above stays the default ('director_appointment'). */
  options?: Array<{
    value: string;
    labelFr: string;
    labelEn: string;
    hintFr: string;
    hintEn: string;
    docKey: DocKeyDerivation['docKey'];
    instrument: 'board' | 'shareholder';
  }>;
}

export function deriveDocKey(act: EventActStatus): DocKeyDerivation | null {
  if (act.event_type === 'director_mandate') {
    if (act.event_phase === 'appointment') {
      return {
        docKey: 'director_appointment',
        instrument: 'shareholder',
        options: [
          {
            value: 'election',
            docKey: 'director_appointment',
            instrument: 'shareholder',
            labelFr: 'Élu par les actionnaires',
            labelEn: 'Elected by the shareholders',
            hintFr: 'Cas habituel — les actionnaires ont élu cet administrateur (assemblée ou élection annuelle).',
            hintEn: 'The usual case — the shareholders elected this director (at a meeting or annual election).',
          },
          {
            value: 'vacancy',
            docKey: 'director_appointment_vacancy',
            instrument: 'board',
            labelFr: 'Nommé par le conseil (vacance)',
            labelEn: 'Appointed by the board (vacancy)',
            hintFr: 'Un administrateur a quitté en cours de mandat et le conseil a nommé un remplaçant pour combler la vacance.',
            hintEn: 'A director left mid-term and the board appointed a replacement to fill the vacancy.',
          },
        ],
      };
    }
    if (act.event_phase === 'departure') {
      return act.endReason === 'revocation'
        ? { docKey: 'director_removal', instrument: 'shareholder' }
        : { docKey: 'director_departure', instrument: 'board' };
    }
  }
  if (act.event_type === 'officer_appointment') {
    if (act.event_phase === 'appointment') {
      return { docKey: 'officer_appointment', instrument: 'board' };
    }
    if (act.event_phase === 'departure') {
      return { docKey: 'officer_departure', instrument: 'board' };
    }
  }
  if (act.event_type === 'shareholding') {
    if (act.event_phase === 'issuance') {
      return { docKey: 'share_issuance', instrument: 'board' };
    }
    if (act.event_phase === 'cessation') {
      return { docKey: 'share_cessation', instrument: 'board' };
    }
  }
  if (act.event_type === 'share_transfer' && act.event_phase === 'transfer') {
    return { docKey: 'share_transfer', instrument: 'board' };
  }
  return null;
}
