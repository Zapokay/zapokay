/**
 * AUCUNE DATE JURIDIQUE DEVINÉE — un champ date de formulaire naît VIDE.
 *
 * Run via:
 *   npm run check:dates                 → monte chaque formulaire recensé, rc=1 si un champ date naît rempli
 *   npm run check:dates -- --self-test  → vérifie l'OUTIL, ne monte pas le dépôt
 *
 * ── LA DÉCISION ─────────────────────────────────────────────────────────────
 * Décision de Dom, 2026-09-12 : le système cesse de deviner une date juridique.
 * « Quand ce mandat a-t-il pris fin », « quand ces actions ont-elles été
 * émises » — personne d'autre que l'utilisateur ne connaît la réponse.
 * ⛔ Le défaut a déjà écrit faux : deux mandats d'Acme Test inc. portent
 * `end_date` 2026-05-26 pour une saisie du 2026-05-25 à 21 h 21 et 21 h 39 —
 * `toISOString()` rend la date UTC, qui a déjà basculé à Montréal après 20 h.
 *
 * ── CE QUE CE SCRIPT AFFIRME, ET COMMENT ────────────────────────────────────
 * Il MONTE chaque formulaire recensé (react-dom/server, sans navigateur) et lit
 * chaque <input type="date"> rendu. Les fixtures sont HOSTILES : chaque source
 * dont le dépôt a déjà su faire un défaut est FOURNIE — date de constitution,
 * date d'émission de la détention source, date de nomination du mandat. Un
 * défaut réintroduit depuis l'une d'elles la retrouve, et le champ naît rempli.
 *
 * Il RECENSE aussi : tout fichier de app/ ou components/ qui porte le littéral
 * `type="date"` doit figurer dans RECENSEMENT, sous une catégorie et avec sa
 * raison. Un formulaire nouveau et non recensé fait échouer le script.
 *
 * ── ⛔ SES ANGLES MORTS — écrits ici, parce qu'une garde muette sur ce qu'elle
 *    ne voit pas est une fausse assurance ────────────────────────────────────
 * Les sept formes sous lesquelles ce dépôt a deviné une date :
 *   1. useState(expression)                          → vue
 *   2. constante locale passée à useState            → vue
 *   3. constante de module passée à un état          → vue, SI l'état atteint un champ
 *   4. graine dans un objet d'état initial           → vue
 *   5. RÉINJECTION PAR UN GESTIONNAIRE D'ÉVÉNEMENT   → ⛔ INVISIBLE
 *   6. repli au rendu `value={x || aujourdhui}`      → vue
 *   7. ÉCRITURE SANS CHAMP                           → ⛔ INVISIBLE
 *
 * ⛔ FORME 5 — un montage ne clique pas. `setAppointmentDate(defaut)` dans
 *    l'interrupteur « Toujours en poste? » (AddOfficerModal et AddDirectorModal
 *    jusqu'au 2026-09-12) remplit le champ APRÈS le montage. Réintroduit, ce
 *    script rend rc=0 — épreuve du 2026-09-12.
 * ⛔ FORME 7 — il n'y a aucun champ à lire. `appointment_date:
 *    incorporationDate || today` (OnboardingFlow, étape 6, jusqu'au 2026-09-12)
 *    écrivait sans rien montrer. Réintroduit, ce script rend rc=0 — épreuve du
 *    2026-09-12. L'état `incorporationDate` du même fichier n'atteint plus
 *    aucun champ : un défaut qui y reviendrait est invisible pour la même raison.
 * Et aussi :
 *   · une graine réintroduite SEULEMENT dans une fonction d'ajout
 *     (addShareholder, addDirector) ne tourne pas au montage ;
 *   · une prop réintroduite que la fixture ne fournit pas (`?? ''`) ;
 *   · les formulaires NON MONTÉS du recensement, chacun avec sa raison ;
 *   · les écritures serveur (routes, RPC) — ce ne sont pas des formulaires ;
 *   · le recensement lit du TEXTE : un champ date écrit sans le littéral
 *     `type="date"` échappe au recensement — même limite que check:titres.
 *
 * ⛔ NI CI NI CROCHET DANS CE DÉPÔT — même discipline que check:titres : à
 * lancer à côté de `tsc`.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import messages from '@/messages/fr.json';
import { VALEUR_ENTITE_VIDE } from '@/lib/entity-payload';
import EndShareholdingModal from '@/components/shareholders/EndShareholdingModal';
import RemoveOfficerModal from '@/components/officers/RemoveOfficerModal';
import RemoveDirectorModal from '@/components/directors/RemoveDirectorModal';
import ReplaceOfficerModal from '@/components/officers/ReplaceOfficerModal';
import TransferShareholdingModal from '@/components/shareholders/TransferShareholdingModal';
import AddOfficerModal from '@/components/officers/AddOfficerModal';
import AddDirectorModal from '@/components/directors/AddDirectorModal';
import StepDirectors from '@/components/onboarding/StepDirectors';
import StepShareholders from '@/components/onboarding/StepShareholders';
import IssueSharesModal from '@/components/shareholders/IssueSharesModal';
import { StepCompany } from '@/components/onboarding/StepCompany';
import EntityForm from '@/components/shareholders/EntityForm';
import EditFormerOfficerModal from '@/components/officers/EditFormerOfficerModal';
import EditFormerDirectorModal from '@/components/directors/EditFormerDirectorModal';
import EditFormerShareholdingModal from '@/components/shareholders/EditFormerShareholdingModal';
import EditShareholdingModal from '@/components/shareholders/EditShareholdingModal';
import GenerateLifecycleResolutionDialog from '@/components/lifecycle/GenerateLifecycleResolutionDialog';

const RACINE = process.cwd();
const ARBRES = ['app', 'components'];
const DATE_LITTERALE = /type=["']date["']/;

/**
 * Les composants appellent `createClient()` au rendu. Aucune requête ne part
 * d'un montage serveur (les effets ne tournent pas) : il faut seulement que le
 * client puisse se construire.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:1';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'cle-factice-check-dates';

/**
 * ⚠️ `React` GLOBAL — MESURÉ, PAS SUPPOSÉ. tsconfig déclare `jsx: preserve` :
 * c'est Next qui compile le JSX. tsx retombe alors sur la transformation
 * CLASSIQUE, qui appelle `React.createElement` sur un `React` que les
 * composants n'importent pas. Premier montage sans cette ligne :
 * `ReferenceError: React is not defined` (EndShareholdingModal.tsx:122).
 */
Object.assign(globalThis, { React });

/* ═══════════════════════════════════════════════════════════════════════════
   1. CE QU'ON LIT — les <input type="date"> d'un rendu, et leur valeur
   ═══════════════════════════════════════════════════════════════════════════ */

interface Lecture { total: number; remplis: string[] }

function lireDates(html: string): Lecture {
  let total = 0;
  const remplis: string[] = [];
  for (const m of Array.from(html.matchAll(/<input\b[^>]*>/g))) {
    if (!/\stype="date"/.test(m[0])) continue;
    total++;
    // `\s` et non `\b` : « data-value » n'est pas une valeur.
    const valeur = /\svalue="([^"]*)"/.exec(m[0]);
    if (valeur && valeur[1] !== '') remplis.push(valeur[1]);
  }
  return { total, remplis };
}

function rendre(element: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, {
      locale: 'fr', messages, timeZone: 'America/Toronto', children: element,
    }),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. LES FIXTURES — partielles, et HOSTILES
   ═══════════════════════════════════════════════════════════════════════════ */

const DATE_HOSTILE = '2020-01-15';
const rien = () => {};
const accepte = async () => true;

/**
 * ⚠️ UN SEUL TRANSTYPAGE, ET IL EST ICI. Les fixtures sont partielles — une
 * détention n'a pas besoin de ses quinze colonnes pour naître — et chaque
 * montage reçoit en plus `incorporationDate`, la source que quatre formulaires
 * avaient transformée en défaut. Un composant qui n'accepte plus la prop
 * l'ignore ; un défaut réintroduit la retrouve.
 */
function el(composant: unknown, props: Record<string, unknown>): React.ReactElement {
  const C = composant as React.ComponentType<Record<string, unknown>>;
  return React.createElement(C, { incorporationDate: DATE_HOSTILE, ...props });
}

const PERSONNE = {
  id: 'p1', company_id: 'c1', full_name: 'Ana Martin', email: null, phone: null,
  address_line1: null, address_line2: null, address_city: 'Montréal', address_province: 'QC',
  address_postal_code: null, address_country: 'CA', is_canadian_resident: true,
  created_at: '', updated_at: '',
};
const CLASSE = {
  id: 'k1', company_id: 'c1', name: 'Catégorie A', name_en: null, type: 'common',
  voting_rights: true, votes_per_share: 1, max_quantity: null, created_at: '',
};
function detention(issueDate: string) {
  return {
    id: 's1', company_id: 'c1', share_class_id: 'k1', quantity: 100, issue_date: issueDate,
    issue_price_per_share: 1, certificate_number: '001', created_at: '', end_date: null,
    end_reason: null, source: 'direct_issuance', share_class: CLASSE, person: PERSONNE,
    holders: [{ holder_type: 'individual', person_id: 'p1', entity_id: null, display_order: 0, person: PERSONNE, entity: null }],
  };
}
function mandat(appointmentDate: string) {
  return {
    id: 'd1', company_id: 'c1', person_id: 'p1', appointment_date: appointmentDate, end_date: null,
    end_reason: null, is_active: true, created_at: '', deleted_at: null, person: PERSONNE,
  };
}
function nomination(appointmentDate: string) {
  return { ...mandat(appointmentDate), title: 'treasurer', custom_title: null, is_primary_signing_authority: false };
}
const DONNEES_INSCRIPTION = {
  language: 'fr',
  company: {
    legalName: '', legalNameEn: '', incorporationType: 'LSAQ', incorporationNumber: '',
    corporationNumber: '', incorporationDate: '', province: 'QC', fiscalYearEndMonth: 12, fiscalYearEndDay: 31,
  },
  officer: { fullName: '', role: 'director', startDate: '' },
};

/* ═══════════════════════════════════════════════════════════════════════════
   3. LE RECENSEMENT — chaque fichier porteur d'un champ date, et SA raison
   ═══════════════════════════════════════════════════════════════════════════ */

type Categorie = 'création' | 'édition' | 'non monté' | 'exception';
interface Entree {
  categorie: Categorie;
  raison: string;
  /** Absent pour « non monté » — la raison dit pourquoi. */
  element?: () => React.ReactElement;
}

const CREATION = "un fait que seul l'utilisateur connaît — le champ naît vide";
/**
 * ⚠️ UNE FICHE SANS DATE, PAS UNE FICHE RÉELLE. Un formulaire d'édition montre
 * la fiche : sa valeur n'est pas un défaut. Monté sur une fiche VIDE, il doit
 * rester vide — c'est ce qui attrape un `|| aujourdhui` glissé dans l'édition.
 */
const EDITION = 'édition — la valeur est la fiche ; montée sur une fiche sans date, elle reste vide';

const RECENSEMENT = new Map<string, Entree>([
  ['components/shareholders/EndShareholdingModal.tsx', {
    categorie: 'création', raison: `date de cessation — ${CREATION}`,
    element: () => el(EndShareholdingModal, { shareholding: detention(DATE_HOSTILE), onClose: rien, onSuccess: rien }),
  }],
  ['components/officers/RemoveOfficerModal.tsx', {
    categorie: 'création', raison: `fin de mandat d'un dirigeant — ${CREATION}`,
    element: () => el(RemoveOfficerModal, { officer: nomination(DATE_HOSTILE), onClose: rien, onSuccess: rien }),
  }],
  ['components/directors/RemoveDirectorModal.tsx', {
    categorie: 'création', raison: `fin de mandat d'un administrateur — ${CREATION}`,
    element: () => el(RemoveDirectorModal, { director: mandat(DATE_HOSTILE), onClose: rien, onSuccess: rien }),
  }],
  ['components/officers/ReplaceOfficerModal.tsx', {
    categorie: 'création', raison: `fin du sortant ET entrée en poste de l'entrant — deux faits, ${CREATION}`,
    element: () => el(ReplaceOfficerModal, { officer: nomination(DATE_HOSTILE), companyId: 'c1', residencyApplies: true, onClose: rien, onSuccess: rien }),
  }],
  ['components/shareholders/TransferShareholdingModal.tsx', {
    categorie: 'création', raison: `date du transfert — ${CREATION}`,
    element: () => el(TransferShareholdingModal, { shareholding: detention(DATE_HOSTILE), residencyApplies: true, onClose: rien, onSuccess: rien }),
  }],
  ['components/officers/AddOfficerModal.tsx', {
    categorie: 'création', raison: `date de nomination — ${CREATION}`,
    element: () => el(AddOfficerModal, { companyId: 'c1', residencyApplies: true, onClose: rien, onSuccess: rien }),
  }],
  ['components/directors/AddDirectorModal.tsx', {
    categorie: 'création', raison: `date de nomination — ${CREATION}`,
    element: () => el(AddDirectorModal, { companyId: 'c1', existingDirectorPersonIds: [], residencyApplies: true, onClose: rien, onSuccess: rien }),
  }],
  ['components/onboarding/StepDirectors.tsx', {
    categorie: 'création', raison: `date de nomination à l'inscription — ${CREATION}`,
    element: () => el(StepDirectors, { locale: 'fr', userFullName: 'Ana Martin', residencyApplies: true, onContinue: accepte, onSkip: rien }),
  }],
  ['components/onboarding/StepShareholders.tsx', {
    categorie: 'création', raison: `date d'émission à l'inscription — ${CREATION}`,
    element: () => el(StepShareholders, {
      locale: 'fr',
      // Hostile : la pré-saisie « un administrateur → un actionnaire » recopie
      // la personne ; une date recopiée de sa nomination naîtrait remplie.
      directors: [{ fullName: 'Ana Martin', appointmentDate: DATE_HOSTILE, addressCity: '', addressCountry: '', isCanadianResident: null }],
      onContinue: accepte, onSkip: rien,
    }),
  }],
  ['components/shareholders/IssueSharesModal.tsx', {
    categorie: 'création', raison: `date d'émission — ${CREATION} (vide depuis « Atom 3 polish »)`,
    element: () => el(IssueSharesModal, { companyId: 'c1', shareClasses: [CLASSE], nextCertificateNumber: 1, residencyApplies: true, onClose: rien, onSuccess: rien }),
  }],
  ['components/onboarding/StepCompany.tsx', {
    categorie: 'création', raison: `date de constitution, exigée à l'étape 2 — ${CREATION}`,
    element: () => el(StepCompany, { data: DONNEES_INSCRIPTION, setData: rien, onNext: rien, onBack: rien, locale: 'fr' }),
  }],
  ['components/shareholders/EntityForm.tsx', {
    categorie: 'création', raison: `date de constitution d'une entité — ${CREATION}`,
    element: () => el(EntityForm, { value: VALEUR_ENTITE_VIDE, onChange: rien }),
  }],
  ['components/officers/EditFormerOfficerModal.tsx', {
    categorie: 'édition', raison: EDITION,
    element: () => el(EditFormerOfficerModal, { appointment: nomination(''), onClose: rien, onSuccess: rien }),
  }],
  ['components/directors/EditFormerDirectorModal.tsx', {
    categorie: 'édition', raison: EDITION,
    element: () => el(EditFormerDirectorModal, { mandate: mandat(''), onClose: rien, onSuccess: rien }),
  }],
  ['components/shareholders/EditFormerShareholdingModal.tsx', {
    categorie: 'édition', raison: EDITION,
    element: () => el(EditFormerShareholdingModal, { shareholding: detention(''), isTransfer: false, transferDate: null, onClose: rien, onSuccess: rien }),
  }],
  ['components/shareholders/EditShareholdingModal.tsx', {
    categorie: 'édition', raison: EDITION,
    element: () => el(EditShareholdingModal, { shareholding: detention(''), shareClasses: [CLASSE], onClose: rien, onSuccess: rien }),
  }],
  ['components/dashboard/SettingsClient.tsx', {
    categorie: 'non monté',
    raison: "édition de la société : le champ n'existe qu'APRÈS un clic sur le cadenas — la forme 5 pour cette garde. Sa valeur initiale est la fiche, `incorporationDate ?? ''` (SettingsClient.tsx:110)",
  }],
  ['components/onboarding/StepOfficer.tsx', {
    categorie: 'non monté',
    raison: "code mort : aucun fichier ne l'importe. Ce script le VÉRIFIE — il échoue le jour où quelqu'un l'importe, et il faudra alors le monter",
  }],
  ['components/lifecycle/GenerateLifecycleResolutionDialog.tsx', {
    categorie: 'exception',
    raison: "⛔ UNE DETTE, PAS UN DROIT. Décision de Dom (2026-09-12) : la date d'adoption vient de la SIGNATURE, pas de la génération. Ce dialogue la pré-remplit encore à aujourd'hui, et les gabarits du cycle de vie l'impriment (« Adoptée le … », lib/pdf/lifecycle-templates.ts). Laissé hors du lot du 2026-09-12 par décision de périmètre. Le jour où ce chemin est aligné, le champ naît vide et ce script exige qu'on retire l'exception.",
    element: () => el(GenerateLifecycleResolutionDialog, {
      companyId: 'c1', docKey: 'director_departure', instrument: 'board', eventId: 'e1',
      personName: 'Ana Martin', roleLabel: 'Administratrice', eventDate: DATE_HOSTILE,
      language: 'fr', onClose: rien, onSuccess: rien,
    }),
  }],
]);

/** ⛔ AU PLUS UNE, et nommée — décision du 2026-09-12. Ce n'est pas un réglage. */
const EXCEPTIONS_MAX = 1;

/* ═══════════════════════════════════════════════════════════════════════════
   4. L'AUTO-TEST — ce script a-t-il le droit de dire « vide » ?
   ═══════════════════════════════════════════════════════════════════════════ */

function autoTest(): boolean {
  let ok = true;
  const dire = (bon: boolean, quoi: string) => {
    if (!bon) ok = false;
    console.log(`  ${bon ? '✔' : '⛔'} ${quoi}`);
  };

  const vide = lireDates('<input type="date" value=""/>');
  dire(lireDates('<input type="date" value="2020-01-15"/>').remplis.length === 1, 'champ date rempli                → vu');
  dire(lireDates('<input value="2020-01-15" class="x" type="date"/>').remplis.length === 1, "attributs dans l'autre ordre     → vu");
  dire(vide.total === 1 && vide.remplis.length === 0, 'champ date vide                  → compté, pas accusé');
  dire(lireDates('<input type="text" value="2020-01-15"/>').total === 0, 'champ texte                      → ignoré');
  dire(lireDates('<input data-value="x" type="date"/>').remplis.length === 0, '« data-value »                   → pas une valeur');

  // Le montage lui-même, de bout en bout : un composant qui DEVINE, un qui ne devine pas.
  const champ = (depart: string) =>
    function Champ() {
      const [d, setD] = React.useState(depart);
      return React.createElement('input', {
        type: 'date', value: d,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD(e.target.value),
      });
    };
  dire(lireDates(rendre(React.createElement(champ(DATE_HOSTILE)))).remplis.length === 1, 'montage : useState(date)         → vu');
  dire(lireDates(rendre(React.createElement(champ('')))).remplis.length === 0, "montage : useState('')           → accepté");
  return ok;
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. LE BALAYAGE ET LES MONTAGES
   ═══════════════════════════════════════════════════════════════════════════ */

function fichiers(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom === 'node_modules' || nom.startsWith('.')) continue;
      fichiers(p, out);
    } else if (/\.tsx?$/.test(nom)) {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  console.log('AUTO-TEST — ce script a-t-il le droit de dire « vide » ?');
  const sain = autoTest();
  console.log(
    sain
      ? "  → l'outil est vérifié ; il a le droit de conclure.\n"
      : "  → ⛔ L'OUTIL EST CASSÉ. Sa conclusion ne vaudrait rien ; il se tait.\n",
  );
  if (!sain) {
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--self-test')) {
    console.log("--self-test : l'outil est vérifié, le dépôt n'est pas monté.");
    return;
  }

  let echec = false;
  const tous: string[] = [];
  for (const arbre of ARBRES) tous.push(...fichiers(join(RACINE, arbre)));
  const porteurs = tous
    .filter((p) => DATE_LITTERALE.test(readFileSync(p, 'utf8')))
    .map((p) => relative(RACINE, p))
    .sort();

  console.log(`RECENSEMENT — ${tous.length} fichiers balayés, ${porteurs.length} portent un champ date`);
  for (const f of porteurs.filter((p) => !RECENSEMENT.has(p))) {
    console.log(`  ⛔ NON RECENSÉ : ${f} — monte-le ici, ou dis pourquoi il ne l'est pas`);
    echec = true;
  }
  for (const f of Array.from(RECENSEMENT.keys()).filter((p) => !porteurs.includes(p))) {
    console.log(`  ⛔ RECENSÉ SANS CHAMP DATE : ${f} — l'entrée est périmée, retire-la`);
    echec = true;
  }
  const exceptions = Array.from(RECENSEMENT.values()).filter((e) => e.categorie === 'exception').length;
  if (exceptions > EXCEPTIONS_MAX) {
    console.log(`  ⛔ ${exceptions} EXCEPTIONS — au plus ${EXCEPTIONS_MAX}, décision du 2026-09-12`);
    echec = true;
  }

  // Le code mort doit le rester, ou être monté.
  const importeurs = tous
    .filter((p) => /from\s+['"][^'"]*\/StepOfficer['"]|import\(\s*['"][^'"]*\/StepOfficer['"]\s*\)/.test(readFileSync(p, 'utf8')))
    .map((p) => relative(RACINE, p));
  if (importeurs.length > 0) {
    console.log(`  ⛔ StepOfficer EST DÉCLARÉ MORT ET IL EST IMPORTÉ : ${importeurs.join(', ')} — monte-le`);
    echec = true;
  }

  console.log('\nMONTAGES — chaque <input type="date"> rendu, et sa valeur');
  for (const [fichier, e] of Array.from(RECENSEMENT)) {
    if (!e.element) {
      console.log(`  ⚪ NON MONTÉ   ${fichier}`);
      console.log(`     ${e.raison}`);
      continue;
    }
    let lecture: Lecture;
    try {
      lecture = lireDates(rendre(e.element()));
    } catch (err) {
      console.log(`  ⛔ MONTAGE IMPOSSIBLE  ${fichier} — la garde ne peut pas conclure : ${(err as Error).message}`);
      echec = true;
      continue;
    }
    if (lecture.total === 0) {
      console.log(`  ⛔ MONTAGE MUET  ${fichier} — aucun champ date rendu : ce montage ne prouve rien`);
      echec = true;
      continue;
    }
    if (e.categorie === 'exception') {
      if (lecture.remplis.length === 0) {
        console.log(`  ⛔ EXCEPTION SANS OBJET  ${fichier} — le champ naît vide : retire l'exception`);
        echec = true;
      } else {
        console.log(`  ⚪ EXCEPTION DOCUMENTÉE  ${fichier} — naît à ${lecture.remplis.join(', ')}`);
        console.log(`     ${e.raison}`);
      }
      continue;
    }
    if (lecture.remplis.length > 0) {
      console.log(`  ⛔ ${fichier} — ${lecture.remplis.length}/${lecture.total} champ(s) date né(s) REMPLI(S) : ${lecture.remplis.join(', ')}`);
      echec = true;
    } else {
      console.log(`  ✔ ${e.categorie.padEnd(9)} ${fichier} — ${lecture.total} champ(s) date, vide(s)`);
    }
  }

  if (echec) {
    console.log('\n  ⛔ UNE DATE JURIDIQUE EST DEVINÉE, OU LA GARDE NE PEUT PAS CONCLURE.');
    console.log("    Le champ naît vide ; si l'écriture l'exige, le bouton le refuse (voir StepShareholders).");
    process.exitCode = 1;
    return;
  }
  console.log('\n  ✔ AUCUN CHAMP DATE NE NAÎT REMPLI, HORS UNE EXCEPTION NOMMÉE.');
  console.log("    ⛔ Ce script ne voit ni la forme 5 (réinjection par un gestionnaire)");
  console.log("    ni la forme 7 (écriture sans champ) — lis l'en-tête avant de conclure.");
}

main();
