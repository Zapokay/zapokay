/**
 * B-2 — the shared filing write. ONE implementation for both surfaces (the A3
 * board + Complétude), so the insert lives in one place (fix-once).
 *
 * Records that the government (REQ) filing for a roster act has been produced:
 * inserts one event_filings row keyed by the act triple. filed_at defaults NOW();
 * RLS gates the write by company_id -> companies.user_id = auth.uid() (this is
 * the first real browser-client write to event_filings). Mirrors AddDirectorModal:
 * throws on error so the caller can catch and surface an INLINE error string
 * (this repo shows modal errors inline, not as toasts); the caller owns the
 * refresh (board = router.refresh(); Complétude = the onGenerated refetch).
 *
 * No React state → a plain async function, not a hook. Uses the BROWSER client.
 */

import { createClient } from '@/lib/supabase/client';

export interface FileObligationInput {
  companyId: string;
  eventLink: { event_type: string; event_id: string; event_phase: string };
}

export async function fileObligation({ companyId, eventLink }: FileObligationInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('event_filings').insert({
    company_id: companyId,
    event_type: eventLink.event_type,
    event_id: eventLink.event_id,
    event_phase: eventLink.event_phase,
  });
  if (error) throw new Error(error.message);
}
