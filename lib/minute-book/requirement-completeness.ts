/**
 * Tier 1 #21 — Requirement-completeness scoring (founding + annual docs).
 *
 * Pure function extracted from /api/minute-book/completeness route.ts so the
 * scoring math can be combined with computeEventCompleteness in the unified
 * route handler. Behavior preserved verbatim from the pre-extraction route.
 *
 * Scoring (mirrors lib/minute-book/state.ts):
 *   téléversé = 1.0  (uploaded & finalized — truly done)
 *   généré    = 0.5  (generated OR WIP upload — awaiting signature)
 *   missing   = 0.0
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { requirementToDocType, type VaultDocType } from '@/lib/requirement-doctype';
import { getDocumentState, STATE_WEIGHT } from '@/lib/minute-book/state';
import { computeLiveness } from '@/lib/obligations/liveness';
import type { ObligationLiveness } from '@/lib/obligations/obligation';
import { fiscalYearSet } from '@/lib/active-years';
// A4 plan §9a, phase 1 — cadence drives the fan-out. New module edge; no cycle:
// obligation-registry imports only lib/utils and lib/active-years, neither of which
// reaches lib/minute-book. Two lib/obligations imports already exist above.
import {
  ruleForRequirementKey,
  obligationFiscalYear,
  fedAnnualReturnWindow,
} from '@/lib/obligations/obligation-registry';
import { mustBlockGeneration } from '@/lib/fiscal-year-open';

export interface ChecklistItem {
  id: string;
  requirement_key: string;
  category: 'foundational' | 'annual';
  title_fr: string;
  title_en: string;
  description_fr: string | null;
  description_en: string | null;
  section: string;
  sort_order: number;
  can_generate: boolean;
  can_upload: boolean;
  year: number | null;
  /**
   * CAN THIS DOCUMENT EXIST YET? — the window axis, orthogonal to `liveness`.
   *
   * `liveness` answers "is this still the right action now?" and is YEAR-founded.
   * This answers "has the obligation's window opened?" and is CLOSURE-founded (or
   * ANNIVERSARY-founded for the federal return). They disagree, measured 2026-08-15:
   * Wick's fiscal year ends 31 MAY, so its 2026 rows read `live` while their window
   * has been open since 2026-05-31 — four rows the year-based axis calls "upcoming"
   * and this one calls actionable.
   *
   * ⚠️ TWO MEMBERS, NOT THREE. `availabilityFor` returns a third, `not_owed`, for a
   * row that has no obligation this cycle at all — and such a row is dropped before
   * it is ever pushed here, so the field cannot carry it. `tsc` proves the narrowing;
   * no consumer has to handle a case it can never see, and nobody can invent a
   * display for one.
   */
  availability: Exclude<RequirementAvailability, 'not_owed'>;
  satisfied: boolean;
  /**
   * Liveness tier for a NOT-DONE item — any doc where is_finalized !== true (missing,
   * uploaded-but-uncertified, or generated draft); null only when certified/done
   * (is_finalized === true). Computed via the board's computeLiveness so Complétude +
   * the dashboard verdict share ONE classification. Annual: year-based (live =
   * "upcoming" / regularize / remediate). Foundational (year:null): anchored to
   * incorporation age with a live→regularize floor — a founding doc is owed from day 1,
   * so it is NEVER 'live'/upcoming.
   */
  liveness: ObligationLiveness | null;
  source?: 'uploaded' | 'generated' | null;
  /** Derived server-side via `requirementToDocType` — see lib/requirement-doctype.ts. */
  document_type: VaultDocType;
  /**
   * Phase B B5 — when the row is satisfied, these surface the attached
   * documents-table row so the client can avoid an on-demand fetch (B4
   * destructive-replace flow) and split the badge between signed final
   * vs WIP upload. Null/undefined when the row is unsatisfied or when the
   * lookup found no matching document (data drift).
   */
  document_id?: string | null;
  document_file_url?: string | null;
  document_is_finalized?: boolean | null;
  document_language?: string | null;
}

/**
 * THE WINDOW AXIS — three states, and the third is why it is not a boolean.
 *
 *   open      — the document can exist now. Its window is open, or it has none
 *               (a foundational row records a fact that already happened).
 *   upcoming  — the obligation is real but its window has not opened. Generating or
 *               uploading now would file a document that cannot yet legitimately
 *               exist (art. 155(1)a) CBCA anchors financial statements on CLOSED
 *               periods).
 *   not_owed  — NO obligation exists this cycle. Distinct from `upcoming` and it
 *               must stay distinct: "à venir" asserts a filing that is coming,
 *               "à générer" asserts one already owed, and for a company inside its
 *               incorporation year the federal return is NEITHER. The row should not
 *               be counted at all — which is exactly what the engine does with it.
 */
export type RequirementAvailability = 'open' | 'upcoming' | 'not_owed';

/**
 * The window axis for one catalog row. PRIVATE to this engine on purpose: the shared
 * signal is the FIELD it stamps (`ChecklistItem.availability`), read by the inventory,
 * the chip, the filter and the row icon. One computation, one stamp, four readers.
 *
 * ⚠️ THE FISCAL BRANCH CALLS `mustBlockGeneration`; IT DOES NOT REIMPLEMENT IT. That
 * predicate is the single copy of the closure comparison across three lots (`5b21967`,
 * `f830f85`, and this one). A second copy would diverge at the first change — the
 * `968a7ae` shape this repo has already paid for.
 *
 * ⚠️ LIFECYCLE ACTS DO NOT PASS THROUGH HERE, and that is a contract, not an accident:
 * `checklist` is requirements-only precisely because UploadDocumentModal's dropdown
 * iterates it (see the API route's own note). Acts keep `liveness` as their axis — an
 * act has no window, and "is this the action of the moment?" is the right question for
 * one. The exclusion written into `mustBlockUpload` was about the AFFORDANCE (do not
 * disable a button for a document that already exists); reusing it as a census rule
 * would be a different claim.
 */
function availabilityFor(
  requirementKey: string,
  year: number | null,
  fiscalYearEndDate: string | null,
  fedWindow: { opensOn: Date; dueOn: Date } | null,
  today: Date,
): RequirementAvailability {
  // The anniversary clock — no relation to the fiscal year. Measured 2026-08-15, the
  // gap between what a fiscal reading would say and the real opening: Fixture Cap TEN
  // MONTHS, Café du Coin six, Wick two.
  if (ANNIVERSARY_CLOCK_REQUIREMENT_KEYS.has(requirementKey)) {
    if (fedWindow === null) return 'not_owed';
    return fedWindow.opensOn > today ? 'upcoming' : 'open';
  }
  // Foundational: no fiscal year, so no window to wait for.
  if (year === null) return 'open';
  return mustBlockGeneration(year, fiscalYearEndDate, today) ? 'upcoming' : 'open';
}

/**
 * The keys whose window is the incorporation ANNIVERSARY rather than the fiscal year.
 * A manual copy of `cadence: 'anniversary'` in the registry — kept local because the
 * registry's own derivation (`isBoardSuppressedRequirementKey`) answers a different
 * question, and because this engine already imports what it needs by name.
 * ⚠️ If a second anniversary-clocked key ever lands, derive this from `cadence`
 * instead of extending the set: the registry is already imported here.
 */
const ANNIVERSARY_CLOCK_REQUIREMENT_KEYS: ReadonlySet<string> = new Set(['cbca_annual_return']);

export interface RequirementCompletenessResult {
  checklist: ChecklistItem[];
  fiscalYears: { year: number; endDate: string }[];
  /** Count of téléversé rows. */
  requirementsUploaded: number;
  /** Count of généré rows (incl. WIP uploads). */
  requirementsGenerated: number;
  requirementsMissing: number;
  /**
   * Of the MISSING rows, how many are waiting on a window that has not opened.
   * ★ "MISSING" IS THE LOAD-BEARING WORD. A row that already has a draft is not
   * missing, so a generated-but-unsigned document sitting on an unopened window is
   * counted as "à signer", never as "à venir" — the document EXISTS and the user has
   * a gesture to make. The state of the document outranks the state of the window,
   * and that ruling is expressed by this clause rather than by a comment.
   * (Zero such rows in the fixtures on 2026-08-16; there were six the day before.)
   */
  requirementsUpcoming: number;
  /**
   * `requirementsMissing − requirementsUpcoming`. Exposed rather than left to the two
   * pages to subtract: `InventoryLine` is rendered by both, and an arithmetic done
   * twice is an arithmetic that will disagree once.
   */
  requirementsToGenerate: number;
  requirementsTotal: number;
  /** Weighted numerator: requirementsUploaded × 1.0 + requirementsGenerated × 0.5. */
  requirementsWeightedNum: number;
  /**
   * Liveness breakdown of the NOT-DONE items (Core §4: retention window = urgency,
   * not expiry — no year is filtered out). NOT-DONE = every item where is_finalized
   * !== true (missing, uploaded-but-uncertified, or generated draft). `upcoming` =
   * live tier (not-yet-due current/future FY). Invariant: upcoming + overdueRegularize
   * + overdueProlonged === (count of items where is_finalized !== true).
   */
  upcoming: number;
  overdueRegularize: number;
  overdueProlonged: number;
}

export async function computeRequirementCompleteness(
  supabase: SupabaseClient,
  companyId: string,
  framework: 'LSA' | 'CBCA',
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  incorporationDate: string | null,
): Promise<RequirementCompletenessResult> {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  // Foundational items carry no year — anchor their liveness to incorporation age.

  // 1. Get all applicable requirements
  const { data: requirements, error: reqError } = await supabase
    .from('minute_book_requirements')
    .select('*')
    .or(`framework.eq.${framework},framework.eq.ALL`)
    .order('sort_order');
  if (reqError) throw reqError;

  // 2. Get all active fiscal years
  const { data: fiscalYears, error: fyError } = await supabase
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('year', { ascending: false });
  if (fyError) throw fyError;

  /* ---------- Les exigences couvertes, LUES SUR LA TABLE DE LIAISON ----------
     A7-2 — dernier lecteur d'affichage basculé du scalaire vers
     `requirement_documents`. Un document couvre PLUSIEURS exigences depuis
     A2a ; le scalaire n'en portait que la première, donc les autres ne
     comptaient nulle part.
     ⚠️ `!inner` + `status='active'` : invariant D6. La table de liaison ne
     porte AUCUNE colonne d'état — l'état vit sur le DOCUMENT.
     B5 conservé : id, file_url, is_finalized sont embarqués pour que le client
     résolve la cible de remplacement destructif sans aller-retour supplémentaire
     et sépare le badge « final signé » du « téléversement en cours ». */
  const { data: rawLinks, error: linkError } = await supabase
    .from('requirement_documents')
    // ⚠️ UNE SEULE CHAÎNE LITTÉRALE, PAS UNE CONCATÉNATION. supabase-js analyse
    // ce texte AU NIVEAU DU TYPE ; un `+` le rend non littéral, l'analyseur
    // abandonne et rend `GenericStringError`, ce qui fait tomber les trois
    // prédicats plus bas avec des TS2339 illisibles. Même forme que les deux
    // autres embeds du dépôt (resolve-signatory-blocks.ts:84, event-completeness.ts:297).
    .select('requirement_key, requirement_year, document:documents!inner(id, source, file_url, is_finalized, language, created_at, status)')
    .eq('company_id', companyId)
    .eq('document.status', 'active');
  if (linkError) throw linkError;

  /* ⚠️ LE TRI SE FAIT ICI, EN JAVASCRIPT, ET C'EST DÉLIBÉRÉ.
     L'ancienne requête ordonnait `created_at` décroissant pour que le `.find()`
     se lie au document le PLUS RÉCENT — décision de #75/§8.55, conservée telle
     quelle. Trier une table EMBARQUÉE en PostgREST passe par une option dont le
     nom a changé selon les versions du client (`foreignTable` / `referencedTable`).
     Un tri JavaScript ne dépend d'aucune version et donne le même résultat. */
  // ⚠️ UNE SEULE assertion, ICI, à la frontière où la donnée entre. Pas une par
  // prédicat, pas de `any`. Tout ce qui est en aval est vérifié par le
  // compilateur contre `RawLink`. Idiome du dépôt : event-completeness.ts:316-321.
  const links = ([...(rawLinks ?? [])] as unknown as RawLink[]).sort((a, b) =>
    (b.document?.created_at ?? '').localeCompare(a.document?.created_at ?? ''),
  );

  // 4. Compute endDate per fiscal year (resolution date stamped on PDFs
  // generated via Bulk Catch-Up). Year labels are now derived from `year`
  // alone — see getFiscalYearLabel in lib/fiscal-year-label.ts.
  //
  // The YEAR SET comes from `fiscalYearSet` (lib/active-years) — the stored ACTIVE
  // rows UNIONED with the currently-computed window — so this engine and the
  // deadline feeder can no longer drift apart. The stored list is written once at
  // onboarding and never refreshed, while the feeder's year advances with the
  // calendar; without the union they diverge on a schedule (Acme 2028-01-01, Wick
  // 2029-01-01) and OVERLAP_MERGE silently un-pairs. See the helper's docblock.
  //
  // ORDER PRESERVED: the query above returns DESCENDING; fiscalYearSet returns
  // ascending, so it is re-sorted descending here. Only WHICH years are included
  // changes — never the shape of an entry, its endDate formula, or the order they
  // are emitted in (which drives checklist order downstream).
  const storedActiveYears = (fiscalYears ?? []).map((fy: { year: number }) => fy.year);
  const fyFormatted = fiscalYearSet(
    storedActiveYears,
    fiscalYearEndMonth,
    fiscalYearEndDay,
    incorporationDate,
    today,
  )
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      endDate: `${year}-${pad2(fiscalYearEndMonth)}-${pad2(fiscalYearEndDay)}`,
    }));

  type RawReq = {
    id: string; requirement_key: string; category: 'foundational' | 'annual'; title_fr: string; title_en: string;
    description_fr: string | null; description_en: string | null; section: string;
    sort_order: number; can_generate: boolean; can_upload: boolean;
    // Nullable in the type even though the column is NOT NULL-defaulted and uniformly
    // seeded today: a future INSERT could omit it, and null must read as NOT exempt.
    exempt_from_lateness: boolean | null;
  };
  // A7-2 — `RawDoc` a été REMPLACÉ par `RawLink` : le moteur n'apparie plus des
  // documents mais des LIAISONS, dont le document est un enfant embarqué.
  interface RawLink {
    requirement_key: string;
    requirement_year: number | null;
    // Embed shape — single-FK relation returns an object, not an array.
    // supabase-js type toute table embarquée comme un TABLEAU faute de
    // connaître la cardinalité sans types générés. Le type ment, le runtime
    // a raison. Même situation, même remède qu'event-completeness.ts:230.
    document: {
      id: string;
      source: string | null;
      file_url: string | null;
      is_finalized: boolean | null;
      language: string | null;
      created_at: string;
    } | null;
  }

  // 5. Build checklist
  // ── FAN-OUT: CADENCE WINS WHERE A RULE EXISTS, CATEGORY CONTINUES WHERE IT DOES
  //    NOT (A4 plan §9a, phase 1) ────────────────────────────────────────────────
  // The catalog's `category` decided multiplicity alone: 'foundational' → one row,
  // 'annual' → one row per active fiscal year. That is right for every requirement
  // whose registry cadence agrees with it, and wrong for one that does not.
  //
  // THE DISAGREEMENT, and it is the whole of phase 1: `fed_annual_return` is cadence
  // 'anniversary' — ONE recurring instance, you are never "behind on your 2023
  // return" — but its requirement key `cbca_annual_return` is catalog category
  // 'annual', so the engine fanned it out across every fiscal year. Complétude then
  // claimed a company owed EIGHT federal annual returns when it owes one. Cadence is
  // the authority on "what instantiates an instance"; category is not.
  //
  // SCOPE — deliberately tiny. 20 of the 25 catalog rows have NO ObligationRule at all,
  // so `ruleForRequirementKey` returns undefined and they keep the category path
  // untouched. Of the 5 that DO have a rule, 4 already agree with their category
  // ('once' ≡ foundational, 'per-fiscal-year' ≡ annual). Exactly ONE row changes
  // behaviour: cbca_annual_return, CBCA only. LSA is untouched end to end.
  //
  // The anniversary partition is taken FIRST so the two category lists are built from
  // the remainder. Today no foundational row carries an anniversary cadence (the
  // initial declarations are 'once'), so the foundational list is byte-identical —
  // the exclusion is a guard against a future rule landing in both lists, not a
  // change to the foundational split, whose liveness/exemption path reads no cadence
  // and no category and is untouched here.
  const isAnniversary = (r: RawReq) =>
    ruleForRequirementKey(r.requirement_key)?.cadence === 'anniversary';
  const anniversaryReqs = (requirements || []).filter((r: RawReq) => isAnniversary(r));
  const foundationalReqs = (requirements || []).filter(
    (r: RawReq) => r.category === 'foundational' && !isAnniversary(r),
  );
  const annualReqs = (requirements || []).filter(
    (r: RawReq) => r.category === 'annual' && !isAnniversary(r),
  );
  // The single instance's year IS the deadline feeder's attach key — the SAME
  // `obligationFiscalYear` call with the same arguments, not a re-derivation. That makes
  // the two halves definitionally aligned on (requirement_key, year), which is what
  // the federal clear-gate matches on.
  const anniversaryYear = obligationFiscalYear(
    fiscalYearEndMonth,
    fiscalYearEndDay,
    incorporationDate,
    today,
  );

  const checklist: ChecklistItem[] = [];
  let requirementsTotal = 0;
  let requirementsUploaded = 0;
  let requirementsGenerated = 0;
  // Missing rows whose window has not opened. Incremented in the same passes as the
  // three above, from `availabilityFor` — never re-derived downstream.
  let requirementsUpcoming = 0;
  // ONE call per company, not per row: the federal window depends only on the
  // incorporation date and the clock. Null means NO return is owed this cycle — see
  // fedAnnualReturnWindow's docblock for why that is not the same as "not yet open".
  const fedWindow = fedAnnualReturnWindow(incorporationDate, today);
  // Liveness breakdown of MISSING items (Core §4: no year filtered out).
  let upcoming = 0;
  let overdueRegularize = 0;
  let overdueProlonged = 0;

  // Foundational items
  for (const req of foundationalReqs as RawReq[]) {
    // ── THE WINDOW GATE — FIRST STATEMENT OF THE BODY, AND THE PLACEMENT IS THE POINT. ──
    //
    // ⚠️ DO NOT MOVE THIS LOWER. It is tempting to put it next to `requirementsTotal++`,
    // where the row visibly joins the census. That would be too late: `upcoming`,
    // `overdueRegularize` and `overdueProlonged` are incremented ABOVE the push, and those
    // three are exactly what the dashboard verdict reads (`app/[locale]/dashboard/
    // page.tsx` — cProlonged > 0 ? defaut_prolonge : cRegularize > 0 ? attention :
    // en_regle). A `not_owed` row skipped only from the Total would still weigh on the
    // verdict and still sit inside the "à venir" chip — the exact contradiction this lot
    // exists to remove, reproduced by its own fix.
    //
    // At the top, one `continue` takes the row out of the checklist, the three liveness
    // counters, the Total, the score denominator and the state counters at once.
    //
    // ⚠️ UNREACHABLE ON THIS BRANCH TODAY, AND KEPT ANYWAY. A foundational row has
    // year === null and no foundational key carries an anniversary clock, so
    // availabilityFor cannot return 'not_owed' here — but that is a property of the
    // CATALOG, not of the type. Routing every branch through the same function and the
    // same guard is what makes a future foundational key with a clock safe by default.
    // Same shape, same reason, as mustBlockGeneration's branch 2.
    const availability = availabilityFor(req.requirement_key, null, null, fedWindow, today);
    if (availability === 'not_owed') continue;
    // A7-2 — la clé SEULE, comme avant. ⚠️ Voir le commentaire de la requête :
    // ne pas ajouter de comparaison d'année ici, ce site n'en a jamais fait.
    const matchingLink = links.find((l) => l.requirement_key === req.requirement_key);
    const matchingDoc = matchingLink?.document ?? undefined;
    const satisfied = !!matchingDoc;
    const source = (matchingDoc?.source as 'uploaded' | 'generated' | null) || null;
    const isFinalized = matchingDoc?.is_finalized ?? null;
    const state = getDocumentState({ satisfied, source, is_finalized: isFinalized, can_generate: req.can_generate });
    // Foundational liveness: NO year (duration is legally inert — see below), floored
    // live→regularize (owed from day 1 → never "upcoming"). Null in TWO cases now: a
    // CERTIFIED row (is_finalized===true), and an EXEMPT row (exempt_from_lateness) —
    // see the exemption block below. Non-null for every other NOT-DONE item (missing,
    // uploaded-but-uncertified, or generated draft).
    //
    // LATENESS EXEMPTION — NOW A CATALOG COLUMN, `minute_book_requirements
    // .exempt_from_lateness` (migration 20260728120000). An exempt row is COUNTED in
    // requirementsTotal, stays uploadable/replaceable, and enters the binder on
    // certification — it simply carries NO tier and feeds NEITHER overdue counter.
    //
    // GOVERNING PRINCIPLE (Dom, endorsed by Harvey as the thing to keep explicit):
    // WHO ELSE HOLDS THE PROOF. The more a document's proof is held elsewhere (the
    // registraire, the public register), the more benign its absence from the book; the
    // more it exists only inside the company, the graver. That grades the list without
    // any reference to duration. Exempt today: statuts + certificat (the registraire
    // holds them), règlements (supplétif — art. 113-114 LSAQ and the "à défaut"
    // pattern), acceptation de mandat (directors are declared at the REQ), and the LSA
    // declaration initiale. NOT exempt: souscription/émission (proof exists ONLY in the
    // registre des valeurs mobilières) and the first resolutions ("révélateurs" that the
    // founding acts may never have been performed).
    //
    // WHY THIS REPLACED A CODE-SIDE SET. The former PROOF_SLOT_KEYS was a registry-
    // derived Set gated on `framework === 'LSA'`. Both the membership AND the framework
    // gate are now DATA: catalog rows are already per-framework with disjoint keys, so
    // `lsaq_declaration_initiale` can be exempt while `cbca_declaration_initiale_qc` is
    // not, with no framework literal anywhere. That CBCA row stays non-exempt
    // deliberately — it is a FILING, not a constitutive document, and for a CBCA company
    // without hasLaterAnnualFiling its deadline twin IS emitted and genuinely overdue, so
    // ddf061d's guard remains load-bearing for a company shape we have no fixture for.
    //
    // NULL-OR-FALSE IS NOT EXEMPT. The column is NOT NULL-defaulted and uniformly seeded
    // today, but a future INSERT could omit it; the check is `=== true` so absence can
    // never silently exempt a row.
    //
    // DURATION BASIS REMOVED (Harvey 2026-07-28, GREEN, art. 9 LSAQ + the federal
    // certificate rule + LPLE publicity. GREEN here = statutory structure Harvey
    // verified against the texts, which is what implementation keys on — the same sense
    // used for the exemption grading above. NOT a content sign-off: the CONTENT launch
    // gate is A1, where an external lawyer is the sole GREEN authority and has not
    // reviewed this.)
    // The time a company has operated without its constitutive documents in the book
    // is LEGALLY NEUTRAL, LSAQ and CBCA alike: validity and opposability flow from
    // deposit at the registraire and the public register, not from the internal book.
    // So `year` is null for EVERY foundational row — Branch B's "no year, no lateness
    // concept" path — and the tier no longer moves with the calendar. Before this,
    // `year: incYear` made the SAME missing document read 'regularize' at a 2019 clock
    // and 'remediate' at a 2026 one.
    //
    // THE FLOOR BELOW — `raw === 'live' ? 'regularize' : raw` — REMAINS, DELIBERATELY.
    // Its reason is SEMANTIC, not temporal (see the opening line of this block and
    // commit 85f5695): `live` is glossed "upcoming / not yet due", and a founding
    // document is owed from day 1, so it is never "not yet due". Harvey's ruling
    // retires the duration concept; it does not make these documents current.
    //
    // WHAT THE FLOOR STILL GOVERNS, after the exemption: the NON-EXEMPT rows — the first
    // resolutions and souscription/émission. Nobody else holds THEIR proof, so their
    // absence is a real gap and 'regularize' is the honest tier. Net effect: every
    // unsatisfied NON-EXEMPT foundational row is 'regularize' at every ambient clock;
    // exempt rows carry no tier at all. Clock-invariance remains the acceptance test for
    // both halves.
    //
    // NO TIER USES THE EXISTING NULL PATH. `liveness` is already `ObligationLiveness |
    // null`, null for certified rows, and every consumer already handles it: the counters
    // increment inside this same `if (isFinalized !== true)` block, and
    // CompletenessPage's rowMatchesFilters takes `ObligationLiveness | null` and simply
    // matches no severity chip on null. So an exempt row needs no new liveness value —
    // adding one would have meant widening a closed 3-member union that LIVENESS_RANK
    // and TIER_BADGE switch over exhaustively.
    //
    // Touches ONLY `liveness` and which counter it increments. `satisfied`, `state`,
    // STATE_WEIGHT, requirementsTotal and the completeness % are all unaffected.
    let liveness: ObligationLiveness | null = null;
    if (isFinalized !== true && req.exempt_from_lateness !== true) {
      const raw = computeLiveness({
        daysUntilDue: null,
        legalWindowDays: null,
        year: null,
        today,
      });
      liveness = raw === 'live' ? 'regularize' : raw;
      // NO `upcoming` BRANCH HERE, and tsc proves it: the floor above narrows `liveness`
      // to 'regularize' | 'remediate', so a foundational row can no longer reach 'live'
      // at all. It used to, via the proof-slot escape — that was the ONE row incrementing
      // `upcoming` from this branch, and it is exactly the "à venir" falsehood this
      // change removes. Exempt rows now exit above with liveness null and count nowhere.
      if (liveness === 'regularize') overdueRegularize++;
      else overdueProlonged++;
    }
    checklist.push({
      ...req,
      year: null,
      availability,
      satisfied,
      liveness,
      source,
      document_type: requirementToDocType(req.requirement_key, req.section),
      document_id: matchingDoc?.id ?? null,
      document_file_url: matchingDoc?.file_url ?? null,
      document_is_finalized: isFinalized,
      document_language: matchingDoc?.language ?? null,
    });
    requirementsTotal++;
    if (state === 'téléversé') requirementsUploaded++;
    else if (state === 'généré') requirementsGenerated++;
    // Reaching here means state === 'missing' — getDocumentState returns exactly three
    // values and the two above consumed the others, so the chain makes double-counting
    // structurally impossible rather than merely avoided.
    //
    // ★ "MISSING" IS THE RULING, NOT A DETAIL. A row that already has a draft is "à
    // signer" even when its window has not opened: the document EXISTS and the user has
    // a gesture to make. The state of the document outranks the state of the window.
    else if (availability === 'upcoming') requirementsUpcoming++;
  }

  // Annual items — one set per active fiscal year
  for (const fy of fyFormatted) {
    for (const req of annualReqs as RawReq[]) {
      // Same gate, same placement, same reason as the foundational loop above — the
      // three liveness counters below feed the verdict and are incremented before the
      // push. `fy.endDate` is the closure this row waits for; availabilityFor delegates
      // the comparison to mustBlockGeneration rather than repeating it.
      const availability = availabilityFor(req.requirement_key, fy.year, fy.endDate, fedWindow, today);
      if (availability === 'not_owed') continue;
      const matchingLink = links.find(
        (l) => l.requirement_key === req.requirement_key && l.requirement_year === fy.year,
      );
      const matchingDoc = matchingLink?.document ?? undefined;
      const satisfied = !!matchingDoc;
      const source = (matchingDoc?.source as 'uploaded' | 'generated' | null) || null;
      const isFinalized = matchingDoc?.is_finalized ?? null;
      const state = getDocumentState({ satisfied, source, is_finalized: isFinalized, can_generate: req.can_generate });
      // Annual liveness: year-based (live = "upcoming" for current/future FY). Non-null for
      // any NOT-DONE item (missing, uploaded-but-uncertified, or generated draft);
      // null only when is_finalized===true (certified/done).
      let liveness: ObligationLiveness | null = null;
      if (isFinalized !== true) {
        liveness = computeLiveness({ daysUntilDue: null, legalWindowDays: null, year: fy.year, today });
        if (liveness === 'live') upcoming++;
        else if (liveness === 'regularize') overdueRegularize++;
        else overdueProlonged++;
      }
      checklist.push({
        ...req,
        year: fy.year,
        availability,
        satisfied,
        liveness,
        source,
        document_type: requirementToDocType(req.requirement_key, req.section),
        document_id: matchingDoc?.id ?? null,
        document_file_url: matchingDoc?.file_url ?? null,
        document_is_finalized: isFinalized,
        document_language: matchingDoc?.language ?? null,
      });
      requirementsTotal++;
      if (state === 'téléversé') requirementsUploaded++;
      else if (state === 'généré') requirementsGenerated++;
      // state === 'missing' here — see the note on the foundational loop above for why
      // the chain is the guarantee, and why "missing" is the ruling.
      else if (availability === 'upcoming') requirementsUpcoming++;
    }
  }

  // Anniversary items — ONE instance, at the attach-key year (A4 plan §9a, phase 1).
  // Identical to the annual loop above in every respect EXCEPT multiplicity: same
  // document match on (requirement_key, year), same state, same year-based liveness,
  // same counters, same weights. It is NOT the foundational path — an anniversary
  // obligation carries a clock, so it must never take the foundational live→regularize
  // floor, which would make a current, correctly-filed federal return read
  // 'regularize'. It stays COUNTED in requirementsTotal, stays uploadable, and enters
  // the binder on certification: the book is the product.
  //
  // ★ WHY `_boardSuppressedKeys` SURVIVES THIS PHASE, and must not be removed with it:
  // it looked like pure reconciliation for a fan-out that should never have happened,
  // and after this change it does one-eighth the work — but it is now the ONLY thing
  // keeping this row off the board. `OVERLAP_MERGE` derives from cadence
  // 'per-fiscal-year', so an 'anniversary' row is NOT a key in it and
  // `mergeObligations` returns before it ever constructs `${ruleKey}|${year}`. The
  // halves therefore cannot merge no matter how well their years align. Drop the
  // suppression and the board gets TWO rows for one obligation — worse than the
  // disagreement this phase fixes. Counted in Complétude, represented on the board by
  // the deadline row (which carries the clock AND the upload affordance) is the
  // intended end state, not an accident.
  for (const req of anniversaryReqs as RawReq[]) {
    // ★ THE ONLY BRANCH WHERE `not_owed` ACTUALLY FIRES TODAY. A company inside its
    // incorporation year owes no federal return at all (Harvey 2026-08-10, GREEN), so
    // fedAnnualReturnWindow returns null and this row leaves the checklist entirely —
    // it is not "à venir" and it is not "à générer", it does not exist.
    //
    // ⚠️ THIS IS THE ONE PLACE THE ROW COUNT CHANGES, and it changes on a third page.
    // Dropping the row lowers requirementsTotal, which is the score's denominator
    // (`route.ts` combinedDenom / requirementsScore) — and `BinderPage.tsx` renders that
    // score. MEASURED 2026-08-16: Fixture Cap is the only company inside its founding
    // year and holds zero documents, so its score moves 0/13 → 0/12, still 0 %. Invisible
    // today, real the day such a company certifies anything. The moving number is the
    // MORE correct one: the denominator stops counting an obligation that does not exist.
    //
    // Same placement rule as the two loops above — before the liveness counters that feed
    // the verdict, not merely before requirementsTotal++.
    const availability = availabilityFor(
      req.requirement_key,
      anniversaryYear,
      null,
      fedWindow,
      today,
    );
    if (availability === 'not_owed') continue;
    const matchingLink = links.find(
      (l) =>
        l.requirement_key === req.requirement_key && l.requirement_year === anniversaryYear,
    );
    const matchingDoc = matchingLink?.document ?? undefined;
    const satisfied = !!matchingDoc;
    const source = (matchingDoc?.source as 'uploaded' | 'generated' | null) || null;
    const isFinalized = matchingDoc?.is_finalized ?? null;
    const state = getDocumentState({ satisfied, source, is_finalized: isFinalized, can_generate: req.can_generate });
    let liveness: ObligationLiveness | null = null;
    if (isFinalized !== true) {
      liveness = computeLiveness({ daysUntilDue: null, legalWindowDays: null, year: anniversaryYear, today });
      if (liveness === 'live') upcoming++;
      else if (liveness === 'regularize') overdueRegularize++;
      else overdueProlonged++;
    }
    checklist.push({
      ...req,
      year: anniversaryYear,
      availability,
      satisfied,
      liveness,
      source,
      document_type: requirementToDocType(req.requirement_key, req.section),
      document_id: matchingDoc?.id ?? null,
      document_file_url: matchingDoc?.file_url ?? null,
      document_is_finalized: isFinalized,
      document_language: matchingDoc?.language ?? null,
    });
    requirementsTotal++;
    if (state === 'téléversé') requirementsUploaded++;
    else if (state === 'généré') requirementsGenerated++;
    // Reaching here means state === 'missing' — getDocumentState returns exactly three
    // values and the two above consumed the others, so the chain makes double-counting
    // structurally impossible rather than merely avoided.
    //
    // ★ "MISSING" IS THE RULING, NOT A DETAIL. A row that already has a draft is "à
    // signer" even when its window has not opened: the document EXISTS and the user has
    // a gesture to make. The state of the document outranks the state of the window.
    else if (availability === 'upcoming') requirementsUpcoming++;
  }

  const requirementsMissing = requirementsTotal - requirementsUploaded - requirementsGenerated;
  // Derived ONCE, here, rather than left to the two pages that render InventoryLine:
  // an arithmetic performed twice is an arithmetic that will disagree once.
  // `requirementsMissing` keeps its meaning untouched — page.tsx already reads it, and a
  // field whose value changes while its name does not is the defect this lot is about.
  const requirementsToGenerate = requirementsMissing - requirementsUpcoming;
  const requirementsWeightedNum =
    requirementsUploaded * STATE_WEIGHT['téléversé'] +
    requirementsGenerated * STATE_WEIGHT['généré'];

  return {
    checklist,
    fiscalYears: fyFormatted,
    requirementsUploaded,
    requirementsGenerated,
    requirementsMissing,
    requirementsUpcoming,
    requirementsToGenerate,
    requirementsTotal,
    requirementsWeightedNum,
    upcoming,
    overdueRegularize,
    overdueProlonged,
  };
}
