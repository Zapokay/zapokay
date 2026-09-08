/**
 * LA RÉSIDENCE CANADIENNE S'APPLIQUE-T-ELLE ? — le seul endroit du dépôt
 * qui réponde à cette question.
 *
 * ★ POURQUOI UNE FONCTION POUR UNE COMPARAISON. Parce que la question est
 * posée à sept endroits — le gate du registre, la pastille du seuil, le champ
 * de saisie des trois surfaces, le badge de la carte, l'inscription — et
 * qu'une comparaison recopiée sept fois est sept occasions d'écrire la
 * mauvaise. Ici il n'y en a qu'une, et c'est celle-ci.
 *
 * ⚠️ `=== 'CBCA'` ET JAMAIS `!== 'LSA'`, ET LA RAISON N'EST PAS STYLISTIQUE.
 * Deux vocabulaires cohabitent : la BASE ne connaît que 'LSA' | 'CBCA'
 * (companies_incorporation_type_check), tandis que le flux d'inscription
 * manipule 'LSAQ' | 'CBCA' et ne convertit qu'à l'écriture
 * (StepCompany.tsx:32). Une liste de refus sur 'LSA' laisserait donc passer
 * 'LSAQ' — silencieusement vrai, donc un champ fédéral ouvert à une société
 * québécoise. 'CBCA' est la SEULE valeur identique dans les deux
 * vocabulaires : c'est ce qui rend la liste d'admission juste, et c'est
 * pourquoi l'inscription peut appeler cette fonction sans convertir.
 *
 * ⛔ ET TOUT CE QUI N'EST PAS 'CBCA' REND `false`, Y COMPRIS L'INCONNU.
 * Un régime nul, une valeur inattendue, un régime futur ajouté au CHECK :
 * tous tombent du côté qui n'affirme rien. On n'ouvre pas un champ fédéral
 * ni n'imprime une colonne de résidence pour une société dont on ne sait pas
 * la loi. Échec fermé, délibérément — pas par chance.
 *
 * FONDEMENT. LCSA art. 105(3) exige qu'au moins 25 % des administrateurs
 * soient des résidents canadiens. La LSAQ n'impose aucune exigence
 * équivalente — vérifié sur l'art. 110 LSAQ, qui porte l'élection, la durée
 * du mandat et le quorum, et rien sur la résidence.
 */
export function residencyApplies(
  /**
   * ⚠️ REQUIS ET SANS DÉFAUT. Un défaut ferait qu'un appelant qui l'oublie
   * reçoit une réponse en silence — et dans le sens dommageable, puisque
   * `false` ferme un champ que la loi fédérale exige.
   *
   * `string` et non `string | null` : companies.incorporation_type est NOT
   * NULL en base. Un appelant qui n'a pas encore chargé sa société doit
   * décider lui-même quoi passer, pas hériter d'un défaut muet.
   */
  incorporationType: string,
): boolean {
  return incorporationType === 'CBCA';
}

/**
 * LE VERDICT DE CONFORMITE — trois branches, et l'ordre compte.
 *
 * ⛔ « UN SEUL NON DECLARE ⇒ NON VERIFIABLE » SERAIT FAUX. Le seuil peut etre
 * franchi avec des donnees incompletes : si les residents DECLARES suffisent a
 * eux seuls, les non declares ne peuvent plus rien y changer — ils ne peuvent
 * qu'ELEVER le taux, jamais l'abaisser. Afficher un doute la-dessus mettrait en
 * cause un conseil dont la conformite est prouvable.
 *
 * ⚠️ LE DENOMINATEUR EST TOUJOURS LE TOTAL, dans les trois branches. Le reduire
 * aux seuls declares calculerait un taux sur une population choisie : 1 declare
 * resident sur 1 declare ferait 100 % alors que le conseil compte 10 personnes.
 *
 * ★ ET LA COMPARAISON EST ENTIERE, PAS UN POURCENTAGE ARRONDI. `pct >= 25` sur
 * un Math.round laisse passer 24,5 % — un taux SOUS la barre declare conforme.
 * `declares * 4 >= total` est la meme regle sans l'arrondi. Le pourcentage
 * arrondi reste calcule, mais pour l'AFFICHAGE seulement.
 */
export type VerdictResidence = 'conforme' | 'non_verifiable' | 'sous_le_seuil';

export function residencyVerdict(compte: {
  /** Tous les administrateurs actifs, declares ou non. */
  total: number;
  /** Ceux qui ont DECLARE etre residents canadiens (=== true). */
  declaresResidents: number;
  /** Ceux qui n'ont RIEN declare (null). */
  nonDeclares: number;
}): VerdictResidence {
  // 1. La barre est franchie par les seuls declares : rien ne peut la faire
  //    retomber, l'inconnu ne joue plus.
  if (compte.declaresResidents * 4 >= compte.total) return 'conforme';
  // 2. Il reste de l'inconnu : le resultat depend de ce qu'on ne sait pas.
  if (compte.nonDeclares > 0) return 'non_verifiable';
  // 3. Tout est declare et la barre n'est pas franchie. Le seul cas ou le
  //    produit a le droit d'affirmer une non-conformite.
  return 'sous_le_seuil';
}
