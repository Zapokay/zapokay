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

export type DateDeLActe =
  | 'saisie'
  | 'non_consignee'
  | { cles: readonly string[] };

const SAISIE = 'saisie' as const;
const NON_CONSIGNEE = 'non_consignee' as const;

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
  share_transfer_created: { cles: ['transfer_date'] },
  /* ⚠️ DEUX dates, deux champs INDÉPENDANTS dans `ReplaceOfficerModal`
     (l.295 et 306) : la fin du sortant et la nomination de l'entrant. Elles
     peuvent différer ; on n'en choisit pas une en silence. */
  officer_replaced: { cles: ['end_date', 'start_date'] },

  // ── Actes datés ailleurs, que le journal N'A PAS notés. Le registre, oui. ──
  /* ⛔ `appointment_date` est ABSENTE de leurs `details`, et le `end_date` des
     rétroactifs est la FIN du mandat (`AddDirectorModal:212`) — jamais lu. */
  director_added: NON_CONSIGNEE,
  officer_added: NON_CONSIGNEE,
  director_removed: NON_CONSIGNEE,
  officer_removed: NON_CONSIGNEE,
  shareholder_added: NON_CONSIGNEE,
  shares_issued: NON_CONSIGNEE,
  share_class_created: NON_CONSIGNEE,
  shareholding_ended: NON_CONSIGNEE,
};
