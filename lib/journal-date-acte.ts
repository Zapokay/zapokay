/**
 * OÙ UNE LIGNE DE JOURNAL PORTE LA DATE DE L'ACTE — UNE TABLE, PAR TYPE.
 *
 * ⚖️ LOT AC-2, 2026-09-22. Mesuré avant d'écrire : sur 576 lignes, 10 portent
 * un champ de date dans `details`, et 6 SEULEMENT portent la date DE L'ACTE.
 * Les 4 autres portent autre chose :
 *   · `director_added` / `officer_added` rétroactifs → `end_date` = la FIN du
 *     mandat, pas la nomination ;
 *   · `director_edited` / `officer_edited` → `appointment_date` et `end_date`
 *     = les dates CORRIGÉES, pas celle de la correction.
 *
 * ⛔⛔ D'OÙ UNE TABLE PAR TYPE, ET JAMAIS UNE LISTE DE CLÉS. La même clé change
 *   de sens selon l'événement : `appointment_date` serait la date de l'acte sur
 *   une nomination, et le CONTENU CORRIGÉ sur une correction. « La première
 *   date trouvée dans `details` » imprimerait la fin d'un mandat comme sa
 *   nomination.
 *
 * Trois réponses possibles, et la troisième ne se tait pas :
 *   'saisie'        l'acte est fait DANS ZapOkay : sa date EST celle de la ligne.
 *   { cles }        l'acte est daté ailleurs, et ces clés-là le portent —
 *                   vérifiées chez l'écrivain ET contre la table métier.
 *   'non_consignee' l'acte est daté ailleurs, et le journal ne l'a pas noté.
 *                   Le registre, lui, le porte.
 */

/**
 * ⚠️ CETTE UNION EST ÉCRITE À LA MAIN, ET ELLE NE VOIT PAS LA BASE.
 *
 * Elle recopie les valeurs de `activity_log_event_type_check`. `tsc` garantit
 * que la table ci-dessous a une entrée par membre de L'UNION — il ne sait rien
 * de la contrainte. ⛔ Ajouter une valeur à la contrainte ne fait donc échouer
 * AUCUNE compilation.
 *
 * ★ CE QUI LA RATTACHE À LA CONTRAINTE, C'EST UNE ASSERTION, PAS LE TYPE :
 * `lotAC()` de `check:inscription` compare les deux ENSEMBLES, à l'égalité
 * stricte, et nomme les manquants de chaque côté.
 * ⛔ ET CETTE ASSERTION LIT LA CONTRAINTE DÉCLARÉE DANS LES MIGRATIONS DU
 * DÉPÔT, PAS LA BASE VIVANTE. Elle voit un ajout fait par une migration ; elle
 * ne voit pas une contrainte modifiée à la main dans l'éditeur SQL. La règle
 * du dépôt interdit ce second chemin — « elle passe par db push ou elle
 * n'existe pas » —, et c'est cette règle, pas l'assertion, qui le ferme.
 */
export type TypeEvenement =
  | 'document_uploaded'
  | 'document_generated'
  | 'document_deleted'
  | 'director_added'
  | 'director_removed'
  | 'officer_added'
  | 'officer_removed'
  | 'officer_replaced'
  | 'shareholder_added'
  | 'shares_issued'
  | 'share_class_created'
  | 'company_created'
  | 'company_updated'
  | 'fiscal_year_activated'
  | 'fiscal_year_archived'
  | 'compliance_item_completed'
  | 'wizard_completed'
  | 'settings_updated'
  | 'director_edited'
  | 'officer_edited'
  | 'director_soft_deleted'
  | 'officer_soft_deleted'
  | 'shareholding_ended'
  | 'shareholding_edited'
  | 'share_transfer_created'
  | 'document_superseded'
  | 'person_identity_updated'
  | 'shareholder_entity_edited'
  | 'fiscal_years_defined'
  | 'fiscal_years_updated';

/** Le registre du livre où l'acte EST daté, quand le journal ne l'a pas noté. */
export type Registre = 'administrateurs' | 'dirigeants' | 'actionnaires';

/** Ce qu'une date d'acte ACCOMPLIT — chaque date affichée porte le sien. */
export type Effet = 'fin' | 'nomination' | 'transfert';

/**
 * UNE DATE, SON EFFET, ET LA PERSONNE QU'ELLE TOUCHE.
 * ⛔ JAMAIS UNE DATE NUE. Un acte à deux effets affichait sinon deux dates
 * l'une sous l'autre, et le lecteur devait deviner laquelle est l'entrée et
 * laquelle la sortie — le défaut vu au registre, où « transfert » paraissait
 * deux fois sans dire lequel.
 */
export interface EffetDate {
  cle: string;
  effet: Effet;
  /** `sortant` / `entrant` : quel nom de la ligne porte cet effet. `null`
   *  quand l'acte ne touche pas une personne nommée (un transfert). */
  personne: 'sortant' | 'entrant' | null;
}

export type DateDeLActe =
  | 'saisie'
  | { effets: readonly EffetDate[] }
  /** `registre` null : l'acte n'est daté dans AUCUN registre du livre. */
  | { nonConsignee: Registre | null };

const SAISIE = 'saisie' as const;
const nonConsignee = (registre: Registre | null) => ({ nonConsignee: registre });

export const DATE_DE_L_ACTE: Record<TypeEvenement, DateDeLActe> = {
  // ── Actes faits DANS ZapOkay : l'acte et la ligne coïncident. ──
  document_uploaded: SAISIE,
  document_generated: SAISIE,
  document_deleted: SAISIE,
  document_superseded: SAISIE,
  settings_updated: SAISIE,
  wizard_completed: SAISIE,
  company_created: SAISIE, // l'inscription au livre, pas la constitution
  company_updated: SAISIE,
  fiscal_year_activated: SAISIE,
  fiscal_year_archived: SAISIE,
  fiscal_years_defined: SAISIE,
  fiscal_years_updated: SAISIE,
  compliance_item_completed: SAISIE,
  person_identity_updated: SAISIE,
  shareholder_entity_edited: SAISIE,
  shareholding_edited: SAISIE,
  director_soft_deleted: SAISIE,
  officer_soft_deleted: SAISIE,
  /* ⛔ CORRECTIONS : leurs `appointment_date` / `end_date` décrivent ce qui a
     été CORRIGÉ (`EditFormer*Modal:137-138`, `:169-170`). L'acte est la
     correction, et sa date est la saisie. Ces clés ne sont jamais lues. */
  director_edited: SAISIE,
  officer_edited: SAISIE,

  // ── Actes datés ailleurs, dont le journal PORTE la date. ──
  /* `transfer_shares()` écrit `p_transfer_date` ; mesuré 5/5 identique à
     `share_transfers.transfer_date`. */
  share_transfer_created: {
    effets: [{ cle: 'transfer_date', effet: 'transfert', personne: null }],
  },
  /**
   * ⚖️ UN ACTE À DEUX EFFETS, ET LES DEUX DATES S'AFFICHENT — DOM, 2026-09-22.
   * « Fin — <sortant> » et « Nomination — <entrant> », chacune étiquetée par
   * PERSONNE. ⛔ En choisir une en silence perdrait la moitié de l'acte : c'est
   * ce qui a tué l'hypothèse du déclencheur au lot W, et c'est la forme de la
   * phrase d'Harvey sur la conversion — « si votre modèle la traite comme un
   * simple mouvement, la seconde moitié se perd ».
   * ★ LA PREUVE EST L'ÉCRIVAIN : `ReplaceOfficerModal` a deux champs de date
   * INDÉPENDANTS (l.295 et 306), et écrit `end_date` et `start_date` à partir
   * des MÊMES variables qu'il écrit dans `officer_appointments` (l.158/197 et
   * l.174/199). Elles peuvent différer.
   */
  officer_replaced: {
    effets: [
      { cle: 'end_date', effet: 'fin', personne: 'sortant' },
      { cle: 'start_date', effet: 'nomination', personne: 'entrant' },
    ],
  },

  // ── Actes datés ailleurs, que le journal N'A PAS notés. Le registre, oui. ──
  /* ⛔ `appointment_date` est ABSENTE de leurs `details`, et le `end_date` des
     rétroactifs est la FIN du mandat (`AddDirectorModal:212`) — jamais lu.
     ⚠️ `officer_added` A RECOUVERT UN REMPLACEMENT — L'ÉCRIVAIN EST CORRIGÉ,
     LES LIGNES RESTENT. La branche `replaceConflict` d'`AddOfficerModal`
     écrivait un remplacement sous ce type, sans aucune des deux dates ; depuis
     le lot 4 (2026-09-23) cette fenêtre PASSE LA MAIN à `ReplaceOfficerModal`
     et n'écrit plus que des nominations.
     ⛔⛔ MAIS LES LIGNES DÉJÀ ÉCRITES NE SE RÉÉCRIVENT PAS, ET C'EST LA LOI, PAS
     UN CHOIX D'INGÉNIERIE : art. 21 de la Loi sur la publicité légale
     (C-1.1) — un registre se COMPLÈTE, il ne se corrige pas en silence. La
     ligne de Phil The Bill garde donc son type et son absence de dates ; sa
     fiche restera sans date de fin, et c'est le registre qui dit la vérité de
     ce jour-là.
     ★ CE RANG RESTE DONC JUSTE POUR LE PASSÉ : « non consignée — voir le
     registre des dirigeants ». Il n'aura plus de nouvelles occurrences. */
  director_added: nonConsignee('administrateurs'),
  director_removed: nonConsignee('administrateurs'),
  officer_added: nonConsignee('dirigeants'),
  officer_removed: nonConsignee('dirigeants'),
  shareholder_added: nonConsignee('actionnaires'),
  shares_issued: nonConsignee('actionnaires'),
  shareholding_ended: nonConsignee('actionnaires'),
  /* ⛔ AUCUN REGISTRE : la date de création d'une catégorie n'est PAS une
     colonne des registres exportés — elle vit dans les statuts. Renvoyer à un
     registre qui ne la porte pas serait un faux chemin. */
  share_class_created: nonConsignee(null),
};

/** Ce que la ligne affichera, décidé ICI et nulle part dans le rendu. */
export type LectureDateDeLActe =
  | { forme: 'saisie' }
  | {
      forme: 'dates';
      lignes: { effet: Effet; personne: 'sortant' | 'entrant' | null; date: string | null }[];
    }
  | { forme: 'non_consignee'; registre: Registre | null };

/**
 * LIT LA DATE DE L'ACTE D'UNE LIGNE — par la table, jamais par la clé.
 *
 * ⛔ UN TYPE INCONNU LÈVE. La contrainte `activity_log_event_type_check` rend
 * le cas impossible en base, et `lotAC()` tient la table égale à la contrainte.
 * Un cas impossible doit échouer, pas être rendu déterministe.
 * ⚪ UNE CLÉ DÉCLARÉE MAIS ABSENTE rend `date: null` pour CETTE ligne, pas pour
 * l'acte entier : l'effet reste nommé, et le rendu dit « non consignée ».
 */
export function lireDateDeLActe(
  eventType: string,
  details: Record<string, unknown> | null,
): LectureDateDeLActe {
  const regle = (DATE_DE_L_ACTE as Record<string, DateDeLActe | undefined>)[eventType];
  if (regle === undefined) throw new Error(`lireDateDeLActe: unknown event type "${eventType}"`);
  if (regle === 'saisie') return { forme: 'saisie' };
  if ('nonConsignee' in regle) return { forme: 'non_consignee', registre: regle.nonConsignee };
  return {
    forme: 'dates',
    lignes: regle.effets.map((e) => {
      const v = details?.[e.cle];
      return { effet: e.effet, personne: e.personne, date: typeof v === 'string' && v ? v : null };
    }),
  };
}
