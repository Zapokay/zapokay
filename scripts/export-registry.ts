/**
 * REGISTRY EXPORT — generates a readable view of OBLIGATION_REGISTRY.
 *
 *   npm run export:registry        (or: npx tsx scripts/export-registry.ts)
 *
 * Writes docs/registry-export.md, overwritten every run.
 *
 * ★ PURE. No database, no .env.local, no supabase client, nothing
 * company-specific. The registry is CODE, so this export is identical for every
 * reader and every environment. That is what makes it safe to commit.
 *
 * ★ WHY GENERATED RATHER THAN WRITTEN. A hand-written inventory of obligations
 * drifts the moment someone edits the table — and it drifts silently, because
 * nothing type-checks a document. This output cannot contain an obligation that
 * does not exist, nor omit one that does. It is rebuilt from the source each run.
 *
 * ★ NO TIMESTAMP IN THE OUTPUT, DELIBERATELY. A generation date would change the
 * file on every run, so `git status` would be dirty even when the registry had not
 * moved — which trains a reader to ignore that dirt and destroys the property the
 * export exists for. Instead the output is diff-stable: regenerate, and if git
 * reports no change, it was already current. Self-verifying beats dated.
 *
 * ★ THE GAP SECTION IS GUARDED. Section 4 states what the registry CANNOT express.
 * Each claim carries a machine check (see GAPS below): if someone adds a field that
 * closes a gap, the guard fires and this script FAILS rather than emitting a
 * document that quietly lies. A stated gap that nothing verifies is the same defect
 * class as a stale comment.
 */

import { writeFileSync } from 'node:fs';
import {
  OBLIGATION_REGISTRY,
  OVERLAP_MERGE,
  isBoardSuppressedRequirementKey,
  addMonthsClamped,
  type ObligationRule,
  type ObligationDueCtx,
} from '@/lib/obligations/obligation-registry';

const OUT = 'docs/registry-export.md';
const SRC = 'lib/obligations/obligation-registry.ts';
const CMD = 'npm run export:registry';

/** Every field declared on ObligationRule. Kept beside the guards below. */
const RULE_FIELDS = [
  'ruleKey', 'requirementKeys', 'docKeys', 'statutoryBasis', 'helpKey',
  'deadlineDays', 'triggeredBy', 'dueDate', 'cadence', 'copyKey',
  'frameworks', 'exposure', 'actionKind', 'titleKey', 'suppressWhenSatisfied',
  'prerequisites',
] as const;

/**
 * ★ THE GUARDS. Each gap in section 4 is paired with a predicate over the field
 * names. If a future field closes the gap, `matches` becomes non-empty, this
 * script throws, and whoever added the field must update the gap text. The
 * document cannot outlive the gap it describes.
 */
const GAPS: Array<{ title: string; body: string; forbids: RegExp }> = [
  {
    title: 'A window of N days AFTER the deadline',
    body:
      'Nothing on a rule expresses "late, but still inside a remediation window". ' +
      'The REQ has one (art. 73, 60 days) and the roster update has one (art. 41, ' +
      '30 days). `deadlineDays` is the opposite thing — an offset from a triggering ' +
      'ACT to the deadline, used by event-cadence rules. NOTE: `LivenessInput` ' +
      'already declares `legalWindowDays`, and computeLiveness never reads it.',
    forbids: /window|grace|remediationdays|afterduedays/i,
  },
  {
    title: 'Escalation on the NUMBER of occurrences in default',
    body:
      'Nothing counts instances. A second missed filing carries a different ' +
      'consequence from a first, and that is a property of the COMPANY, not of a ' +
      'row. A rule is evaluated per obligation, so no field on this type can hold ' +
      'it — it would have to be computed across rows and injected.',
    forbids: /occurrence|count|consecutive|streak|defaultcount/i,
  },
  {
    title: 'A dueDate that depends on a FILING REGIME',
    body:
      '`dueDate` is a function and can branch, but `ObligationDueCtx` carries only ' +
      'fyEnd, immatriculationDate, incorporationDate, fiscalYears and today. Nothing ' +
      'says which regime applies to this company, so a rule with two lawful ' +
      'deadlines cannot choose between them.',
    forbids: /regime|filingmode|variant/i,
  },
  {
    title: 'Extinction — an obligation that stops applying',
    body:
      'No rule can declare that it ceases to apply (superseded, absorbed by a later ' +
      'period, no longer owed). Today the only mechanism is `exempt_from_lateness`, ' +
      'a CATALOG column read by the completeness engine — decided outside the ' +
      'registry, and invisible to a rule.',
    forbids: /extinct|supersed|expires|sunset/i,
  },
  {
    title: 'A severity distinct from the liveness tier',
    body:
      'A rule cannot say how BAD a default is. The liveness axis answers "can the ' +
      'user still fix this alone?" and rank.ts answers "how urgent?" — neither ' +
      'answers "what is the consequence?". A fine and a dissolution currently carry ' +
      'the same tier.',
    forbids: /severity|gravity|consequence|penalty/i,
  },
];

for (const g of GAPS) {
  const hit = RULE_FIELDS.filter((f) => g.forbids.test(f));
  if (hit.length > 0) {
    throw new Error(
      `export-registry: the gap "${g.title}" claims the registry cannot express ` +
        `something, but ObligationRule now declares ${hit.join(', ')}. Either the gap ` +
        `closed — update or delete its entry in GAPS — or the new field is unrelated ` +
        `and the guard's pattern needs narrowing. Do not ship a document that states ` +
        `a gap which no longer exists.`,
    );
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: unknown): string => {
  if (v === undefined) return '_omitted_';
  if (v === null) return '`null`';
  if (typeof v === 'function') return '_(function — see the dueDate sample below)_';
  if (Array.isArray(v)) return v.length === 0 ? '_(empty)_' : v.map((x) => '`' + String(x) + '`').join(', ');
  if (typeof v === 'object') return '`' + JSON.stringify(v) + '`';
  return '`' + String(v) + '`';
};

const iso = (d: Date | null): string =>
  d === null ? '`null`' : '`' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '`';

/** Two representative contexts. NOT the rule — a sample of what it returns. */
const TODAY = new Date(2026, 6, 27);
const CTX_WITH: ObligationDueCtx = {
  fyEnd: new Date(2025, 11, 31),
  immatriculationDate: '2018-04-17',
  incorporationDate: '2018-04-17',
  today: TODAY,
};
const CTX_WITHOUT: ObligationDueCtx = {
  immatriculationDate: '2018-04-17',
  incorporationDate: '2018-04-17',
  today: TODAY,
};

const sample = (rule: ObligationRule): string => {
  if (typeof rule.dueDate !== 'function') return '- _no date rule (event-instantiated)_';
  const a = iso(rule.dueDate(CTX_WITH));
  const b = iso(rule.dueDate(CTX_WITHOUT));
  return (
    '- with a closed fiscal year (fyEnd 2025-12-31, today 2026-07-27) → ' + a + '\n' +
    '- with NO closed fiscal year (fyEnd absent, same today) → ' + b
  );
};

// ── build ────────────────────────────────────────────────────────────────────

const L: string[] = [];
const w = (s = '') => L.push(s);

w('<!-- GENERATED FILE — DO NOT EDIT BY HAND. -->');
w('<!-- Generated by `' + CMD + '` from `' + SRC + '`. -->');
w('<!-- Hand edits are lost on the next run. -->');
w();
w('# Obligation registry — generated export');
w();
w('**DO NOT EDIT.** Generated by `' + CMD + '` from `' + SRC + '`.');
w();
w('This file is rebuilt from the code each run, so it cannot list an obligation that');
w('does not exist nor omit one that does. **It carries no generation date on purpose:**');
w('regenerate it and, if `git` reports no change, it was already current. That is a');
w('stronger freshness check than a date, which only records when someone last ran it.');
w();
w('No database, no environment, nothing company-specific — the registry is code, so');
w('this export is the same for every reader.');
w();
w('---');
w();
w('## 1. Entries (' + OBLIGATION_REGISTRY.length + ')');
w();

for (const rule of OBLIGATION_REGISTRY) {
  w('### `' + rule.ruleKey + '`');
  w();
  for (const f of RULE_FIELDS) {
    if (f === 'ruleKey' || f === 'dueDate' || f === 'prerequisites') continue;
    w('- **' + f + '** — ' + fmt((rule as unknown as Record<string, unknown>)[f]));
  }
  w('- **dueDate** — sampled, not printed:');
  for (const line of sample(rule).split('\n')) w('  ' + line);
  w('  - _A sample at two contexts. It is not the rule; read the source for that._');
  if (rule.prerequisites.length === 0) {
    w('- **prerequisites** — _(none)_');
  } else {
    w('- **prerequisites** —');
    for (const p of rule.prerequisites) {
      w('  - `' + p.requirementKey + '` · sameYear `' + p.sameYear + '` · reason `' + p.reasonKey + '`');
    }
  }
  w();
}

w('---');
w();
w('## 2. Derived indexes');
w();
w('Nothing below is declared anywhere — every line is computed from the entries above.');
w();
w('**Completeness key → rule**');
w();
for (const rule of OBLIGATION_REGISTRY) {
  for (const k of rule.requirementKeys) w('- `' + k + '` → `' + rule.ruleKey + '`');
}
if (OBLIGATION_REGISTRY.every((r) => r.requirementKeys.length === 0)) w('- _(none)_');
w();
w('**Document key → rule**');
w();
{
  let any = false;
  for (const rule of OBLIGATION_REGISTRY) {
    for (const k of rule.docKeys ?? []) { w('- `' + k + '` → `' + rule.ruleKey + '`'); any = true; }
  }
  if (!any) w('- _(none)_');
}
w();
w('**OVERLAP_MERGE** — completeness key → deadline rule, derived from `cadence: per-fiscal-year`.');
w('These two halves collapse into one board row.');
w();
{
  const e = Object.entries(OVERLAP_MERGE);
  if (e.length === 0) w('- _(none)_');
  for (const [k, v] of e) w('- `' + k + '` → `' + v + '`');
}
w();
w('**Board-suppressed keys** — derived from `cadence: anniversary`. The completeness');
w('row is dropped from the BOARD only; Complétude and the verdict still count it.');
w();
{
  const all = OBLIGATION_REGISTRY.flatMap((r) => [...r.requirementKeys]);
  const sup = all.filter((k) => isBoardSuppressedRequirementKey(k));
  if (sup.length === 0) w('- _(none)_');
  for (const k of sup) w('- `' + k + '`');
}
w();
w('**Presumed-discharged (suppressWhenSatisfied)** — when the named keys are already');
w('satisfied in the given year scope, the rule emits nothing.');
w();
{
  let any = false;
  for (const rule of OBLIGATION_REGISTRY) {
    const s = rule.suppressWhenSatisfied;
    if (!s) continue;
    any = true;
    const keys = s.requirementKeys ? s.requirementKeys.map((k) => '`' + k + '`').join(', ') : '_any key_';
    w('- `' + rule.ruleKey + '` — scope `' + s.yearScope + '`, keys ' + keys);
  }
  if (!any) w('- _(none)_');
}
w();
w('---');
w();
w('## 3. Field usage across entries');
w();
w('How many of the ' + OBLIGATION_REGISTRY.length + ' entries actually set each field. A field set on few');
w('entries is not wrong — but it is worth knowing which parts of the type carry the table.');
w();
w('_This is NOT a "read by" column._ `ObligationRule` and `Obligation` share most of');
w('their field names (`exposure`, `actionKind`, `dueDate`, `statutoryBasis`, …), so a');
w('text search cannot tell a rule read from an obligation read, and a wrong answer');
w('there would be worse than none.');
w();
for (const f of RULE_FIELDS) {
  const n = OBLIGATION_REGISTRY.filter((r) => (r as unknown as Record<string, unknown>)[f] !== undefined).length;
  w('- **' + f + '** — set on ' + n + ' of ' + OBLIGATION_REGISTRY.length);
}
w();
w('---');
w();
w('## 4. What the registry cannot express');
w();
w('The most useful section for deciding what to build next: concepts a real obligation');
w('has that **no field on `ObligationRule` can carry**. Written from the type, not from');
w('any one obligation.');
w();
w('★ Each gap below is machine-guarded. If a future field closes one, the export script');
w('throws instead of emitting a document that states a gap which no longer exists.');
w();
for (const g of GAPS) {
  w('### ' + g.title);
  w();
  w(g.body);
  w();
}
w('---');
w();
w('_End of generated export._');

writeFileSync(OUT, L.join('\n') + '\n', 'utf8');
// eslint-disable-next-line no-console
console.log('wrote ' + OUT + ' — ' + OBLIGATION_REGISTRY.length + ' entries, ' + GAPS.length + ' gaps, ' + (L.length + 1) + ' lines');
