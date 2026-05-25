// #19d — Dev verification for the lifecycle template registry + fill engine.
//
// NOT shipped to users; not wired into any route. Pure node CLI.
//   Run: node scripts/test-lifecycle-templates.mjs
//
// Why this script inlines its own copy of the registry + fill logic:
// node does not transpile TypeScript out of the box and the project has no
// tsx runner (see package.json — no `tsx` / `ts-node` dep). The brief
// explicitly authorizes inlining as the fallback path. The runtime contract
// this script exercises (fillLifecycleResolution: required-var validation,
// neqClause composition, locale-correct body selection, no-residual-token
// guarantee) must remain bit-identical to lib/pdf/lifecycle-template-engine.ts
// and lib/pdf/lifecycle-templates.ts. If you edit the registry or engine,
// edit this script's copies too (parity is the test).

import { strict as assert } from 'node:assert';

// ─────────────────────────────────────────────────────────────────────────────
// Inlined registry — must match lib/pdf/lifecycle-templates.ts verbatim.
// ─────────────────────────────────────────────────────────────────────────────

const LIFECYCLE_TEMPLATES = {
  director_appointment: {
    docKey: 'director_appointment',
    instrument: 'shareholder',
    satisfies: { event_type: 'director_mandate', event_phase: 'appointment' },
    requiredVars: ['companyName', 'personName', 'effectiveDate', 'resolutionDate'],
    titleFr: "Élection d'un administrateur",
    titleEn: 'Election of a Director',
    bodyFr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE les actionnaires jugent opportun de nommer une personne supplémentaire à titre d'administrateur de la Société;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes élu(e) administrateur de la Société, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction jusqu'à la clôture de la prochaine assemblée annuelle des actionnaires ou jusqu'à ce que son mandat prenne fin conformément à la loi et aux règlements de la Société;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS the shareholders consider it appropriate to appoint an additional person as a director of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby elected as a director of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall hold office until the close of the next annual meeting of shareholders or until they cease to hold office in accordance with the law and the by-laws of the Corporation;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },

  director_departure: {
    docKey: 'director_departure',
    instrument: 'board',
    satisfies: { event_type: 'director_mandate', event_phase: 'departure' },
    requiredVars: ['companyName', 'personName', 'endReason', 'effectiveDate', 'resolutionDate'],
    titleFr: "Constatation de la fin du mandat d'un administrateur",
    titleEn: 'Cessation of a Director',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE {{personName}} a cessé d'occuper le poste d'administrateur de la Société, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la fin du mandat de {{personName}} à titre d'administrateur de la Société, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée;
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{personName}} has ceased to hold office as a director of the Corporation, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{personName}} as a director of the Corporation, effective {{effectiveDate}}, is hereby acknowledged;
2. The records of the Corporation be updated accordingly;
3. Any director or officer of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },

  director_removal: {
    docKey: 'director_removal',
    instrument: 'shareholder',
    satisfies: { event_type: 'director_mandate', event_phase: 'departure' },
    requiredVars: ['companyName', 'personName', 'effectiveDate', 'resolutionDate'],
    titleFr: "Destitution d'un administrateur",
    titleEn: 'Removal of a Director',
    bodyFr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE les actionnaires souhaitent destituer un administrateur de la Société;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes destitué(e) de ses fonctions d'administrateur de la Société, à compter du {{effectiveDate}};
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution, y compris toute formalité de mise à jour auprès du registre des entreprises.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS the shareholders wish to remove a director of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby removed from office as a director of the Corporation, effective {{effectiveDate}};
2. The records of the Corporation be updated accordingly;
3. Any officer of the Corporation is authorized to do all things necessary to give effect to this resolution, including any update filing with the enterprise registrar.

Adopted on {{resolutionDate}}.`,
  },

  officer_appointment: {
    docKey: 'officer_appointment',
    instrument: 'board',
    satisfies: { event_type: 'officer_appointment', event_phase: 'appointment' },
    requiredVars: ['companyName', 'personName', 'officerTitle', 'effectiveDate', 'resolutionDate'],
    titleFr: "Nomination d'un dirigeant",
    titleEn: 'Appointment of an Officer',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE le conseil d'administration juge opportun de pourvoir au poste de {{officerTitle}};

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes nommé(e) au poste de {{officerTitle}} de la Société, à compter du {{effectiveDate}};
2. QUE {{personName}} exerce les fonctions et pouvoirs rattachés à ce poste conformément aux règlements de la Société et aux directives du conseil d'administration;
3. QUE tout administrateur de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée par le conseil d'administration le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS the board of directors considers it appropriate to fill the office of {{officerTitle}};

RESOLVED THAT:

1. {{personName}} is hereby appointed as {{officerTitle}} of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall carry out the duties and powers of that office in accordance with the by-laws of the Corporation and the directions of the board of directors;
3. Any director of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted by the board of directors on {{resolutionDate}}.`,
  },

  officer_departure: {
    docKey: 'officer_departure',
    instrument: 'board',
    satisfies: { event_type: 'officer_appointment', event_phase: 'departure' },
    requiredVars: ['companyName', 'personName', 'officerTitle', 'endReason', 'effectiveDate', 'resolutionDate'],
    titleFr: "Cessation des fonctions d'un dirigeant",
    titleEn: 'Cessation of an Officer',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE {{personName}} a cessé d'occuper le poste de {{officerTitle}} de la Société, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la cessation des fonctions de {{personName}} à titre de {{officerTitle}} de la Société, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée;
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout administrateur de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée par le conseil d'administration le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{personName}} has ceased to hold office as {{officerTitle}} of the Corporation, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{personName}} as {{officerTitle}} of the Corporation, effective {{effectiveDate}}, is hereby acknowledged;
2. The records of the Corporation be updated accordingly;
3. Any director of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted by the board of directors on {{resolutionDate}}.`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Inlined fill engine — must match lib/pdf/lifecycle-template-engine.ts.
// ─────────────────────────────────────────────────────────────────────────────

function composeNeqClause(neq) {
  if (!neq || String(neq).trim() === '') return '';
  return ` (NEQ : ${neq})`;
}

function assertRequiredVars(entry, ctx) {
  const missing = [];
  for (const v of entry.requiredVars) {
    const val = ctx[v];
    if (val === undefined || val === null || String(val).trim() === '') {
      missing.push(v);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `lifecycle-template-engine: missing required vars for docKey="${entry.docKey}": ${missing.join(', ')}`,
    );
  }
}

function substitute(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(vars, token)) {
      return vars[token];
    }
    return match;
  });
}

function fillLifecycleResolution(docKey, ctx, locale) {
  const entry = LIFECYCLE_TEMPLATES[docKey];
  if (!entry) {
    throw new Error(
      `lifecycle-template-engine: unknown docKey="${docKey}". Known keys: ${Object.keys(LIFECYCLE_TEMPLATES).join(', ')}`,
    );
  }
  assertRequiredVars(entry, ctx);
  const vars = { ...ctx, neqClause: composeNeqClause(ctx.neq) };
  const title = locale === 'fr' ? entry.titleFr : entry.titleEn;
  const body = locale === 'fr' ? entry.bodyFr : entry.bodyEn;
  const filledTitle = substitute(title, vars);
  const filledBody = substitute(body, vars);
  if (/\{\{/.test(filledTitle)) {
    throw new Error(
      `lifecycle-template-engine: residual "{{" in filled title for docKey="${docKey}" locale="${locale}": ${filledTitle}`,
    );
  }
  if (/\{\{/.test(filledBody)) {
    throw new Error(
      `lifecycle-template-engine: residual "{{" in filled body for docKey="${docKey}" locale="${locale}"`,
    );
  }
  return {
    docKey: entry.docKey,
    locale,
    instrument: entry.instrument,
    satisfies: entry.satisfies,
    resolution: { number: 1, title: filledTitle, body: filledBody },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────────────

const baseCtx = {
  companyName: 'Acme Test inc.',
  neq: '1234567890',
  personName: 'Marie Tremblay',
  officerTitle: 'Trésorier',
  endReason: 'démission volontaire pour des raisons personnelles',
  effectiveDate: '1 mars 2024',
  resolutionDate: '24 mai 2026',
};

const docKeys = [
  'director_appointment',
  'director_departure',
  'director_removal',
  'officer_appointment',
  'officer_departure',
];

const locales = ['fr', 'en'];

let passed = 0;
let failed = 0;
const failures = [];

console.log('═══════════════════════════════════════════════════════════════');
console.log('  #19d — Lifecycle Template Fill — Dev Verification');
console.log('═══════════════════════════════════════════════════════════════');

for (const docKey of docKeys) {
  for (const locale of locales) {
    console.log('');
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`  docKey: ${docKey}   locale: ${locale}`);
    console.log('───────────────────────────────────────────────────────────────');
    try {
      const out = fillLifecycleResolution(docKey, baseCtx, locale);

      console.log(`instrument: ${out.instrument}`);
      console.log(`satisfies:  (${out.satisfies.event_type}, ${out.satisfies.event_phase})`);
      console.log('');
      console.log(`TITLE: ${out.resolution.title}`);
      console.log('');
      console.log('BODY:');
      console.log(out.resolution.body);
      console.log('');

      // Assertions
      assert.ok(
        !/\{\{/.test(out.resolution.title),
        `residual "{{" in title for ${docKey}/${locale}`,
      );
      assert.ok(
        !/\{\{/.test(out.resolution.body),
        `residual "{{" in body for ${docKey}/${locale}`,
      );
      assert.ok(
        out.instrument === 'board' || out.instrument === 'shareholder',
        `instrument must be 'board' or 'shareholder', got "${out.instrument}"`,
      );

      const expected = LIFECYCLE_TEMPLATES[docKey].satisfies;
      assert.equal(out.satisfies.event_type, expected.event_type);
      assert.equal(out.satisfies.event_phase, expected.event_phase);

      console.log(`✓ PASS — no residual tokens; instrument & satisfies match registry`);
      passed++;
    } catch (err) {
      console.log(`✗ FAIL — ${err.message}`);
      failures.push(`${docKey}/${locale}: ${err.message}`);
      failed++;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEQ-absent edge case (neqClause must be empty, no dangling "(NEQ : )")
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('  edge case: NEQ absent → neqClause is empty (no dangling parens)');
console.log('───────────────────────────────────────────────────────────────');
try {
  const ctxNoNeq = { ...baseCtx };
  delete ctxNoNeq.neq;
  const out = fillLifecycleResolution('director_appointment', ctxNoNeq, 'fr');
  console.log(`first line: ${out.resolution.body.split('\n')[0]}`);
  assert.ok(
    !out.resolution.body.includes('(NEQ :'),
    'neqClause leaked "(NEQ :" when neq was absent',
  );
  assert.ok(
    !out.resolution.body.includes('{{neqClause}}'),
    'neqClause token left unsubstituted',
  );
  console.log('✓ PASS — neqClause cleanly empty');
  passed++;
} catch (err) {
  console.log(`✗ FAIL — ${err.message}`);
  failures.push(`neq-absent edge: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative test: missing required var must throw
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('  negative test: missing required var must throw');
console.log('───────────────────────────────────────────────────────────────');
try {
  const badCtx = { ...baseCtx };
  delete badCtx.personName; // required for every docKey
  let threw = false;
  let thrownMessage = '';
  try {
    fillLifecycleResolution('officer_departure', badCtx, 'en');
  } catch (err) {
    threw = true;
    thrownMessage = err.message;
  }
  assert.ok(threw, 'expected fillLifecycleResolution to throw on missing required var');
  assert.ok(
    thrownMessage.includes('personName'),
    `thrown error must name the missing var; got: ${thrownMessage}`,
  );
  console.log(`thrown: ${thrownMessage}`);
  console.log('✓ PASS — engine threw with personName listed as missing');
  passed++;
} catch (err) {
  console.log(`✗ FAIL — ${err.message}`);
  failures.push(`negative-test: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Final report
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════');
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
