/**
 * OBLIGATION INVARIANTS — three facts that must hold, checked by execution.
 *
 *   npm run check:obligations      (or: npx tsx scripts/check-obligations.ts)
 *
 * Exit 0 = all three hold. Exit 1 = one failed, naming WHICH, the EXPECTED value
 * and the ACTUAL one. An anonymous failure is not worth writing.
 *
 * ★ PURE. No database, no .env.local, no supabase client, nothing company-specific.
 * Every fact below is demonstrable on the registry and on exported pure functions,
 * so this file cannot fail because someone edited a fixture.
 *
 * ★★ THE RULE FOR WHAT BELONGS HERE — read before adding a fourth.
 * THIS FILE CONTAINS ONLY WHAT STAYS TRUE REGARDLESS OF DOM'S OPINION. If an
 * assertion would force a reader to ask "did we change our minds?" before knowing
 * whether a failure is serious, it does not belong. A test that freezes a pending
 * DECISION fails on the day the decision is taken, and it fails LOOKING LIKE A
 * REGRESSION — costing an investigation for nothing.
 *
 * A fourth candidate was considered and REJECTED on exactly that ground: the
 * board/Complétude divergence on foundational rows (9 of 9 on Wick — 4 by the floor
 * in requirement-completeness.ts, 5 by exempt_from_lateness). It is a real, open
 * defect, but it would hold here because a decision has NOT YET BEEN TAKEN, not
 * because it is true. It lives in ZK_Queue as an open subject with its measurement
 * and its method — a signpost, not an assertion.
 *
 * ★ WHY THESE THREE ARE WRITTEN DOWN AT ALL. Each was measured once by a throwaway
 * probe, and each probe was deleted. Nothing accumulated. These three guard
 * invariants that no other gate covers: tsc cannot see them (they are runtime
 * relationships, not types) and the byte-identity capture cannot see them (it
 * compares output, and all three are currently satisfied so the output looks fine).
 */

import {
  OBLIGATION_REGISTRY,
  OVERLAP_MERGE,
  type ObligationDueCtx,
} from '@/lib/obligations/obligation-registry';
import { mergeObligations } from '@/lib/obligations/aggregate';
import { computeLiveness } from '@/lib/obligations/liveness';
import { deadlineObligations } from '@/lib/obligations/feeders/deadlines';
import type { Obligation } from '@/lib/obligations/obligation';
import type { ChecklistItem } from '@/lib/minute-book/requirement-completeness';

let failures = 0;
const fail = (fact: string, what: string, expected: unknown, actual: unknown) => {
  failures++;
  console.error('✗ FAIL — ' + fact);
  console.error('    ' + what);
  console.error('    expected : ' + JSON.stringify(expected));
  console.error('    actual   : ' + JSON.stringify(actual));
};
const pass = (fact: string, detail: string) => console.log('✓ ' + fact + ' — ' + detail);

// ─────────────────────────────────────────────────────────────────────────────
// FACT 1 — CADENCE DETERMINES MODE, over the WHOLE registry.
//
// Every 'per-fiscal-year' rule returns null when the fiscal-year anchor is absent
// (= "emit nothing"); every other non-event cadence returns a date (= "emit
// anyway"). The generic loop in feeders/deadlines.ts relies on this WITHOUT ever
// branching on cadence — it just skips a null date.
//
// ⚠️ TRUE ON ONE per-fiscal-year RULE TODAY. That is precisely why it is written:
// a sample of one cannot distinguish construction from coincidence, and the loop's
// correctness depends on which it is. Iterating the whole registry means a rule
// added tomorrow is covered without touching this file.
// ─────────────────────────────────────────────────────────────────────────────
{
  const FACT = 'FACT 1 · cadence determines mode';
  const before = failures;
  const ctx: ObligationDueCtx = {
    // fyEnd DELIBERATELY ABSENT — the "no fiscal year has closed" case
    immatriculationDate: '2018-04-17',
    incorporationDate: '2018-04-17',
    today: new Date(2026, 6, 27),
  };
  let checked = 0;
  for (const rule of OBLIGATION_REGISTRY) {
    if (rule.cadence === 'event') continue; // feeder 2's territory, no date rule
    if (typeof rule.dueDate !== 'function') {
      fail(FACT, 'rule `' + rule.ruleKey + '` (cadence ' + rule.cadence + ') has no dueDate function', 'a function', typeof rule.dueDate);
      continue;
    }
    const skips = rule.dueDate(ctx) === null;
    const wantsSkip = rule.cadence === 'per-fiscal-year';
    if (skips !== wantsSkip) {
      fail(
        FACT,
        'rule `' + rule.ruleKey + '` (cadence ' + rule.cadence + ') with no fiscal-year anchor',
        wantsSkip ? 'null (skip)' : 'a Date (fire)',
        skips ? 'null (skip)' : 'a Date (fire)',
      );
    }
    checked++;
  }
  const pfy = OBLIGATION_REGISTRY.filter((r) => r.cadence === 'per-fiscal-year').length;
  if (checked === 0) fail(FACT, 'no participating rule was checked', '> 0', 0);
  // Only report a pass if nothing failed INSIDE this fact — the loop above can fail
  // per rule, and a ✓ printed beside a ✗ for the same fact is worse than no ✓.
  else if (failures === before) pass(FACT, checked + ' participating rules, of which ' + pfy + ' per-fiscal-year');
}

// ─────────────────────────────────────────────────────────────────────────────
// FACT 2 — A MERGED ROW TAKES ITS LIVENESS FROM THE TWIN (commit 76a6eca).
//
// mergeObligations takes the twin's clock; before 76a6eca it kept the completeness
// half's tier, so a row carried a REAL due date with a tier computed as though it
// had none. The two halves of computeLiveness measure different quantities —
// fiscal-year staleness vs days since the deadline.
//
// ★ THE INPUTS ARE CHOSEN SO THE TWO HALVES DISAGREE, and that is asserted FIRST.
// With agreeing inputs this test would pass even if `liveness: twin.liveness` were
// deleted — it would be measuring nothing.
// ─────────────────────────────────────────────────────────────────────────────
{
  const FACT = 'FACT 2 · merged row takes the twin liveness';
  const CLOCK = new Date(2026, 1, 15); // inside the divergence window for a 31-Dec year-end
  const YEAR = 2025;

  // Registry-driven: use whatever key OVERLAP_MERGE actually pairs today.
  const pair = Object.entries(OVERLAP_MERGE)[0];
  if (!pair) {
    fail(FACT, 'OVERLAP_MERGE is empty — nothing merges, so the invariant is unobservable', 'at least one pair', 0);
  } else {
    const [reqKey, ruleKey] = pair;

    const compLiveness = computeLiveness({ daysUntilDue: null, legalWindowDays: null, year: YEAR, today: CLOCK });
    const twinLiveness = computeLiveness({ daysUntilDue: 135, legalWindowDays: null, year: YEAR, today: CLOCK });

    if (compLiveness === twinLiveness) {
      fail(
        FACT,
        'PRECONDITION: the two halves must disagree or this test measures nothing',
        'two different tiers',
        compLiveness + ' === ' + twinLiveness,
      );
    } else {
      const base = {
        descriptionFr: null, descriptionEn: null, weight: 0, docKey: null,
        statutoryBasis: null, helpKey: null, fulfilled: false,
        titleFr: 'probe', titleEn: 'probe',
      };
      const completenessHalf: Obligation = {
        ...base,
        id: 'completeness:' + reqKey + ':' + YEAR,
        source: 'completeness',
        status: 'open', liveness: compLiveness, dueDate: null, triggeredBy: null,
        deadlineDays: null, daysUntilDue: null, year: YEAR,
        actionKind: 'upload', requirementKey: reqKey, exposure: 'internal',
      };
      const deadlineTwin: Obligation = {
        ...base,
        id: 'deadline:' + ruleKey + ':' + YEAR,
        source: 'deadline',
        status: 'open', liveness: twinLiveness, dueDate: '2026-06-30', triggeredBy: null,
        deadlineDays: null, daysUntilDue: 135, year: YEAR,
        actionKind: 'file_externally', requirementKey: null, exposure: 'external',
      };

      const merged = mergeObligations([completenessHalf], [deadlineTwin]);
      const row = merged.find((r) => r.id === completenessHalf.id);
      if (!row) {
        fail(FACT, 'the merged row disappeared — OVERLAP_MERGE did not pair the halves', completenessHalf.id, merged.map((r) => r.id));
      } else if (row.liveness !== twinLiveness) {
        fail(FACT, 'merged row liveness for `' + reqKey + '` at clock 2026-02-15 (due 2026-06-30, +135d)', twinLiveness + ' (the twin)', row.liveness);
      } else {
        pass(FACT, 'halves disagree (' + compLiveness + ' vs ' + twinLiveness + '); merged row carries ' + row.liveness);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACT 3 — suppressWhenSatisfied REPRODUCES THE TWO DELETED BOOLEANS.
//
// Tested through EMISSION, not by calling the helper: isPresumedDischarged is a
// local inside deadlineObligations. Emission is the behaviour that matters anyway.
//
// ★ WRITTEN NOW BECAUSE PHASE 4c DELETES THE ORIGINALS. After that, nothing can
// attest the equivalence — the thing being reproduced will be gone.
//
// ★ AND THE BOOLEANS ARE PASSED DELIBERATELY WRONG. hasLaterAnnualFiling and
// currentFedReturnFiled are set to values that CONTRADICT the checklist. If the
// loop still behaves correctly, it is reading the checklist through the rule's own
// suppressWhenSatisfied — which is the claim.
// ─────────────────────────────────────────────────────────────────────────────
{
  const FACT = 'FACT 3 · suppressWhenSatisfied reproduces the booleans';
  const CLOCK = new Date(2026, 6, 27);
  const INC = '2018-04-17';
  const INC_YEAR = 2018;

  const item = (key: string, year: number | null, satisfied: boolean): ChecklistItem => ({
    id: 'probe-' + key + '-' + year, requirement_key: key,
    category: year === null ? 'foundational' : 'annual',
    title_fr: 'probe', title_en: 'probe', description_fr: null, description_en: null,
    section: 'probe', sort_order: 1, can_generate: true, can_upload: true,
    year, satisfied, liveness: 'regularize',
    document_type: 'autre' as ChecklistItem['document_type'],
  });

  const emit = (checklist: ChecklistItem[]) =>
    deadlineObligations(
      {
        framework: 'CBCA', fyEndMonth: 12, fyEndDay: 31,
        incorporationDate: INC, immatriculationDate: INC,
        checklist, fiscalYears: [],
        // ⚠️ DELIBERATELY CONTRADICTING the checklist — see the note above.
        hasLaterAnnualFiling: true, currentFedReturnFiled: true,
        noPriorAnnualMeetingRecorded: false,
      },
      CLOCK,
    ).map((o) => o.id);

  // Find the rules by their DECLARED scope, so the test follows the registry.
  const afterInc = OBLIGATION_REGISTRY.find((r) => r.suppressWhenSatisfied?.yearScope === 'afterIncorporation');
  const attach = OBLIGATION_REGISTRY.find((r) => r.suppressWhenSatisfied?.yearScope === 'attachYear');

  if (!afterInc || !attach) {
    // String(undefined) rather than the raw value: JSON.stringify DROPS undefined
    // keys, so the missing one would vanish from the failure message entirely.
    fail(FACT, 'expected one rule declaring each yearScope', 'afterIncorporation + attachYear', {
      afterIncorporation: String(afterInc?.ruleKey), attachYear: String(attach?.ruleKey),
    });
  } else {
    const attachKey = attach.suppressWhenSatisfied?.requirementKeys?.[0] ?? attach.requirementKeys[0];
    const has = (ids: string[], rk: string) => ids.some((i) => i.startsWith('deadline:' + rk + ':'));

    // — 'afterIncorporation': any satisfied row for a year STRICTLY AFTER incorporation.
    const emptyIds = emit([]);
    const laterIds = emit([item('any_annual_key', INC_YEAR + 3, true)]);
    const sameYearIds = emit([item('any_annual_key', INC_YEAR, true)]); // NOT strictly after
    if (!has(emptyIds, afterInc.ruleKey)) fail(FACT, '`' + afterInc.ruleKey + '` with an EMPTY checklist', 'emitted', 'suppressed');
    else if (has(laterIds, afterInc.ruleKey)) fail(FACT, '`' + afterInc.ruleKey + '` with a satisfied row for year ' + (INC_YEAR + 3), 'suppressed', 'emitted');
    else if (!has(sameYearIds, afterInc.ruleKey)) fail(FACT, '`' + afterInc.ruleKey + '` with a satisfied row for the INCORPORATION year (strict > required)', 'emitted', 'suppressed');
    else pass(FACT + ' / afterIncorporation', '`' + afterInc.ruleKey + '` suppressed only by a year strictly after incorporation');

    // — 'attachYear': a satisfied row for the declared key at THIS row's attach year.
    const attachYear = 2025; // most recent closed FY for a 31-Dec year-end at 2026-07-27
    const atYearIds = emit([item(attachKey, attachYear, true)]);
    const otherYearIds = emit([item(attachKey, attachYear - 1, true)]);
    const unsatisfiedIds = emit([item(attachKey, attachYear, false)]);
    if (!has(emptyIds, attach.ruleKey)) fail(FACT, '`' + attach.ruleKey + '` with an EMPTY checklist', 'emitted', 'suppressed');
    else if (has(atYearIds, attach.ruleKey)) fail(FACT, '`' + attach.ruleKey + '` with `' + attachKey + '` satisfied at the attach year ' + attachYear, 'suppressed', 'emitted');
    else if (!has(otherYearIds, attach.ruleKey)) fail(FACT, '`' + attach.ruleKey + '` with `' + attachKey + '` satisfied at a DIFFERENT year', 'emitted', 'suppressed');
    else if (!has(unsatisfiedIds, attach.ruleKey)) fail(FACT, '`' + attach.ruleKey + '` with `' + attachKey + '` present but UNSATISFIED', 'emitted', 'suppressed');
    else pass(FACT + ' / attachYear', '`' + attach.ruleKey + '` suppressed only by `' + attachKey + '` satisfied at year ' + attachYear);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures > 0) {
  console.error(failures + ' failure(s).');
  process.exit(1);
}
console.log('all invariants hold.');
process.exit(0);
