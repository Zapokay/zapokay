/**
 * UNE SEULE DÉCLARATION DE CE QUI EST REQUIS, ET TROIS CONSOMMATEURS.
 *
 * Le dépôt portait « obligatoire » sous TROIS marques indépendantes, posées à
 * la main sur chaque formulaire : l'astérisque, la condition de désactivation
 * du bouton, et la chaîne de gardes de la fonction d'enregistrement. Mesuré le
 * 2026-09-10, elles ne coïncident nulle part —
 *
 *   · EditShareholdingModal:110 marque « classe d'actions * » et AUCUNE garde
 *     ne la protège ;
 *   · IssueSharesModal:683 garde le prix (L149) SANS astérisque ;
 *   · AddDirectorModal exigeait ville et pays depuis d1746da SANS astérisque ;
 *   · et dans les quatre modales principales, le bouton et handleSave gardent
 *     des ensembles DIFFÉRENTS.
 *
 * Ce fichier est la source dont les trois marques dérivent. Il ne contient
 * aucune chaîne d'interface : il rend des IDENTIFIANTS DE CHAMP, et chaque
 * surface les traduit.
 *
 * ⛔ CE N'EST PAS UN SCHÉMA DE VALIDATION, et zod n'est pas employé bien qu'il
 * soit en dépendance. Un schéma décrirait la personne À CÔTÉ de CompanyPerson,
 * soit deux sources pour un seul objet. La question posée ici est celle de la
 * PRÉSENCE, jamais du format : aucune règle de code postal, de téléphone ni de
 * case postale ne vit ni ne vivra dans ce fichier.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyPerson } from '@/lib/supabase/people-types';

/**
 * ★ LE TYPE EST LA GARDE. `keyof CompanyPerson` rend impossible de nommer un
 * champ qui n'existe pas sur la personne : une faute de frappe dans la
 * déclaration ci-dessous ÉCHOUE À LA COMPILATION, elle ne se découvre pas à
 * l'exécution sur la fiche d'un utilisateur.
 */
export type ChampPersonne = keyof CompanyPerson;

/** Les rôles du domaine qui portent une exigence — même quand elle est vide. */
export type RoleAvecExigence =
  | 'director'
  | 'officer'
  | 'shareholder'
  | 'entity_signatory';

/**
 * ⛔ UNE DÉCISION, PAS UN TROU. Cette valeur dit « édition d'identité, hors
 * rôle, aucune exigence PAR DÉCISION » — et elle doit se lire ainsi. Un `null`
 * nu se lirait comme un oubli, et le prochain lecteur chercherait le rôle
 * manquant.
 *
 * Elle existe parce qu'EditPersonModal corrige l'identité d'une personne déjà
 * au dossier, sans la nommer à un rôle : LA PLUPART DES FICHES EXISTANTES
 * N'ONT PAS DE DOMICILE, et les rendre non enregistrables punirait
 * l'utilisateur d'une donnée que le produit ne lui a jamais demandée.
 *
 * ⛔ AUCUN COMPTE ICI, ET C'EST DÉLIBÉRÉ. Un décompte du parc dans un
 * commentaire pourrit par construction : il est juste le jour où on l'écrit
 * et faux dès qu'une fiche bouge. Les chiffres vivent dans le message de
 * commit, que l'historique fige et date.
 */
export const HORS_ROLE_AUCUNE_EXIGENCE = 'hors_role_aucune_exigence';

/** Ce qu'un appelant de PersonSelector doit déclarer. Requis, sans défaut. */
export type PorteeExigence =
  | RoleAvecExigence
  | typeof HORS_ROLE_AUCUNE_EXIGENCE;

/**
 * LA DÉCLARATION.
 *
 * ⚠️ L'ENTRÉE VIDE EST DÉLIBÉRÉE, PAS ABSENTE. `Record` sur RoleAvecExigence
 * force les quatre rôles à figurer : en ajouter un au type sans l'inscrire ici
 * échoue à la compilation. Une entrée vide dit « ce rôle a été considéré et
 * n'exige rien aujourd'hui » ; une entrée manquante dirait « personne n'y a
 * pensé ».
 *
 * ★ CE QUE CE FICHIER EXISTAIT POUR PROUVER EST MAINTENANT MESURÉ : remplir
 * `officer` et `shareholder` n'a demandé AUCUN changement de mécanisme.
 * L'astérisque de PersonSelector, la garde de bouton et la liste des trous
 * dérivent tous les trois de ces deux lignes. Décision de Dom, 2026-09-11 :
 * le domicile est imposé dans les modales de l'application.
 *
 * ⛔ `entity_signatory` RESTE VIDE, et ce n'est pas un oubli : aucun dépôt ne
 * porte le domicile d'un signataire, et ce n'est pas ce qui a été décidé.
 * ⛔ L'INSCRIPTION N'EST PAS CONCERNÉE : elle ne monte aucun formulaire de
 * rôle et ses écritures restent libres.
 */
export const CHAMPS_REQUIS: Record<RoleAvecExigence, readonly ChampPersonne[]> = {
  director: ['address_city', 'address_country'],
  officer: ['address_city', 'address_country'],
  shareholder: ['address_city', 'address_country'],
  entity_signatory: [],
};

/**
 * ⚠️ REQUIS PAR LE COMPOSANT LUI-MÊME, QUEL QUE SOIT LE RÔLE — y compris hors
 * rôle. Ce n'est pas une exigence de la déclaration : PersonSelector n'ÉMET
 * RIEN tant que le nom est vide — son effet de synchronisation le teste, et
 * c'est LE COMPOSANT qui l'impose. Le nom est donc requis PAR CONSTRUCTION
 * sur tous les montages, et son astérisque doit se rendre partout.
 *
 * ⛔ CE N'EST PAS LE DÉCOMPTE DES BOUTONS QUI LE FONDE. Les boutons appelants
 * qui portent `!personValue` le redisent, mais ils ne sont ni tous à le
 * porter ni nécessaires : la garde tient dans le composant, et elle tiendrait
 * si aucun ne le portait.
 *
 * ⛔ Il ne pouvait pas entrer dans CHAMPS_REQUIS : `officer`, `shareholder` et
 * `entity_signatory` y sont VIDES par décision, et l'édition d'identité n'a
 * aucun rôle. L'y mettre aurait contredit ces trois décisions pour sauver un
 * astérisque.
 */
export const REQUIS_PAR_LE_COMPOSANT: readonly ChampPersonne[] = ['full_name'];

/**
 * ⛔ UNE SEULE DÉFINITION DU VIDE, ET ELLE NE SE RECOPIE PAS. « Absent » vaut
 * `null`, `undefined`, ou une chaîne vide APRÈS trim — trois états qu'une
 * comparaison naïve `!== null` laisserait passer, alors qu'une ville faite de
 * deux espaces n'est pas une ville.
 */
export function estVide(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined) return true;
  if (typeof valeur === 'string') return valeur.trim() === '';
  return false;
}

/**
 * Les champs requis ABSENTS, pour une portée et une personne.
 * Rend `[]` pour un rôle sans exigence comme pour l'édition hors rôle.
 */
export function champsManquants(
  portee: PorteeExigence,
  /**
   * ⚠️ `| null` EXPLICITE, ET CE N'EST PAS UNE COMMODITÉ. CompanyPerson type
   * `address_country: string` alors que la colonne est NULLABLE en base —
   * discordance mesurée le 2026-09-09, antérieure à ce lot. `Partial` seul
   * rendrait `string | undefined` et refuserait le `null` que les formulaires
   * portent réellement. `estVide` traite déjà les trois états ; le type doit
   * les admettre plutôt que forcer un `?? ''` au point d'appel, qui masquerait
   * la discordance au lieu de la porter.
   */
  personne: { [K in ChampPersonne]?: CompanyPerson[K] | null },
): ChampPersonne[] {
  if (portee === HORS_ROLE_AUCUNE_EXIGENCE) return [];
  return CHAMPS_REQUIS[portee].filter((champ) => estVide(personne[champ]));
}

/** Un trou, pour une personne nommée. */
export interface TrouDePersonne {
  personId: string;
  nom: string;
  champs: ChampPersonne[];
}

/**
 * Les trous d'une société — LES TROIS FAMILLES DE RÔLES, UNE LIGNE PAR
 * PERSONNE.
 *
 * ⚠️ LES PERSONNES ACTIVES DANS UN RÔLE QUI EXIGE, jamais toutes les personnes
 * du dossier. Un mandat clos, une charge terminée, une détention close : aucun
 * des trois ne bloque l'export.
 *
 * ⭑ ET QUI CUMULE NE COMPTE QU'UNE FOIS. La même personne est souvent
 * administratrice, dirigeante ET actionnaire — au parc, plusieurs le sont.
 * Trois appels séparés auraient rendu trois lignes pour un seul domicile à
 * saisir, et la liste du modal serait devenue un mur. La déduplication vit
 * ici, pas chez les appelants.
 *
 * ⛔ CE CALCUL VIT ICI ET NULLE PART AILLEURS. Les deux routes l'APPELLENT et
 * transportent son résultat ; écrit dans l'une, il serait réécrit dans
 * l'autre, et les deux divergeraient.
 */
export async function trousDeLaSociete(
  supabase: SupabaseClient,
  companyId: string,
): Promise<TrouDePersonne[]> {
  /**
   * Les rôles qui exigent quelque chose AUJOURD'HUI, dérivés de la
   * déclaration. Un rôle dont l'entrée est vide ne peut pas produire de trou :
   * il ne participe pas au filtre, et `entity_signatory` sort donc de lui-même.
   */
  const rolesQuiExigent = (['director', 'officer', 'shareholder'] as const).filter(
    (r) => CHAMPS_REQUIS[r].length > 0,
  );
  if (rolesQuiExigent.length === 0) return [];

  const { data, error } = await supabase
    .from('company_people')
    .select(
      '*, director_mandates(deleted_at, is_active), officer_appointments(deleted_at, is_active), shareholding_holders(shareholdings(end_date))',
    )
    .eq('company_id', companyId);

  // ⚠️ UN ÉCHEC DE LECTURE N'EST PAS UNE ABSENCE DE TROU. Rendre `[]` sur une
  // erreur ferait dire au modal « rien ne manque » alors qu'il ne sait rien.
  if (error) throw new Error(`trousDeLaSociete: read failed: ${error.message}`);

  const personnes = (data ?? []) as unknown as (CompanyPerson & {
    director_mandates?: { deleted_at: string | null; is_active: boolean }[];
    officer_appointments?: { deleted_at: string | null; is_active: boolean }[];
    shareholding_holders?: { shareholdings?: { end_date: string | null } | null }[];
  })[];

  type Personne = (typeof personnes)[number];
  const actif: Record<(typeof rolesQuiExigent)[number], (p: Personne) => boolean> = {
    director: (p) => (p.director_mandates ?? []).some((m) => !m.deleted_at && m.is_active),
    officer: (p) => (p.officer_appointments ?? []).some((m) => !m.deleted_at && m.is_active),
    /**
     * ⚠️ NI `deleted_at` NI `is_active` SUR UNE DÉTENTION — mesuré : ces deux
     * colonnes n'existent pas sur `shareholdings`. « En cours » se dérive
     * d'`end_date`, la même source que la seconde ligne du registre des
     * actionnaires.
     */
    shareholder: (p) =>
      (p.shareholding_holders ?? []).some((h) => h.shareholdings && !h.shareholdings.end_date),
  };

  return personnes
    .map((p) => {
      const roles = rolesQuiExigent.filter((r) => actif[r](p));
      if (roles.length === 0) return null;
      // L'UNION des champs exigés par les rôles actifs de cette personne : une
      // seule ligne, qui nomme tout ce qui lui manque.
      const requis = new Set<ChampPersonne>(roles.flatMap((r) => Array.from(CHAMPS_REQUIS[r])));
      const champs = Array.from(requis).filter((champ) => estVide(p[champ]));
      return champs.length > 0 ? { personId: p.id, nom: p.full_name, champs } : null;
    })
    .filter((t): t is TrouDePersonne => t !== null);
}
