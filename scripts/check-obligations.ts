/**
 * OBLIGATION INVARIANTS — four facts that must hold, checked by execution.
 *
 *   npm run check:obligations      (or: npx tsx scripts/check-obligations.ts)
 *
 * Exit 0 = all four hold. Exit 1 = one failed, naming WHICH, the EXPECTED value
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
 * A candidate was considered and REJECTED on exactly that ground: the
 * board/Complétude divergence on foundational rows (9 of 9 on Wick — 4 by the floor
 * in requirement-completeness.ts, 5 by exempt_from_lateness). It is a real, open
 * defect, but it would hold here because a decision has NOT YET BEEN TAKEN, not
 * because it is true. It lives in ZK_Queue as an open subject with its measurement
 * and its method — a signpost, not an assertion.
 *
 * ★ FACT 4 WAS ADMITTED UNDER THE SAME RULE, AND PASSES IT. "Two mechanisms cannot
 * both claim one requirement key" is not a position anyone can change their mind
 * about: a key that is discarded before the merge cannot also be merged. Dom can
 * reassign a cadence from one mechanism to the other and FACT 4 still holds — it
 * asserts the partition, never which side a given key falls on.
 *
 * ★ WHY THESE FOUR ARE WRITTEN DOWN AT ALL. Each was measured once by a throwaway
 * probe, and each probe was deleted. Nothing accumulated. These four guard
 * invariants that no other gate covers: tsc cannot see them (they are runtime
 * relationships, not types) and the byte-identity capture cannot see them (it
 * compares output, and all four are currently satisfied so the output looks fine).
 */

import {
  OBLIGATION_REGISTRY,
  OVERLAP_MERGE,
  isBoardSuppressedRequirementKey,
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
/**
 * A third state, between ✓ and ✗: the assertion could not run because it has no
 * SUBJECT. It does not touch `failures`, so the script still exits 0 — but it must never
 * read as a success. Every skip prints the word UNTESTED for that reason: a bare ⊘ looks
 * like a pass by the third run.
 */
let skipped = 0;
const skip = (fact: string, why: string) => {
  skipped++;
  console.log('⊘ ' + fact + ' — NO SUBJECT: ' + why + ' This path is UNTESTED.');
};

// ─────────────────────────────────────────────────────────────────────────────
// FACT 1 — A PER-FISCAL-YEAR RULE CANNOT FIRE WITHOUT A CLOSED FISCAL YEAR.
//
// ONE DIRECTION, over the whole registry: a 'per-fiscal-year' rule must return null when
// the fiscal-year anchor is absent. Nothing is asked of any other cadence.
//
// ★ IT USED TO ASK BOTH DIRECTIONS, and the second one — "every other non-event cadence
// returns a date" — WAS FALSE AND WAS REMOVED ON EVIDENCE (2026-08-12). The federal return
// legitimately stays silent in its incorporation year (Harvey), and half B failed that fix
// with the identical message it produced for a rule silenced by mutation: same fact, same
// wording, same exit code. A check that cannot separate a fix from a bug guards neither,
// and this one blocked the fix while claiming to protect it.
//
// ⚠️ TRUE ON ONE per-fiscal-year RULE TODAY, which is still why it is written: a sample of
// one cannot distinguish construction from coincidence. Iterating the whole registry means
// a rule added tomorrow is covered without touching this file.
//
// ★ WHAT REPLACED HALF B IS FACT 5, NOT NOTHING. Whether a rule SHOULD be silent is a
// question about the ROW SET a company gets, and FACT 5 asserts it directly on both sides
// of the first-year boundary. This fact keeps the half that is about cadence; that one
// takes the half that never was.
// ─────────────────────────────────────────────────────────────────────────────
{
  const FACT = 'FACT 1 · a per-fiscal-year rule cannot fire without a closed fiscal year';
  const before = failures;
  const ctx: ObligationDueCtx = {
    // fyEnd DELIBERATELY ABSENT — the "no fiscal year has closed" case
    immatriculationDate: '2018-04-17',
    incorporationDate: '2018-04-17',
    today: new Date(2026, 6, 27),
  };
  // TWO COUNTERS, AND THE SECOND IS THE ONE THAT MATTERS. `checked` counts rules whose
  // dueDate was callable; `asserted` counts rules this fact actually put a claim on. They
  // were the same number while the test ran in both directions. They are not any more, and
  // reporting the first as though it were the second would print a ✓ for a fact with no
  // subject — the exact shape the header of this file forbids.
  let checked = 0;
  let asserted = 0;
  for (const rule of OBLIGATION_REGISTRY) {
    if (rule.cadence === 'event') continue; // feeder 2's territory, no date rule
    if (typeof rule.dueDate !== 'function') {
      fail(FACT, 'rule `' + rule.ruleKey + '` (cadence ' + rule.cadence + ') has no dueDate function', 'a function', typeof rule.dueDate);
      continue;
    }
    const skips = rule.dueDate(ctx) === null;
    if (rule.cadence === 'per-fiscal-year') {
      asserted++;
      if (!skips) {
        fail(
          FACT,
          'rule `' + rule.ruleKey + '` (cadence per-fiscal-year) with no fiscal-year anchor',
          'null (skip)',
          'a Date (fire)',
        );
      }
    }
    checked++;
  }
  if (checked === 0) fail(FACT, 'no participating rule was checked', '> 0', 0);
  else if (asserted === 0)
    skip(FACT, 'the registry holds no per-fiscal-year rule, so this fact asserted nothing — ' +
      checked + ' non-event rule(s) were iterated and none was a subject.');
  // Only report a pass if nothing failed INSIDE this fact — the loop above can fail
  // per rule, and a ✓ printed beside a ✗ for the same fact is worse than no ✓.
  else if (failures === before)
    pass(FACT, asserted + ' per-fiscal-year rule(s) asserted, of ' + checked + ' participating');
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
// ★ WRITTEN BECAUSE PHASE 4c DELETES THE ORIGINALS. After that, nothing can
// attest the equivalence — the thing being reproduced will be gone.
//
// ★ AND THE BOOLEANS ARE PASSED DELIBERATELY WRONG. hasLaterAnnualFiling and
// currentFedReturnFiled are set to values that CONTRADICT the checklist. If the
// loop still behaves correctly, it is reading the checklist through the rule's own
// suppressWhenSatisfied — which is the claim.
//
// ═══ 2026-08-12 — THE 'afterIncorporation' LIMB LOST ITS SUBJECT ═════════════
// `qc_initial_declaration` went INERT (`frameworks: []`) because our legal counsel
// ruled the federal RE-200 obligation does not exist and the Quebec one cannot be
// scoped without data we do not hold. It was the ONLY rule declaring
// `yearScope: 'afterIncorporation'`, and it is no longer emitted for any framework —
// so there is nothing left to observe through emission.
//
// ⚠️ THE PATH IS NOW COMPLETELY UNTESTED. If someone breaks the 'afterIncorporation'
// branch of isPresumedDischarged, nothing here will say so. That is a REAL LOSS,
// accepted deliberately rather than papered over. The alternative was worse: see below.
//
// ★ THE PARAGRAPH ABOVE PREDICTED ITS OWN DEATH AND DID NOT SAY WHAT TO DO NEXT.
// "WRITTEN BECAUSE PHASE 4c DELETES THE ORIGINALS. After that, nothing can attest the
// equivalence." It expected to die when the deleted booleans were removed. It died a
// year early, through a different door — the rule went inert, not the booleans.
//
// ── TWO WAYS TO KEEP IT GREEN WERE CONSIDERED AND REJECTED ───────────────────
// (a) INSERT A FICTITIOUS RULE into OBLIGATION_REGISTRY for the duration of the test.
//     `deadlineObligations` takes no registry parameter — it iterates the module
//     constant — so this is the only way a fabricated rule could reach the emission
//     path. Rejected: the test would MUTATE THE ARTEFACT IT OBSERVES, and FACT 4
//     iterates that same array a few lines later. A try/finally would seal a hazard we
//     would have created ourselves.
// (b) LIFT isPresumedDischarged out of the closure and export it. Rejected: it captures
//     `checklist` AND `incYear` from deadlineObligations' scope, so exporting it changes
//     its position, its signature and its call site — and `incYear` would either travel
//     as a parameter or be re-derived, which is the two-implementations-of-one-derivation
//     defect corrected this same morning on the book-currency cap.
//
// ★ FABRICATING A SUBJECT SO A TEST STAYS GREEN IS THE TEST LYING. A skip that says
// UNTESTED is worth more than a pass that measures a fixture of our own making.
//
// ── HOW IT RELIGHTS ITSELF ───────────────────────────────────────────────────
// The subject is found DYNAMICALLY, by scope and by emittability — never by name. The
// day any rule declares `yearScope: 'afterIncorporation'` AND is emittable under this
// test's framework, the limb runs again with no edit here. First candidate:
// `qc_initial_declaration` reopened, which needs the REQ public record's FILING DATE to
// separate LSAQ voie 1 (nothing owed) from voie 2 (sixty days, art. 86).
//
// The 'attachYear' limb is UNAFFECTED — `fed_annual_return` still carries it and is
// still emitted.
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

  // Find the rules by their DECLARED scope, so the test follows the registry — and by
  // EMITTABILITY, so an inert rule is not mistaken for a live subject. The emittability
  // predicate mirrors feeders/deadlines.ts's frameworks gate against THIS test's
  // framework; it is declarative and does not depend on the mechanism under test, so it
  // cannot confuse "inert" with "broken".
  const emittable = (r: (typeof OBLIGATION_REGISTRY)[number]) =>
    !r.frameworks || r.frameworks.includes('CBCA');
  const afterInc = OBLIGATION_REGISTRY.find(
    (r) => r.suppressWhenSatisfied?.yearScope === 'afterIncorporation' && emittable(r),
  );
  const attach = OBLIGATION_REGISTRY.find(
    (r) => r.suppressWhenSatisfied?.yearScope === 'attachYear' && emittable(r),
  );

  if (!attach) {
    fail(FACT, 'expected one emittable rule declaring yearScope attachYear', 'a rule', 'none');
  } else {
    const attachKey = attach.suppressWhenSatisfied?.requirementKeys?.[0] ?? attach.requirementKeys[0];
    const has = (ids: string[], rk: string) => ids.some((i) => i.startsWith('deadline:' + rk + ':'));

    // — 'afterIncorporation': any satisfied row for a year STRICTLY AFTER incorporation.
    // `emptyIds` is computed unconditionally: the attachYear limb below needs it too.
    const emptyIds = emit([]);
    if (!afterInc) {
      skip(FACT + ' / afterIncorporation',
        "no EMITTABLE rule declares yearScope 'afterIncorporation' — qc_initial_declaration " +
        'still declares it but went inert on 2026-08-12 (frameworks: []), so nothing reaches ' +
        'the emission path. It relights by itself the day an emittable rule carries the scope.');
    } else {
      const laterIds = emit([item('any_annual_key', INC_YEAR + 3, true)]);
      const sameYearIds = emit([item('any_annual_key', INC_YEAR, true)]); // NOT strictly after
      if (!has(emptyIds, afterInc.ruleKey)) fail(FACT, '`' + afterInc.ruleKey + '` with an EMPTY checklist', 'emitted', 'suppressed');
      else if (has(laterIds, afterInc.ruleKey)) fail(FACT, '`' + afterInc.ruleKey + '` with a satisfied row for year ' + (INC_YEAR + 3), 'suppressed', 'emitted');
      else if (!has(sameYearIds, afterInc.ruleKey)) fail(FACT, '`' + afterInc.ruleKey + '` with a satisfied row for the INCORPORATION year (strict > required)', 'emitted', 'suppressed');
      else pass(FACT + ' / afterIncorporation', '`' + afterInc.ruleKey + '` suppressed only by a year strictly after incorporation');
    }

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
// FACT 4 — OVERLAP_MERGE AND _boardSuppressedKeys PARTITION THE CATALOG KEYS.
//
// Two mechanisms can retire a completeness half, and they are mutually exclusive:
//   MERGE      — OVERLAP_MERGE pairs the half with its deadline twin (aggregate.ts).
//   SUPPRESS   — isBoardSuppressedRequirementKey drops it before the merge ever runs
//                (feeders/completeness.ts:122).
// A key claimed by BOTH is incoherent: suppression happens first, so the merge entry
// would be dead code that reads as live policy. A key claimed by NEITHER is a
// completeness half with no owner — the 0-or-2 defect this pair exists to prevent.
//
// ★ WHY THIS IS WRITTEN, AND WHY THE OTHER THREE DID NOT COVER IT. The 'once' widening
// (OVERLAP_MERGE gaining the two initial-declaration keys) ran green against FACTS 1-3
// — and would have run green just as well if it had ALSO swept in 'anniversary', which
// must never be here. Measured: the three earlier facts read the REGISTRY, never the
// map, so none of them can see a mis-derived OVERLAP_MERGE. The only thing standing
// between the map and a wrong widening was a docblock, and prose is not a gate.
//
// ★ OPINION-INDEPENDENT, per the rule at the top of this file. It asserts the PARTITION,
// never which side a key falls on: reassign a cadence from one mechanism to the other
// and this still holds. It fails only on a key owned twice, or owned by no one.
// ─────────────────────────────────────────────────────────────────────────────
{
  const FACT = 'FACT 4 · merge and board-suppression partition the catalog keys';
  const before = failures;

  // Keep BOTH shapes: the array is what we iterate, the Set is what we probe. tsconfig
  // sets no `target`, so `for (const k of someSet)` demands --downlevelIteration and
  // fails tsc — the same trap recorded at active-years.ts:143. Iterate the array.
  const mergedKeys = Object.keys(OVERLAP_MERGE);
  const merged = new Set(mergedKeys);
  // Every requirement key the registry knows about. 'event' rules declare none (acts
  // instantiate them), so they contribute nothing and are covered by construction.
  const allKeys = OBLIGATION_REGISTRY.flatMap((r) => r.requirementKeys);

  if (allKeys.length === 0) {
    fail(FACT, 'the registry declares no requirementKeys at all', '> 0', 0);
  }

  for (const key of allKeys) {
    const isMerged = merged.has(key);
    const isSuppressed = isBoardSuppressedRequirementKey(key);
    if (isMerged && isSuppressed) {
      fail(
        FACT,
        '`' + key + '` is claimed by BOTH mechanisms — suppression runs first, so the ' +
          'OVERLAP_MERGE entry is dead code posing as policy',
        'exactly one of { merged, board-suppressed }',
        { merged: true, boardSuppressed: true },
      );
    } else if (!isMerged && !isSuppressed) {
      fail(
        FACT,
        '`' + key + '` is claimed by NEITHER mechanism — its completeness half has no ' +
          'owner, which is the 0-or-2 duplicate shape',
        'exactly one of { merged, board-suppressed }',
        { merged: false, boardSuppressed: false },
      );
    }
  }

  // A merge entry pointing at a key no registry rule declares would be unreachable.
  for (const key of mergedKeys) {
    if (!allKeys.includes(key)) {
      fail(FACT, 'OVERLAP_MERGE key `' + key + '` matches no registry requirementKey', 'a declared key', key);
    }
  }

  if (failures === before) {
    const suppressed = allKeys.filter((k) => isBoardSuppressedRequirementKey(k));
    pass(
      FACT,
      allKeys.length + ' catalog keys partitioned: ' + merged.size + ' merged, ' +
        suppressed.length + ' board-suppressed, 0 claimed twice, 0 unclaimed',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACT 5 — THE FIRST-YEAR BOUNDARY, ASSERTED AS A ROW SET RATHER THAN A CORRESPONDENCE.
//
// A company incorporated this calendar year owes no federal annual return (Harvey
// 2026-08-10, GREEN). The year after, it owes one. This asserts BOTH, on one synthetic
// company at two clocks, through `deadlineObligations` — the real emission path.
//
// ★ WHY IT EXISTS: IT IS THE ONLY GATE THAT SAW THE DEFECT. On 2026-08-12, with the
// incorporation-year fix removed, FACT 1 printed ✓ and FACT 3 printed ✓ while a company
// incorporated 2026-03-02 was shown a return "overdue by 102 days" at score 1.0000. Both
// facts ask questions this defect answers correctly; only a claim about the ROW SET
// catches it.
//
// ★ AND IT ESCAPES THE BLIND SPOT THAT LET THE DEFECT SHIP. Every other gate builds a
// MATURE company — FACT 1 and FACT 3 both use inc 2018-04-17 against a 2026 clock, so
// their subject has closed fiscal years and the boundary is never crossed. The subject
// here is a first-year company BY CONSTRUCTION: its clock is derived from its own
// incorporation year, so no future edit to a date literal can quietly age it out.
//
// ★ INVARIANT TO THE OPEN ITEM. `fed_annual_return.dueDate` compares CALENDAR YEARS where
// its clock is an ANNIVERSARY — known, deliberate, out of scope. This fact never reads
// that comparison: it asks which rows a company gets. Correcting the comparison to an
// anniversary basis leaves both limbs true, so this does not become a decision freezer —
// the rule the header of this file lays down.
//
// ⚠️ THE TWO LIMBS ARE NOT REDUNDANT AND NEITHER MAY BE DROPPED. Limb 1 alone would pass
// under a fix that silences the rule FOREVER; limb 2 alone would pass under no fix at all.
// [MEASURED 2026-08-12, both directions, by two opposite mutations.]
// ─────────────────────────────────────────────────────────────────────────────
{
  const FACT = 'FACT 5 · the first-year boundary';
  const before = failures;
  const RULE_KEY = 'fed_annual_return';
  const rule = OBLIGATION_REGISTRY.find((r) => r.ruleKey === RULE_KEY);

  // The subject is SYNTHESISED, not a fixture: one company, two clocks, everything else
  // held constant. An empty checklist keeps `suppressWhenSatisfied` out of the answer —
  // this fact is about the boundary, not about suppression (that is FACT 3's).
  const emitAt = (incorporationDate: string, today: Date): string[] =>
    deadlineObligations(
      {
        framework: 'CBCA',
        fyEndMonth: 12,
        fyEndDay: 31,
        incorporationDate,
        immatriculationDate: incorporationDate,
        checklist: [],
        fiscalYears: [],
        hasLaterAnnualFiling: false,
        currentFedReturnFiled: false,
        noPriorAnnualMeetingRecorded: true,
      },
      today,
    ).map((o: Obligation) => o.id);
  const hasRow = (ids: string[], rk: string): boolean =>
    ids.some((id: string) => id.startsWith('deadline:' + rk + ':'));

  if (!rule) {
    skip(FACT, 'no rule named `' + RULE_KEY + '` is in the registry, so there is no subject.');
  } else if (rule.frameworks && !rule.frameworks.includes('CBCA')) {
    // Emittability, checked declaratively — an inert rule must not be read as a broken one.
    skip(FACT, '`' + RULE_KEY + '` does not apply to CBCA, the framework this fact emits under.');
  } else {
    const INC = '2026-03-02';
    const incYear = Number(INC.slice(0, 4));
    const foundingYearIds = emitAt(INC, new Date(incYear, 7, 11));
    const yearAfterIds = emitAt(INC, new Date(incYear + 1, 7, 11));

    if (hasRow(foundingYearIds, RULE_KEY)) {
      fail(
        FACT,
        '`' + RULE_KEY + '` for a company incorporated ' + INC + ', clock ' + incYear +
          '-08-11 — its INCORPORATION YEAR, which produces no return',
        'no row',
        'a row',
      );
    } else if (!hasRow(yearAfterIds, RULE_KEY)) {
      fail(
        FACT,
        '`' + RULE_KEY + '` for a company incorporated ' + INC + ', clock ' + (incYear + 1) +
          '-08-11 — the year AFTER incorporation, when the first return is owed',
        'a row',
        'no row',
      );
    } else if (failures === before) {
      pass(
        FACT,
        '`' + RULE_KEY + '` silent in ' + incYear + ', emitted in ' + (incYear + 1) +
          ' — the boundary holds in both directions',
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures > 0) {
  console.error(failures + ' failure(s).');
  process.exit(1);
}
// ★ THE SUMMARY MUST NOT OVER-CLAIM. A skip is not a failure — the exit code stays 0 —
// but "all invariants hold" beside a ⊘ takes back with the last line what the skip just
// said, and a reader who scans only the summary would see an unqualified success. The
// count of untested paths travels with the verdict.
if (skipped > 0) {
  console.log('invariants hold, EXCEPT ' + skipped + ' path(s) reported UNTESTED above (no subject).');
} else {
  console.log('all invariants hold.');
}
process.exit(0);
