import type {
  EntityDescriptor,
  ShareholderEntity,
  ShareholderEntityType,
} from '@/lib/supabase/people-types';

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

// =============================================================================
// LA VALEUR DU FORMULAIRE D'ENTITÉ — et ses trois traductions
// =============================================================================

/**
 * CE QUE LE FORMULAIRE D'ENTITÉ PORTE — onze champs, et pas un de plus.
 *
 * ⛔ IL VIT ICI, DANS lib/, ET NON DANS LE COMPOSANT. Deux écrans le
 * consomment — la création (IssueSharesModal) et la correction
 * (EditEntityModal) — et les deux doivent le traduire vers la base de la même
 * façon. Un contrat logé dans un composant d'interface ferait de celui-ci la
 * source d'une donnée.
 *
 * ⛔ `jurisdiction` N'Y EST PAS, PAR DÉCISION. Mesuré le 2026-09-11 : colonne
 * jamais écrite (absente de la charge de création), jamais lue (aucun écran,
 * aucun document), NULL sur toutes les lignes. Un champ de formulaire pour une
 * colonne morte ferait saisir une valeur dont rien ne fait rien.
 *
 * ⛔ LES SIGNATAIRES N'Y SONT PAS NON PLUS. Ce sont des rattachements vers
 * company_people, un souci de CRÉATION ; ils restent dans la modale d'émission.
 */
export interface ValeurEntite {
  entityType: ShareholderEntityType;
  legalName: string;
  entityNumber: string;
  /**
   * ⚠️ `''` EST ADMIS, ET C'EST UNE GARDE. La contrainte de la table autorise
   * un descripteur NULL pour n'importe quel type. Pré-remplir un NULL par
   * 'corporation' ferait écrire, au premier enregistrement, un descripteur que
   * personne n'a déclaré — la faute de 'QC' et de 'CA', une troisième fois.
   * `''` porte l'absence ; le formulaire la rend, la traduction la rend NULL.
   */
  entityDescriptor: EntityDescriptor | '';
  /** date_incorporated pour une société, date_constituted pour une fiducie. */
  entityDate: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  addressCountry: string;
}

/**
 * L'état initial d'une CRÉATION — celui qu'IssueSharesModal portait en onze
 * `useState` avant l'extraction, recopié valeur pour valeur.
 *
 * ⚪ `entityDescriptor: 'corporation'` est un choix de création, antérieur et
 * inchangé : le menu n'offre pas d'absence à la création. C'est à la
 * CORRECTION qu'une absence existante doit être respectée.
 */
export const VALEUR_ENTITE_VIDE: ValeurEntite = {
  entityType: 'corporation',
  legalName: '',
  entityNumber: '',
  entityDescriptor: 'corporation',
  entityDate: '',
  addressLine1: '',
  addressLine2: '',
  addressCity: '',
  addressProvince: '',
  addressPostalCode: '',
  addressCountry: '',
};

/**
 * ① CRÉATION — la charge de `create_entity_with_signatories`.
 *
 * ⛔ IDENTIQUE, CLÉ POUR CLÉ ET DANS LE MÊME ORDRE, au littéral qu'IssueSharesModal
 * écrivait sur place avant l'extraction. Les champs d'identité gardent leur
 * `''` pour « ne s'applique pas » (le NULLIF de la fonction les ramène à NULL) ;
 * les six d'adresse passent par `nullSiVide`. Comportement d'origine, déplacé.
 */
export function chargeEntite(companyId: string, v: ValeurEntite): ChargeEntite {
  return {
    company_id: companyId,
    entity_type: v.entityType,
    legal_name: v.legalName.trim(),
    entity_number: v.entityType === 'corporation' ? v.entityNumber.trim() : '',
    entity_descriptor: v.entityType === 'corporation' ? v.entityDescriptor : '',
    date_incorporated: v.entityType === 'corporation' ? v.entityDate : '',
    date_constituted: v.entityType === 'trust' ? v.entityDate : '',
    address_line1: nullSiVide(v.addressLine1),
    address_line2: nullSiVide(v.addressLine2),
    address_city: nullSiVide(v.addressCity),
    address_province: nullSiVide(v.addressProvince),
    address_postal_code: nullSiVide(v.addressPostalCode),
    address_country: nullSiVide(v.addressCountry),
  };
}

/**
 * ② CORRECTION, SENS LECTURE — une ligne de la base vers le formulaire.
 *
 * `?? ''` partout : une colonne NULL doit produire un champ VIDE, jamais la
 * chaîne « null », et jamais une valeur par défaut.
 */
export function valeurDepuisEntite(e: ShareholderEntity): ValeurEntite {
  return {
    entityType: e.entity_type,
    legalName: e.legal_name,
    entityNumber: e.entity_number ?? '',
    entityDescriptor: e.entity_descriptor ?? '',
    entityDate: (e.entity_type === 'corporation' ? e.date_incorporated : e.date_constituted) ?? '',
    addressLine1: e.address_line1 ?? '',
    addressLine2: e.address_line2 ?? '',
    addressCity: e.address_city ?? '',
    addressProvince: e.address_province ?? '',
    addressPostalCode: e.address_postal_code ?? '',
    addressCountry: e.address_country ?? '',
  };
}

/**
 * Le correctif d'une entité, tel qu'il part à l'UPDATE.
 *
 * ★ TOUTES LES CLÉS SONT REQUISES, même règle que `ChargeEntite` : « écris
 * null, n'omets pas ». Une clé oubliée échoue à la compilation.
 *
 * ⛔ PAS DE `jurisdiction` — voir `ValeurEntite`.
 */
export interface CorrectifEntite {
  entity_type: ShareholderEntityType;
  legal_name: string;
  entity_number: string | null;
  entity_descriptor: EntityDescriptor | null;
  date_incorporated: string | null;
  date_constituted: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string | null;
}

/**
 * ③ CORRECTION, SENS ÉCRITURE — le formulaire vers l'UPDATE.
 *
 * ⛔ UN CHAMP VIDÉ REDEVIENT NULL, et c'est voulu : un champ vidé par
 * l'utilisateur est un MANQUE, pas une valeur à préserver. Même règle que
 * EditPersonModal pour l'adresse, et pour la même raison.
 *
 * ⚠️ LES CHAMPS QUI DÉPENDENT DU TYPE suivent la contrainte de la table : un
 * descripteur non nul n'est admis que pour une société, et la date va dans la
 * colonne du type courant — l'autre est remise à NULL. Changer le type d'une
 * entité ne laisse donc pas derrière lui une date ou un NEQ orphelin.
 */
export function correctifEntite(v: ValeurEntite): CorrectifEntite {
  const societe = v.entityType === 'corporation';
  return {
    entity_type: v.entityType,
    legal_name: v.legalName.trim(),
    entity_number: societe ? nullSiVide(v.entityNumber) : null,
    entity_descriptor: societe && v.entityDescriptor !== '' ? v.entityDescriptor : null,
    date_incorporated: societe ? nullSiVide(v.entityDate) : null,
    date_constituted: v.entityType === 'trust' ? nullSiVide(v.entityDate) : null,
    address_line1: nullSiVide(v.addressLine1),
    address_line2: nullSiVide(v.addressLine2),
    address_city: nullSiVide(v.addressCity),
    address_province: nullSiVide(v.addressProvince),
    address_postal_code: nullSiVide(v.addressPostalCode),
    address_country: nullSiVide(v.addressCountry),
  };
}
