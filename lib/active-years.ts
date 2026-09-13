import { parseLocalDate } from '@/lib/utils'

/**
 * LA FRONTIÈRE D'EXERCICE — la seule du dépôt.
 *
 * Rend l'étiquette de l'exercice qui CONTIENT une date, pour une société dont
 * l'exercice se termine le (mois, jour) donné. Un exercice porte l'année civile où
 * il SE TERMINE ; il contient une date si sa fin tombe ce jour-là ou après.
 *
 * ★ LA SEULE, ET PAR QUEL MÉCANISME. Ce fichier en a porté deux : celle-ci, et une
 * copie privée, `fiscalYearOfDate`, qui servait la fenêtre de l'étape 8 et la plage
 * du coffre. Celle-ci lit la date en LOCAL depuis 8176ad4 (2026-06-09) ; la copie,
 * écrite dix-neuf jours plus tard, recevait une date de constitution lue en UTC — et
 * se déclarait « SINGLE SOURCE OF TRUTH ». Pour un premier jour d'exercice, à l'ouest
 * de Greenwich, les deux rendaient deux exercices différents. La copie est SUPPRIMÉE.
 * `exercicesDeLaSociete`, plus bas, tire ses deux bornes d'ici, et
 * `obligationFiscalYear` (obligation-registry.ts) aussi : deux APPELS d'une même
 * définition, pas deux définitions qui s'accordent. Ce qui le déferait : réécrire le
 * calcul de `fiscalEndPassed` ailleurs au lieu d'importer cette fonction.
 */
export function fiscalYearForDate(
  dateISO: string,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number
): number {
  const d = parseLocalDate(dateISO); // TZ-safe: bare YYYY-MM-DD must parse as LOCAL midnight (#159 / §8.54 chokepoint), else a FY-first-day rolls back to the prior FY in UTC-negative zones
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();
  const fiscalEndPassed =
    month > fiscalYearEndMonth ||
    (month === fiscalYearEndMonth && day > fiscalYearEndDay);
  return fiscalEndPassed ? year + 1 : year;
}

/**
 * Le jour d'un instant, en AAAA-MM-JJ, lu dans les champs LOCAUX de l'horloge qui
 * exécute — jamais `toISOString()`, qui rend le jour UTC (#159 / §8.54).
 */
function jourLocal(instant: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${instant.getFullYear()}-${pad2(instant.getMonth() + 1)}-${pad2(instant.getDate())}`
}

/**
 * Ce que la règle lit d'une société : trois colonnes, sous leurs noms de base, NOT
 * NULL depuis la migration 20260913150000. Une ligne `companies` se passe telle quelle.
 */
export interface SocieteExercices {
  incorporation_date: string
  fiscal_year_end_month: number
  fiscal_year_end_day: number
}

export interface ExercicesDeLaSociete {
  /** Tous les exercices de la société, du premier à celui en cours. Croissant. */
  exercices: number[]
  /** L'exercice qui contient aujourd'hui. Toujours suivi — jamais un interrupteur. */
  enCours: number
  /**
   * Le dernier exercice TERMINÉ : celui qui précède l'exercice en cours dans la liste, ou
   * `null` quand la société n'en a encore terminé aucun (constituée dans l'exercice en cours).
   */
  dernierTermine: number | null
}

/**
 * LA RÈGLE — LES EXERCICES D'UNE SOCIÉTÉ.
 *
 * Du premier, celui qui contient la date de constitution, jusqu'à celui qui contient
 * aujourd'hui ; les deux bornes viennent de `fiscalYearForDate`. En dérivent : la liste
 * de l'étape 8, celle des Réglages, la pastille « Exercice en cours », la plage du
 * coffre, la garde d'appartenance des trois routes d'écriture (bulk-generate,
 * generate-item, upload) et, par `declarationDesExercices`, le moteur de complétude
 * que lisent Complétude et le tableau de bord. Calculée au SERVEUR : aucun écran ne
 * la recalcule dans le navigateur.
 *
 * ★ AUCUN PLAFOND. L'ancienne fenêtre s'arrêtait à l'exercice en cours moins sept. Rien
 * ne justifiait ce chiffre — huit années civiles fixes aux Réglages (b588c55), recopiées
 * sans raison — et comme les lignes enregistrées ne font que croître, chaque janvier
 * sortait de l'étape 8 l'exercice actif le plus ancien : actif, et invisible. Une
 * société constituée en 2000 a vingt-sept exercices ; les écrans les montrent et disent
 * combien sont suivis.
 *
 * ⚠️ « AUJOURD'HUI » EST LE JOUR DE L'HORLOGE QUI EXÉCUTE, ET LE LOT NE LE RÉPARE PAS.
 * Au serveur (Vercel, UTC), du dernier jour d'un exercice à 19 h (heure normale) ou
 * 20 h (heure avancée) jusqu'à minuit au Québec, le jour UTC a déjà changé : cette
 * fonction déclare alors l'exercice SUIVANT « en cours », pour toutes les sociétés.
 * Le corriger suppose de savoir dans quel fuseau vit l'« aujourd'hui » d'une société.
 *
 * ⛔ UNE DATE DE CONSTITUTION OU UNE FIN D'EXERCICE ABSENTE LÈVE. Les colonnes sont NOT
 * NULL ; inventer une borne — l'exercice en cours seul, ou huit ans — serait mentir.
 */
export function exercicesDeLaSociete(
  societe: SocieteExercices,
  today: Date = new Date()
): ExercicesDeLaSociete {
  const { incorporation_date, fiscal_year_end_month: mois, fiscal_year_end_day: jour } = societe
  if (!incorporation_date || !Number.isInteger(mois) || !Number.isInteger(jour)) {
    throw new Error(
      "exercicesDeLaSociete : date de constitution et fin d'exercice requises (NOT NULL depuis 20260913150000)."
    )
  }
  const premier = fiscalYearForDate(incorporation_date, mois, jour)
  const enCours = fiscalYearForDate(jourLocal(today), mois, jour)
  const exercices: number[] = []
  for (let y = premier; y <= enCours; y++) {
    exercices.push(y)
  }
  // ⛔ LU DANS LA LISTE, PAS RECALCULÉ. Le dernier exercice terminé est celui qui précède
  // l'exercice en cours dans la liste : aucune seconde façon de savoir ce qui est clos.
  const dernierTermine = exercices.length >= 2 ? exercices[exercices.length - 2] : null
  return { exercices, enCours, dernierTermine }
}

/**
 * THE SCORED SET = the STORED ACTIVE rows, EXTENDED FORWARD over the company's
 * declared years. Never backfills; never removes. Internal: `declarationDesExercices`
 * is the only way in.
 *
 * WHY COMBINE AT ALL: the two inputs are authoritative about different things.
 *   - The STORED rows are authoritative for WHAT THE USER CHOSE. They can archive
 *     a year in Settings, and `hold` rows exist; the caller has already filtered to
 *     status='active', so whatever arrives here is a deliberate user keep. This
 *     function must never second-guess or drop one.
 *   - The DECLARED years (`exercicesDeLaSociete`) are authoritative for WHAT THE
 *     CALENDAR SAYS.
 * Forward-only extension respects both: it never removes a year the user kept, and
 * never misses a year the clock has entered SINCE the newest kept one.
 *
 * ★ THE DEFECT THIS FIXES (dated, not hypothetical): the stored list is written
 * ONCE at onboarding (FiscalYearsSetup) and never refreshed. Settings only toggles
 * years that already exist; the upload route only inserts `hold` rows, which the
 * active filter excludes. Meanwhile the deadline feeder's year advances with the
 * calendar every year-end. They diverge on a schedule — Acme 2028-01-01, Wick
 * 2029-01-01 — with no user action required. Once diverged, OVERLAP_MERGE (which
 * joins on `${ruleKey}|${year}`) silently un-pairs and three already-fixed bugs
 * return by a new route: the REQ annual update renders twice, the federal
 * clear-gate can never fire, and Complétude stops tracking the newest year.
 *
 * ★ WHY EXTEND BY EVERY DECLARED YEAR AND NOT BY A SINGLE YEAR: by the time the gap
 * fires it is TWO years wide — the feeders need the CLOSED fiscal year while
 * Complétude needs the OPEN one. Adding only one closes one hole and leaves the
 * other (verified: Acme @2028-01-01, adding only the open 2028 misses the feeder's
 * 2027; adding only the feeder's 2027 misses the open 2028). Extending by the
 * declared years — the list step 8 offers and writes from — closes a gap of any
 * width, while the forward-only filter below keeps that extension from reaching
 * backwards.
 *
 * ★ RESIDUAL, ACCEPTED (Dom, 2026-07-26). Forward-only protects archived years
 * BELOW the newest kept year. It cannot distinguish "archived above the high-water
 * mark" from "never existed", so a user who archived their NEWEST year(s) WILL see
 * them return — e.g. kept [2019..2025] with 2026 archived → 2026 comes back; kept
 * [2020] alone → 2021..currentFY come back. Both are real but unlikely (archiving
 * RECENT years is the odd move), and both are strictly smaller than a full-window
 * backfill, which would resurrect every archived year in the window. The only way
 * to eliminate resurrection entirely is to extend by exactly one year (currentFY),
 * at the cost of Complétude lagging the open year. Dom weighed this and accepted
 * forward-only. If that trade is ever revisited, this is the paragraph to reread.
 * ⚠️ Depuis que l'exercice en cours n'est plus un interrupteur, ce résidu ne peut plus
 * le toucher. Il touche encore un exercice CLOS au-dessus de la plus haute ligne
 * active : archiver 2026 en 2027, pour une société inscrite en 2026, est défait.
 *
 * PURE: no clock, no DB read — the caller passes both lists.
 *
 * Returns ascending, de-duplicated.
 */
function fiscalYearSet(
  storedActiveYears: readonly number[],
  exercices: readonly number[]
): number[] {
  // ★ FORWARD-ONLY. Add only declared years NEWER than the newest stored one. A
  // plain union would BACKFILL — re-adding any archived year the company declares,
  // silently undoing a removal the user made in Settings. That is the same
  // unrequested-action-on-the-user's-behalf this fix exists to avoid; staleness only
  // ever occurs at the TOP end, so only the top end is repaired. Nothing the user
  // archived below the high-water mark comes back.
  // ★ UNE LISTE VIDE NE S'ÉTEND PAS. L'extension répare le HAUT d'une liste existante ; elle
  // n'en invente pas une à partir de rien. `-Infinity` en faisait tous les exercices déclarés,
  // et « Passer », qui n'écrit rien, imposait alors plus que « Terminer ». Sans ligne active,
  // `declarationDesExercices` rend les exercices verrouillés.
  if (storedActiveYears.length === 0) return []
  const highWaterMark = Math.max(...storedActiveYears)
  const extensions = exercices.filter((y) => y > highWaterMark)
  // Array.from, not [...set] — tsconfig sets no `target`, so spreading a Set would
  // demand --downlevelIteration. Array-literal spread of the two arrays is fine.
  return Array.from(new Set([...storedActiveYears, ...extensions])).sort((a, b) => a - b)
}

export interface DeclarationExercices extends ExercicesDeLaSociete {
  /**
   * Les exercices VERROUILLÉS : le dernier terminé, s'il existe, et l'exercice en cours.
   * Allumés, ils ne s'éteignent pas. Croissant.
   */
  verrouilles: number[]
  /**
   * Les exercices que le score lit. Croissant. Un exercice déclaré qui n'y figure pas est
   * NON SUIVI, et reste hors du score.
   */
  suivis: number[]
}

/**
 * LA DÉCLARATION COMPLÈTE : la règle, plus ce que le score en lit.
 *
 * L'étape 8 et les Réglages l'affichent ; le moteur de complétude
 * (requirement-completeness.ts) en tire son ensemble d'exercices. Une seule fonction,
 * donc un seul « N suivis sur M » : ce qu'un écran montre allumé est ce que le score lit.
 *
 * ⚖️ LE COCHAGE — décision de Dom, 2026-09-13 : « les exercices dont le produit réclame déjà
 * quelque chose ne sont pas des interrupteurs ; les plus anciens sont à vous. » L'exercice
 * en cours et le dernier terminé naissent cochés et ne se décochent pas ; tout ce qui est
 * plus ancien est montré décoché, et le client choisit ce qu'il rattrape. Une société
 * constituée en 2000 ouvre sur deux exercices cochés sur vingt-sept.
 *
 * ★ POURQUOI LE DERNIER TERMINÉ. Le générateur d'échéances réclame la mise à jour annuelle
 * au REQ de l'exercice clos, qu'on le suive ou non. Non suivi, cette ligne restait au tableau
 * de bord sans jumeau de complétude, sans bouton de téléversement, hors du verdict, et rien
 * ne pouvait la clore — mesuré le 2026-09-13 sur une société sans ligne d'exercice : 2025,
 * en retard depuis le 2026-06-30.
 *
 * ★ L'EXERCICE EN COURS EST TOUJOURS SUIVI : archivé, la prolongation le rendrait en silence,
 * et un acte d'aujourd'hui a besoin de lui pour tomber dans un exercice.
 *
 * ★ UNE LISTE SANS LIGNE ACTIVE VAUT LES EXERCICES VERROUILLÉS — jamais tous les exercices
 * déclarés. « Passer », qui n'écrit rien, mène exactement où mène « Terminer » sans rien
 * toucher.
 *
 * ⚠️ LE VERROU NE RAMÈNE PAS DE FORCE LE DERNIER TERMINÉ. Quand des lignes actives existent,
 * il est suivi s'il y figure ou si la prolongation le couvre. Une ligne d'avant ce lot qui
 * l'a archivé — ou une inscription qui l'a laissé sans ligne — est respectée : l'écran le
 * montre décoché, le client peut le rallumer, et il est alors verrouillé. Le forcer
 * défairait en silence un choix d'utilisateur. Le prix est écrit : pour cette société, la
 * ligne du REQ impossible à clore demeure. Le produit ne peut plus produire cet état — les
 * deux écrans refusent d'éteindre un exercice verrouillé. Deux retours existent sans venir
 * du verrou : le résidu de `fiscalYearSet` (un exercice archivé au-dessus de la plus haute
 * ligne active revient) et une liste sans ligne active, qui rend les deux exercices
 * verrouillés — là où elle rendait, avant ce lot, tous les exercices.
 *
 * ⛔ AUCUN FILTRE DES LIGNES HORS DE LA RÈGLE — décision de Dom, 2026-09-13. Une ligne
 * active enregistrée pour une année que la société ne déclare pas reste lue. La règle
 * empêche qu'il en naisse ; celles qui existent se suppriment à la main.
 */
export function declarationDesExercices(
  societe: SocieteExercices,
  actifsEnregistres: readonly number[],
  today: Date = new Date()
): DeclarationExercices {
  const { exercices, enCours, dernierTermine } = exercicesDeLaSociete(societe, today)
  const verrouilles = [dernierTermine, enCours].filter(
    (annee): annee is number => annee !== null && exercices.includes(annee)
  )
  const suivis =
    actifsEnregistres.length === 0 ? verrouilles.slice() : fiscalYearSet(actifsEnregistres, exercices)
  if (exercices.includes(enCours) && !suivis.includes(enCours)) {
    suivis.push(enCours)
    suivis.sort((a, b) => a - b)
  }
  return { exercices, enCours, dernierTermine, verrouilles, suivis }
}
