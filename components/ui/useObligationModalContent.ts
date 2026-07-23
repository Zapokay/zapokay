'use client';

import { useTranslations } from 'next-intl';
import type { ObligationModalProps } from './ObligationModal';

/** Content half of ObligationModal's props — everything except the caller-owned
 *  open/onClose (which each surface manages as its own per-row state). */
export type ObligationModalContent = Omit<ObligationModalProps, 'open' | 'onClose'>;

/**
 * ONE source of truth for the REQ obligation info-modal content. The modal body is
 * a FIXED REQ template (all obligationNotice.* strings) parameterized only by the
 * row's subtitle (the act / obligation label) and its already-formatted deadline.
 * Extracted verbatim from EventActRow's inline assembly so EventActRow (Complétude)
 * and the A3 board render IDENTICAL content.
 *
 * A hook (not a pure fn) because it reads translations at call time — passing a
 * strongly-typed next-intl `t` into a pure param fails on key contravariance.
 */
export function useObligationModalContent(): (args: {
  subtitle: string;
  deadline: string;
  /** Per-obligation body/legalRef (e.g. the merged REQ annual update: art. 45,
   *  FY-end + 6mo). When absent/null, fall back to the fixed art. 41 / 30-day
   *  roster-filing copy — so existing event rows (Complétude) are byte-identical. */
  body?: string | null;
  legalRef?: string | null;
}) => ObligationModalContent {
  const tObl = useTranslations('obligationNotice');
  return ({ subtitle, deadline, body, legalRef }) => ({
    title: tObl('req.title'),
    subtitle,
    deadlineLabel: tObl('modal.deadlineLabel'),
    deadline,
    body: body ?? tObl('req.body', { deadline }),
    legalRef: legalRef ?? tObl('modal.legalRef'),
    howToLabel: tObl('modal.howToLabel'),
    comingSoonTitle: tObl('help.comingSoonTitle'),
    comingSoonBadge: tObl('help.comingSoonBadge'),
    comingSoonBody: tObl('help.comingSoon'),
    ackLabel: tObl('footerAck'),
  });
}
