/**
 * LE CONTRAT DE `p_entity` — la charge de `create_entity_with_signatories`.
 *
 * ⛔ IL VIT ICI, PAS DANS LA MODALE. Un second appelant doit l'IMPORTER, pas le
 * réinventer : deux descriptions du même objet finiraient par diverger, et
 * c'est exactement de cette façon qu'un champ s'est perdu la première fois.
 *
 * ★ TOUS LES CHAMPS D'ADRESSE SONT REQUIS, ET C'EST TOUTE LA RAISON D'ÊTRE DE
 * CE FICHIER. Aucun n'est facultatif : ceux qui peuvent être nuls sont typés
 * `string | null`, donc la CLÉ DOIT ÊTRE ÉCRITE même quand la valeur est nulle.
 *
 * ⛔ POURQUOI CETTE RÈGLE, MESURÉE. `address_country` était simplement ABSENTE
 * de la charge — pas nulle, absente. `p_entity ->> 'address_country'` rendait
 * alors SQL NULL, le `COALESCE(…, 'CA')` de la fonction s'en saisissait, et
 * chaque entité recevait un pays que personne n'avait déclaré. Une clé qui
 * manque ne se voit nulle part : ni à la compilation, ni à l'exécution, ni sur
 * l'écran. C'est la règle du lot résidence portée au type — « écris null,
 * n'omets pas ».
 *
 * ⚠️ `string | null` ET NON `string | undefined`. `undefined` disparaît à la
 * sérialisation JSON : la clé repartirait absente, et le défaut se rejouerait
 * derrière un type qui aurait l'air juste.
 */
export interface ChargeEntite {
  company_id: string;
  entity_type: string;
  legal_name: string;

  /**
   * Ces trois-là portent `''` plutôt que `null` quand ils ne s'appliquent pas
   * — un numéro d'entreprise sur une fiducie, par exemple. Le `NULLIF(…, '')`
   * de la fonction les ramène à NULL. Comportement d'origine, inchangé.
   */
  entity_number: string;
  entity_descriptor: string;
  date_incorporated: string;
  date_constituted: string;

  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  /**
   * ⚠️ LE CHAMP QUI MANQUAIT. Typé comme les cinq autres, requis comme eux :
   * il n'existe plus de façon de l'oublier qui compile.
   */
  address_country: string | null;
}

/**
 * `''` → `null`, pour les champs d'adresse.
 *
 * ⛔ UNE SEULE DÉFINITION, et elle ne juge que le vide de saisie : un champ
 * qu'on n'a pas rempli n'est pas une donnée. Le `trim` est fait ici pour que
 * l'appelant n'ait pas à choisir entre `.trim()` et `|| null` à chaque champ —
 * treize occasions de se tromper, dans le fichier même qui s'est déjà trompé.
 */
export function nullSiVide(valeur: string): string | null {
  const v = valeur.trim();
  return v === '' ? null : v;
}
