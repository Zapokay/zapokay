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
// ⚠️ IMPORT DE TYPE SEULEMENT, ET C'EST LA CONDITION. lib/address.ts importe
// `estVide` d'ici à l'exécution ; un import de valeur dans l'autre sens ferait un
// cycle. Les types s'effacent à la compilation.
import type { ChampAdresse, PersonneAdressable } from '@/lib/address';

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
 * LA DÉCLARATION DU SIÈGE SOCIAL — ce qu'une adresse de société doit porter.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-13 : l'adresse COMPLÈTE est exigée — « un siège est
 * une adresse où l'on signifie des documents, un domicile identifie une
 * personne ». D'où CINQ champs ici, contre deux pour un domicile.
 *
 * ⛔ `address_line2` N'Y EST PAS, et ce n'est pas un oubli. Ce champ est « Suite /
 * appartement » — le libellé des personnes et des entités : une maison n'en a pas,
 * un appartement en a un, et c'est le même champ. Il est constitutif pour un
 * appartement, inexistant pour une maison, et le produit ne peut pas savoir lequel
 * des deux il a sous les yeux. L'exiger forcerait un « s/o » inventé dans un
 * registre.
 * ⚠️ LA LIMITE, DÉCIDÉE PAR DOM EN LE SACHANT : un siège en appartement peut être
 * enregistré sans son numéro, et le produit ne le signalera pas. Une limite décidée
 * n'est pas une limite oubliée.
 *
 * ★ EXIGÉE DANS L'APPLICATION, JAMAIS À L'INSCRIPTION — la décision du 2026-09-09,
 * appliquée telle quelle : l'étape 3 la propose sans astérisque ni garde ; les
 * Paramètres la marquent et la gardent ; la liste des trous la nomme. Trois
 * lecteurs, cette seule liste.
 *
 * `as const` : `ChampSiege` ne peut nommer que ces cinq-là.
 */
export const CHAMPS_REQUIS_SIEGE = [
  'address_line1',
  'address_city',
  'address_province',
  'address_postal_code',
  'address_country',
] as const satisfies readonly ChampAdresse[];

export type ChampSiege = (typeof CHAMPS_REQUIS_SIEGE)[number];

/**
 * LA DÉCLARATION DE L'ACTIONNAIRE-SOCIÉTÉ — ce qu'une entité qui détient des actions doit
 * porter.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-11 : « n'importe qui administre une entreprise ne sera pas
 * repoussé par l'imposition de l'adresse ». Elle vaut pour les actionnaires, et un
 * actionnaire peut être une société ou une fiducie : VILLE ET PAYS, comme pour une personne.
 *
 * ⛔ PAS L'ADRESSE COMPLÈTE DU SIÈGE. Les cinq champs de CHAMPS_REQUIS_SIEGE ont leur raison
 * propre — « un siège est une adresse où l'on signifie des documents ». Une entité
 * actionnaire est un DÉTENTEUR, pas un siège.
 *
 * ★ UNE DÉCLARATION PAR SUJET, PAS UN RÔLE. `RoleAvecExigence` nomme ce qu'une PERSONNE fait
 * dans la société, sur les champs d'une personne (`keyof CompanyPerson`). Une entité n'y
 * exerce qu'une chose, détenir, et ne porte pas ces champs. Elle se déclare comme le siège :
 * sur les noms de colonnes d'adresse, que `shareholder_entities` porte aux mêmes noms.
 *
 * ⚠️ RIEN NE LIE CETTE LIGNE À `CHAMPS_REQUIS.shareholder`. Les deux disent aujourd'hui ville
 * et pays ; changer l'une ne change pas l'autre.
 *
 * Quatre lecteurs, cette seule liste : les astérisques d'EntityForm, la garde de la création
 * (IssueSharesModal), celle de la correction (EditEntityModal), la liste des trous.
 */
export const CHAMPS_REQUIS_ENTITE = ['address_city', 'address_country'] as const satisfies readonly ChampAdresse[];

export type ChampEntite = (typeof CHAMPS_REQUIS_ENTITE)[number];

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

/** Les champs du siège ABSENTS. Même définition du vide que partout : `estVide`. */
export function champsManquantsSiege(societe: PersonneAdressable): ChampSiege[] {
  return CHAMPS_REQUIS_SIEGE.filter((champ) => estVide(societe[champ]));
}

/** Les champs requis ABSENTS d'une actionnaire-société. Même définition du vide : `estVide`. */
export function champsManquantsEntite(entite: PersonneAdressable): ChampEntite[] {
  return CHAMPS_REQUIS_ENTITE.filter((champ) => estVide(entite[champ]));
}

/**
 * Un trou — et CE QUI le porte.
 *
 * ⛔ PLUS SEULEMENT UNE PERSONNE. Ce type s'appelait `TrouDePersonne` et portait un
 * `personId` : une société n'en a pas plus qu'une entité. Le discriminant `sujet`
 * dit à qui appartient le manque, et chaque consommateur le lit pour nommer QUI et
 * QUOI, et pour renvoyer au bon écran.
 *
 * ★ LES ENTITÉS SONT ENTRÉES DANS CETTE FORME SANS LA CHANGER (lot C) : un troisième membre,
 * `{ sujet: 'entite'; id; nom; champs }`, sur les mêmes noms de colonnes d'adresse.
 * ⚠️ UN CONSOMMATEUR QUI TESTE `sujet === 'societe'` PUIS « SINON » TRAITE L'ENTITÉ EN
 * PERSONNE — la renvoie aux Administrateurs et nomme son « domicile ». Chaque consommateur
 * qui distingue les sujets nomme ses trois branches.
 *
 * ⚪ LA SOCIÉTÉ N'A PAS DE `nom`. Ce module ne connaît pas la langue du lecteur :
 * choisir ici entre les deux dénominations serait décider à la place de l'écran,
 * qui dit « Siège social ».
 */
export type Trou =
  | { sujet: 'societe'; id: string; champs: ChampSiege[] }
  | { sujet: 'personne'; id: string; nom: string; champs: ChampPersonne[] }
  | { sujet: 'entite'; id: string; nom: string; champs: ChampEntite[] };

/**
 * Les trous d'une société — SON SIÈGE, PUIS LES TROIS FAMILLES DE RÔLES, UNE
 * LIGNE PAR PERSONNE, PUIS SES ACTIONNAIRES-SOCIÉTÉS, UNE LIGNE PAR ENTITÉ.
 *
 * ★ LE SIÈGE PASSE EN TÊTE, ET IL NE DÉPEND D'AUCUN RÔLE : c'est le sujet du livre
 * qui manque d'adresse, pas une personne. Sa ligne existe dès qu'un des cinq champs
 * de CHAMPS_REQUIS_SIEGE est vide.
 *
 * ⚠️ LES PERSONNES ACTIVES DANS UN RÔLE QUI EXIGE, jamais toutes les personnes
 * du dossier. Un mandat clos, une charge terminée, une détention close : aucun
 * des trois ne bloque l'export. Les entités suivent la même règle : listées si elles
 * détiennent encore (`trousDesEntites`).
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
): Promise<Trou[]> {
  const { data: societe, error: erreurSociete } = await supabase
    .from('companies')
    .select('address_line1, address_line2, address_city, address_province, address_postal_code, address_country')
    .eq('id', companyId)
    .single();
  // ⚠️ MÊME RÈGLE QUE POUR LES PERSONNES : un échec de lecture n'est pas un siège
  // complet.
  if (erreurSociete) throw new Error(`trousDeLaSociete: company read failed: ${erreurSociete.message}`);
  const manquantsSiege = champsManquantsSiege((societe ?? {}) as PersonneAdressable);
  const trouSiege: Trou[] =
    manquantsSiege.length > 0 ? [{ sujet: 'societe', id: companyId, champs: manquantsSiege }] : [];

  /**
   * Les rôles qui exigent quelque chose AUJOURD'HUI, dérivés de la
   * déclaration. Un rôle dont l'entrée est vide ne peut pas produire de trou :
   * il ne participe pas au filtre, et `entity_signatory` sort donc de lui-même.
   */
  const rolesQuiExigent = (['director', 'officer', 'shareholder'] as const).filter(
    (r) => CHAMPS_REQUIS[r].length > 0,
  );
  // ⚠️ LES ENTITÉS AVANT LE RETOUR ANTICIPÉ : elles ont leur propre déclaration, et une
  // société sans rôle exigeant peut encore avoir une actionnaire-société sans adresse.
  const trousEntites = await trousDesEntites(supabase, companyId);
  if (rolesQuiExigent.length === 0) return [...trouSiege, ...trousEntites];

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

  const trousPersonnes = personnes
    .map((p) => {
      const roles = rolesQuiExigent.filter((r) => actif[r](p));
      if (roles.length === 0) return null;
      // L'UNION des champs exigés par les rôles actifs de cette personne : une
      // seule ligne, qui nomme tout ce qui lui manque.
      const requis = new Set<ChampPersonne>(roles.flatMap((r) => Array.from(CHAMPS_REQUIS[r])));
      const champs = Array.from(requis).filter((champ) => estVide(p[champ]));
      return champs.length > 0 ? { sujet: 'personne' as const, id: p.id, nom: p.full_name, champs } : null;
    })
    .filter((t): t is Extract<Trou, { sujet: 'personne' }> => t !== null);

  return [...trouSiege, ...trousPersonnes, ...trousEntites];
}

/**
 * Les actionnaires-sociétés QUI DÉTIENNENT ENCORE et à qui manque ce que
 * CHAMPS_REQUIS_ENTITE exige — une ligne par entité.
 *
 * ★ « DÉTIENT ENCORE » SE DÉRIVE D'`end_date`, exactement comme pour l'actionnaire personne
 * ci-dessus : ni `deleted_at` ni `is_active` n'existent sur une détention. Une entité dont
 * toutes les détentions sont closes ne produit pas de ligne — la règle des rôles clos, que
 * le lot suivant revisite pour tous les sujets à la fois.
 * ⚠️ UN ÉCHEC DE LECTURE LÈVE, pour la même raison que les personnes : ce n'est pas une
 * absence de trou.
 */
async function trousDesEntites(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Extract<Trou, { sujet: 'entite' }>[]> {
  const { data, error } = await supabase
    .from('shareholder_entities')
    .select(
      'id, legal_name, address_line1, address_line2, address_city, address_province, address_postal_code, address_country, shareholding_holders(shareholdings(end_date))',
    )
    .eq('company_id', companyId);
  if (error) throw new Error(`trousDeLaSociete: entities read failed: ${error.message}`);
  const entites = (data ?? []) as unknown as (PersonneAdressable & {
    id: string;
    legal_name: string;
    shareholding_holders?: { shareholdings?: { end_date: string | null } | null }[];
  })[];
  return entites
    .filter((e) => (e.shareholding_holders ?? []).some((h) => h.shareholdings && !h.shareholdings.end_date))
    .map((e) => ({ sujet: 'entite' as const, id: e.id, nom: e.legal_name, champs: champsManquantsEntite(e) }))
    .filter((t) => t.champs.length > 0);
}
