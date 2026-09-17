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
// ⚠️ IMPORTS DE TYPE SEULEMENT, MÊME CONDITION QUE CI-DESSUS. `lib/regimes.ts`
// importe `IncorporationType` de `lib/types.ts` ; aucun des deux n'importe ce
// fichier à l'exécution, et les types s'effacent à la compilation.
import type { RegimeEnBase } from '@/lib/regimes';
import type { Company } from '@/lib/types';

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
 * ⛔ UNE DÉCISION, PAS UN TROU. Cette valeur dit « hors rôle, aucune exigence
 * PAR DÉCISION » — et elle doit se lire ainsi. Un `null` nu se lirait comme un
 * oubli, et le prochain lecteur chercherait le rôle manquant.
 *
 * ⚖️ ELLE NE VAUT PLUS QUE POUR UNE PERSONNE SANS RÔLE ACTIF. Décision de Dom,
 * 2026-09-13 : une correction ne peut pas vider ce qu'un rôle ACTIF exige.
 * EditPersonModal lit les rôles de la personne et passe l'union de ses rôles
 * actifs (`porteeDeLaPersonne`) ; cette valeur ne revient que lorsqu'elle n'en
 * tient aucun. La raison d'origine tient pour ce cas-là : beaucoup de fiches
 * existantes n'ont pas de domicile, et bloquer la correction d'une personne
 * qu'aucun rôle actif n'oblige punirait l'utilisateur d'une donnée que le
 * produit ne lui a jamais demandée.
 *
 * ⛔ AUCUN COMPTE ICI, ET C'EST DÉLIBÉRÉ. Un décompte du parc dans un
 * commentaire pourrit par construction : il est juste le jour où on l'écrit
 * et faux dès qu'une fiche bouge. Les chiffres vivent dans le message de
 * commit, que l'historique fige et date.
 */
export const HORS_ROLE_AUCUNE_EXIGENCE = 'hors_role_aucune_exigence';

/**
 * PLUSIEURS RÔLES À LA FOIS — une personne est souvent administratrice ET
 * actionnaire. ⛔ LE TUPLE EST NON VIDE, ET C'EST LA GARDE : « aucun rôle »
 * s'écrit HORS_ROLE_AUCUNE_EXIGENCE, jamais `[]`, qui se lirait comme un oubli.
 */
export type RolesExigeants = readonly [RoleAvecExigence, ...RoleAvecExigence[]];

/** Ce qu'un appelant de PersonSelector doit déclarer. Requis, sans défaut. */
export type PorteeExigence =
  | RoleAvecExigence
  | RolesExigeants
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
 *
 * ⚖️ L'INSCRIPTION EST CONCERNÉE DEPUIS LE 2026-09-17, ET CETTE LIGNE DISAIT LE
 * CONTRAIRE. Elle disait : « L'INSCRIPTION N'EST PAS CONCERNÉE : elle ne monte
 * aucun formulaire de rôle et ses écritures restent libres. » C'était vrai le
 * 2026-09-11 et faux depuis la décision de Dom du 2026-09-17 : l'étape 4 lit
 * cette déclaration, marque ses champs et refuse de continuer sans eux.
 * ⛔ ELLE EST RÉÉCRITE, PAS CONSERVÉE « PARCE QU'ELLE EST HISTORIQUE ». Une règle
 * dont la raison n'est plus vraie se fait supprimer plus tard par quelqu'un qui
 * la croit morte — §357, payé trois fois cette semaine. L'historique garde
 * l'ancienne phrase ; le fichier porte celle qui est vraie.
 */
export const CHAMPS_REQUIS = {
  director: ['address_city', 'address_country'],
  officer: ['address_city', 'address_country'],
  shareholder: ['address_city', 'address_country'],
  entity_signatory: [],
} as const satisfies Record<RoleAvecExigence, readonly ChampPersonne[]>;

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
export const REQUIS_PAR_LE_COMPOSANT = ['full_name'] as const satisfies readonly ChampPersonne[];

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
 * LA DÉCLARATION DE LA SOCIÉTÉ — ce que l'étape 2 de l'inscription exige.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-17. Elle renverse celle du 2026-09-09 pour cette
 * étape comme la précédente l'a fait pour le siège : l'inscription EXIGE ce
 * qu'elle déclare.
 *
 * ★★ LA CONDITION EST LA CLÉ, PAS UN PRÉDICAT — ET CETTE FORME EXISTAIT DÉJÀ.
 * `CHAMPS_REQUIS` ci-dessus se lit « `address_city` est exigée SI la personne
 * est administratrice » : sa condition est un INDEX. Celle-ci se lit « le
 * numéro de société fédéral est exigé SI le régime est fédéral », et c'est le
 * même mécanisme. Mesuré avant d'écrire : ce fichier ne porte AUCUN prédicat
 * dans une déclaration, et il n'en gagne aucun ici.
 *
 * ⛔ POURQUOI ÇA COMPTE : une condition écrite à la main dans l'écran serait
 * une garde HORS DÉCLARATION — exactement ce que `b0f44ed` a retiré avec
 * raison, et exactement ce que l'étape 2 faisait (`isCBCA && !…trim()`). Le lot
 * ne l'invente pas : il la DÉPLACE.
 *
 * ⚠️ LE NEQ EST EXIGÉ SOUS LES DEUX RÉGIMES, ET LA RAISON A UNE DATE DE
 * PÉREMPTION. Elle est celle que l'étape 2 portait déjà, sourcée : ZapOkay ne
 * sert QUE le Québec aujourd'hui, et une société fédérale qui y opère
 * s'immatricule au REQ, donc détient un NEQ. ★ Mesuré au parc le 2026-09-17 :
 * 27 sociétés sur 27 en portent un, dont 10 CBCA sur 10. La feuille de route
 * est pancanadienne ; une société fédérale ontarienne n'en aura PAS. Qui
 * ajoute une province revisite CETTE LIGNE — exiger le NEQ ici, c'est adhérer,
 * pas s'abstenir.
 *
 * ★ `Record<RegimeEnBase, …>` FORCE LES DEUX RÉGIMES À FIGURER, comme
 * `CHAMPS_REQUIS` force les quatre rôles : en ajouter un au type sans l'inscrire
 * ici échoue à la compilation. Et `satisfies … (keyof Company)[]` fait du TYPE
 * la garde : une faute de frappe dans un nom de colonne ne compile pas.
 *
 * ⛔ LE VOCABULAIRE EST CELUI DES COLONNES, jamais celui du flux d'inscription.
 * Les trois déclarations au-dessus rendent des noms de colonnes ; l'étape 2
 * parle `legalName`, `incorporationNumber`. La conversion vit à UN SEUL endroit,
 * `lib/societe-colonnes.ts`, sur le modèle de `regimeEnBase` — un troisième
 * vocabulaire non converti est ce que ce dépôt passe son temps à réunir.
 */
export const CHAMPS_REQUIS_SOCIETE = {
  LSA: ['neq'],
  CBCA: ['neq', 'corporation_number'],
} as const satisfies Record<RegimeEnBase, readonly (keyof Company)[]>;

/**
 * CE QUE TOUT RÉGIME EXIGE — la même raison d'être que `REQUIS_PAR_LE_COMPOSANT`
 * pour les personnes : une exigence qui ne dépend d'aucun discriminant n'a rien
 * à faire recopiée dans chaque entrée du `Record`, où deux copies finiraient par
 * diverger.
 *
 * ⛔ LA PRÉSENCE SEULEMENT. « La date ne peut pas être dans le futur » RESTE
 * dans l'écran, et ce n'est pas un oubli : l'en-tête de ce fichier l'interdit —
 * « la question posée ici est celle de la PRÉSENCE, jamais du format ». Même
 * partage pour le NEQ : sa présence est déclarée ici, ses dix chiffres et son
 * unicité restent des règles d'écran.
 */
export const REQUIS_QUEL_QUE_SOIT_LE_REGIME = ['incorporation_date'] as const satisfies readonly (keyof Company)[];

/**
 * LES GROUPES — « AU MOINS UN DES DEUX », ET C'EST UNE FORME NEUVE.
 *
 * ⛔ POURQUOI AUCUNE DÉCLARATION EXISTANTE NE POUVAIT LE DIRE. `champsManquants`,
 * `champsManquantsSiege` et `champsManquantsEntite` sont des `filter` champ par
 * champ sur `estVide` : un filtre sait dire « celui-ci est vide », jamais « ce
 * GROUPE compte au moins un rempli ». La dénomination sociale est une
 * DISJONCTION — `legal_name_fr` OU `legal_name_en` — en écho à la contrainte
 * `companies_legal_name_present` que la base porte déjà.
 *
 * ⭐ ET ELLE RESSERVIRA. Le prochain « au moins un des deux » se déclare ici et
 * hérite du reste : `groupesManquants` ne sait rien du sujet qu'on lui passe.
 * ⚠️ Un groupe N'EST PAS un champ : il porte un NOM PROPRE (`denomination`), pas
 * un nom de colonne, parce que ce qui manque à l'utilisateur n'est pas une
 * colonne mais une chose — sa dénomination. C'est ce nom que l'écran traduit.
 */
export const GROUPES_REQUIS_SOCIETE = [
  { groupe: 'denomination', champs: ['legal_name_fr', 'legal_name_en'] },
] as const satisfies readonly { groupe: string; champs: readonly (keyof Company)[] }[];

/**
 * TOUT CE QUE L'ÉTAPE 2 PEUT RÉCLAMER — dérivé des trois déclarations ci-dessus,
 * jamais réécrit à la main. Ajouter un champ à l'une d'elles l'ajoute ici, et
 * l'écran qui ne sait pas le nommer cesse de compiler.
 */
export type ChampExigeSociete =
  | (typeof CHAMPS_REQUIS_SOCIETE)[RegimeEnBase][number]
  | (typeof REQUIS_QUEL_QUE_SOIT_LE_REGIME)[number];

export type GroupeSociete = (typeof GROUPES_REQUIS_SOCIETE)[number]['groupe'];

/** Toute colonne que l'étape 2 porte — les exigées, plus les membres des groupes. */
export type ChampSociete =
  | ChampExigeSociete
  | (typeof GROUPES_REQUIS_SOCIETE)[number]['champs'][number];

/**
 * ★ CE QU'UNE SURFACE DOIT SAVOIR NOMMER, ET RIEN DE PLUS. Un MEMBRE de groupe
 * n'y figure pas : ce qui manque à l'utilisateur n'est jamais « legal_name_fr »,
 * c'est « la dénomination sociale ». Le type force l'écran à ne posséder que les
 * quatre libellés qui ont un sens à l'écran — en ajouter un sixième au catalogue
 * ne compilerait pas plus qu'en oublier un.
 */
export type ExigenceSociete = ChampExigeSociete | GroupeSociete;

/**
 * Les champs qu'un régime exige — l'exigence commune PUIS la sienne.
 * ⛔ UNE SEULE DÉFINITION : l'astérisque de l'étape 2, la garde de son bouton et
 * son message la lisent ; aucun ne refait la concaténation à la main.
 */
export function champsExigesSociete(regime: RegimeEnBase): readonly ChampExigeSociete[] {
  return [...CHAMPS_REQUIS_SOCIETE[regime], ...REQUIS_QUEL_QUE_SOIT_LE_REGIME];
}

/**
 * Les GROUPES dont AUCUN membre n'est rempli. Un seul membre suffit à satisfaire
 * le groupe — c'est toute la différence avec un `filter` champ par champ.
 * Même définition du vide que partout : `estVide`.
 */
export function groupesManquants<G extends { groupe: string; champs: readonly string[] }>(
  groupes: readonly G[],
  sujet: { [champ: string]: unknown },
): G['groupe'][] {
  return groupes.filter((g) => g.champs.every((champ) => estVide(sujet[champ]))).map((g) => g.groupe);
}

/**
 * CE QUI MANQUE À UNE SOCIÉTÉ, NOMMABLE — les groupes d'abord, puis les champs.
 *
 * ⚪ L'ORDRE SUIT L'ÉCRAN, et c'est délibéré : dénomination, NEQ, numéro fédéral,
 * date. Une liste qui nomme les manques dans un autre ordre que celui où l'œil
 * les cherche se lit deux fois.
 * ⚠️ LE SUJET EST EN COLONNES. On lui passe le résultat de `societeEnColonnes`,
 * pas l'état du formulaire.
 */
export function exigencesManquantesSociete(
  regime: RegimeEnBase,
  societe: { [K in ChampSociete]?: unknown },
): ExigenceSociete[] {
  return [
    ...groupesManquants(GROUPES_REQUIS_SOCIETE, societe),
    ...champsExigesSociete(regime).filter((champ) => estVide(societe[champ])),
  ];
}

/**
 * ★★ LE MINIMUM — « AU MOINS UN », ET C'EST LA QUATRIÈME FORME DE CE FICHIER.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-17 : l'étape 4 exige au moins UN administrateur
 * complet.
 *
 * ⛔ POURQUOI AUCUNE DES TROIS AUTRES NE POUVAIT LE DIRE. La liste plate et le
 * `Record` par discriminant jugent des CHAMPS d'UN sujet ; le groupe disjonctif
 * juge « au moins un champ rempli » sur UN sujet. Un minimum est une propriété
 * d'une COLLECTION, et une collection n'est pas un sujet. ★ La forme est
 * pourtant la même que celle du groupe — un existentiel sur un ensemble ; seul
 * l'ATOME change : `estVide(champ)` d'un côté, « cette ligne est complète » de
 * l'autre.
 *
 * ★ ET ELLE N'INTRODUIT AUCUN MÉCANISME ÉTRANGER : elle s'indexe par
 * `RoleAvecExigence`, LE discriminant que `CHAMPS_REQUIS` porte déjà. `Record`
 * force les quatre rôles à figurer, pour la même raison qu'au-dessus — un zéro
 * dit « ce rôle a été considéré et n'exige aucun minimum aujourd'hui », une
 * entrée manquante dirait « personne n'y a pensé ».
 *
 * ⛔ ELLE SERT DEUX CONSOMMATEURS DÈS SON PREMIER JOUR, et c'est ce qui la
 * justifie : l'étape 4, et `trousDeLaSociete`. Sans elle, la liste des trous ne
 * peut pas dire « cette société n'a aucun administrateur » — mesuré le
 * 2026-09-17 : 8 sociétés du parc sur 27 sont dans cet état, et 8 n'ont NI
 * administrateur, NI actionnaire, NI dirigeant.
 *
 * ⚖️ `shareholder` PASSE DE 0 À 1 LE 2026-09-17 (décision de Dom). ⛔ ET SON
 * DÉCOMPTE N'EST PAS CELUI D'UN RÔLE ORDINAIRE : un actionnaire peut être une
 * PERSONNE ou une SOCIÉTÉ, et les deux satisfont le minimum. Voir
 * `minimumManquant`, dont l'en-tête dit ce que chaque surface compte.
 *
 * ⚠️ UN NOMBRE, PAS UN BOOLÉEN. « Au moins un » est la règle d'aujourd'hui ;
 * une société ouverte en régime fédéral en exige TROIS (LCSA art. 102(2)). Le
 * jour où ce produit les servira, c'est ce chiffre qui change, pas la forme.
 * ⛔ Mais rien ici ne connaît ce cas : la valeur est 1, et la déclarer 3
 * aujourd'hui inventerait une règle que personne n'a décidée.
 */
export const MINIMUM_PAR_ROLE: Record<RoleAvecExigence, number> = {
  director: 1,
  officer: 0,
  shareholder: 1,
  entity_signatory: 0,
};

/**
 * Les champs qu'une LIGNE doit porter pour compter : son NOM, plus ce que son
 * rôle exige.
 *
 * ⛔ LE NOM VIENT DE `REQUIS_PAR_LE_COMPOSANT`, ET N'EST PAS RECOPIÉ ICI. Il n'a
 * jamais pu entrer dans `CHAMPS_REQUIS` — trois de ses quatre entrées sont vides
 * par décision — mais il est requis PAR CONSTRUCTION sur tout formulaire de
 * personne. Même concaténation, même raison et même forme que
 * `champsExigesSociete` : une seule définition, que l'astérisque, la garde et le
 * message lisent tous les trois.
 */
/**
 * ★ CE QU'UNE SURFACE DOIT SAVOIR NOMMER POUR UNE LIGNE, ET RIEN DE PLUS — la
 * même leçon que `ExigenceSociete` au lot B. `ChampPersonne` est `keyof
 * CompanyPerson`, soit une quarantaine de colonnes ; un écran qui devrait porter
 * un libellé pour chacune n'en porterait aucun de juste. Ce type-ci est DÉRIVÉ
 * des deux déclarations, donc il vaut exactement ce qui peut être réclamé.
 * ⛔ C'est le compilateur qui l'a exigé : le premier message de l'étape 4 ne
 * compilait pas, faute de libellé pour `address_line1` — un champ que rien
 * n'exige. La bonne réponse n'était pas d'écrire trente libellés morts.
 */
export type ChampExigeDeLaLigne =
  | (typeof REQUIS_PAR_LE_COMPOSANT)[number]
  | (typeof CHAMPS_REQUIS)[RoleAvecExigence][number];

export function champsExigesDeLaLigne(role: RoleAvecExigence): readonly ChampExigeDeLaLigne[] {
  return [...REQUIS_PAR_LE_COMPOSANT, ...CHAMPS_REQUIS[role]];
}

/** Ce qui manque à UNE ligne pour compter. `[]` = elle compte. */
export function champsManquantsDeLaLigne(
  role: RoleAvecExigence,
  ligne: { [K in ChampPersonne]?: unknown },
): ChampExigeDeLaLigne[] {
  return champsExigesDeLaLigne(role).filter((champ) => estVide(ligne[champ]));
}

/**
 * CE QU'UNE ENTITÉ DOIT PORTER POUR COMPTER — sa DÉNOMINATION, plus ce que
 * `CHAMPS_REQUIS_ENTITE` exige.
 *
 * ★ MÊME PLACE ET MÊME RAISON QUE `REQUIS_PAR_LE_COMPOSANT` POUR LES PERSONNES.
 * Le nom ne pouvait pas entrer dans `CHAMPS_REQUIS_ENTITE` : cette liste est
 * typée sur les colonnes d'ADRESSE (`ChampAdresse`), et `legal_name` n'en est
 * pas une. ⛔ ET LA TOUCHER CHANGERAIT QUATRE CONSOMMATEURS EXISTANTS — les
 * astérisques d'EntityForm, la garde de la création, celle de la correction, la
 * liste des trous. Une exigence neuve ne se glisse pas dans une liste que
 * d'autres lisent depuis des semaines ; elle se déclare à côté.
 *
 * ⚪ `legal_name` EST BIEN UNE COLONNE de `shareholder_entities` — c'est celle
 * que `trousDesEntites` lit pour nommer ses lignes.
 */
export const REQUIS_PAR_LE_COMPOSANT_ENTITE = ['legal_name'] as const;

export type ChampExigeDeLEntite = (typeof REQUIS_PAR_LE_COMPOSANT_ENTITE)[number] | ChampEntite;

/** Les champs qu'une ligne d'ENTITÉ doit porter. Pendant de `champsExigesDeLaLigne`. */
export function champsExigesDeLEntite(): readonly ChampExigeDeLEntite[] {
  return [...REQUIS_PAR_LE_COMPOSANT_ENTITE, ...CHAMPS_REQUIS_ENTITE];
}

/**
 * Ce qui manque à une ENTITÉ pour compter. `[]` = elle compte.
 * ⛔ DISTINCTE DE `champsManquantsEntite`, ET CE N'EST PAS UN DOUBLON. Celle-là
 * répond « que manque-t-il à cette fiche ? » et quatre surfaces la lisent ;
 * celle-ci répond « cette ligne peut-elle compter pour le minimum ? », ce qui
 * exige en plus une dénomination. Deux questions, deux fonctions.
 */
export function champsManquantsDeLEntite(
  entite: { [K in ChampExigeDeLEntite]?: unknown },
): ChampExigeDeLEntite[] {
  return champsExigesDeLEntite().filter((champ) => estVide(entite[champ]));
}

/**
 * COMBIEN DE LIGNES COMPLÈTES MANQUENT AU MINIMUM. `0` = il est atteint.
 *
 * ⛔ CE QUE LE MINIMUM COMPTE N'EST PAS LE MÊME OBJET SUR LES DEUX SURFACES, ET
 * CE N'EST PAS UNE DIVERGENCE — C'EST LA PROJECTION. Le NOMBRE est déclaré une
 * fois, ci-dessus ; ce que chaque surface a sous la main diffère :
 *
 *   · UNE SURFACE DE SAISIE compte ses lignes COMPLÈTES. Une ligne vierge n'est
 *     pas un administrateur, et l'écriture la saute (`continue`) : la compter
 *     ferait passer une étape qui n'écrit rien.
 *   · LA LISTE DES TROUS compte les personnes qui TIENNENT le rôle, complètes ou
 *     non. Une personne incomplète y a DÉJÀ sa ligne, qui nomme ce qui lui
 *     manque ; la recompter ici ferait deux lignes pour un seul manque, et la
 *     seconde dirait « aucun administrateur » d'une société qui en a un.
 *
 * ⛔⛔ ET L'ACTIONNARIAT COMPTE DEUX POPULATIONS, PAS UNE. Un actionnaire peut
 * être une PERSONNE (`company_people`) ou une SOCIÉTÉ (`shareholder_entities`) —
 * deux tables. Ne compter que la première dirait « aucun actionnaire » d'une
 * société dont l'unique détenteur est une société de gestion, ce que l'en-tête
 * de `NatureDetenteur` appelle « le cas le plus courant » pour une PME.
 * ⚪ Mesuré le 2026-09-17 : 3 sociétés du parc ont une entité détentrice en
 * cours, et AUCUNE n'a QUE des entités. Le défaut ne se voit donc pas
 * aujourd'hui — ce qui est précisément pourquoi il fallait le chercher.
 *
 * ★ LES DEUX SONT ÉCRITES CÔTE À CÔTE, DANS CE FICHIER, EXPRÈS. Cachée dans un
 * écran, la première serait une règle hors déclaration ; ici, les deux se lisent
 * ensemble et leur différence s'explique.
 */
export function minimumManquant(role: RoleAvecExigence, lignesQuiComptent: number): number {
  return Math.max(0, MINIMUM_PAR_ROLE[role] - lignesQuiComptent);
}

/** Les lignes d'une SAISIE qui comptent : celles à qui rien ne manque. */
export function lignesCompletes<P extends { [K in ChampPersonne]?: unknown }>(
  role: RoleAvecExigence,
  lignes: readonly P[],
): P[] {
  return lignes.filter((ligne) => champsManquantsDeLaLigne(role, ligne).length === 0);
}

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
 * Les champs qu'une portée EXIGE — l'UNION des rôles qu'elle nomme, sans
 * doublon. ⛔ UNE SEULE DÉFINITION : l'astérisque de PersonSelector,
 * `champsManquants` et la liste des trous la lisent, et aucun ne refait l'union
 * à la main.
 */
export function champsRequisDeLaPortee(portee: PorteeExigence): ChampPersonne[] {
  if (portee === HORS_ROLE_AUCUNE_EXIGENCE) return [];
  const roles: readonly RoleAvecExigence[] = typeof portee === 'string' ? [portee] : portee;
  return Array.from(new Set(roles.flatMap((r) => CHAMPS_REQUIS[r])));
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
  return champsRequisDeLaPortee(portee).filter((champ) => estVide(personne[champ]));
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
 * CE QU'UNE CORRECTION VIDE — les champs exigés qui portaient une valeur ENREGISTRÉE et
 * que la saisie laisse vides.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-13 : « empêcher de vider, pas imposer de remplir ». Une
 * correction n'est refusée que si elle vide un champ exigé qui portait une valeur ; un
 * champ DÉJÀ vide reste vide, et l'enregistrement passe. La création, elle, exige
 * toujours de remplir (`champsManquants`, `champsManquantsEntite`).
 * ⛔ LA COMPARAISON SE FAIT CONTRE LA FICHE ENREGISTRÉE, jamais contre la déclaration
 * seule : la déclaration dit ce qui est exigé, la fiche dit ce qu'il y avait.
 * ★ UNE FONCTION POUR LES DEUX CORRECTIONS, EditPersonModal et EditEntityModal : deux
 * règles écrites séparément recréeraient l'asymétrie que le lot C a fermée. Même
 * définition du vide : `estVide`.
 */
export function champsVidesParLaCorrection<C extends string>(
  exiges: readonly C[],
  enregistree: { [K in NoInfer<C>]?: unknown },
  saisie: { [K in NoInfer<C>]?: unknown },
): C[] {
  return exiges.filter((champ) => !estVide(enregistree[champ]) && estVide(saisie[champ]));
}

/**
 * LES RÔLES D'UNE PERSONNE, TELS QU'UNE LECTURE LES REND — et deux questions
 * posées sur les mêmes lignes.
 *
 * ★ LA REQUÊTE ET LES PRÉDICATS VIVENT ICI, UNE FOIS. La liste des trous les
 * applique à toutes les personnes d'une société ; la correction d'identité
 * (EditPersonModal) à une seule. Aucune des deux ne réécrit la requête, ni le
 * sens d'« actif » ou d'« imprimé ».
 */
export const SELECT_ROLES_PERSONNE =
  'director_mandates(deleted_at, is_active), officer_appointments(deleted_at, is_active), shareholding_holders(shareholdings(end_date))';

/** Ce que `SELECT_ROLES_PERSONNE` rend, embarqué sur une ligne de company_people. */
export interface PersonneAvecRoles {
  director_mandates?: { deleted_at: string | null; is_active: boolean }[];
  officer_appointments?: { deleted_at: string | null; is_active: boolean }[];
  shareholding_holders?: { shareholdings?: { end_date: string | null } | null }[];
}

/**
 * DEUX QUESTIONS — ET ELLES NE SE CONFONDENT PAS.
 *
 *   · `imprime` — la fiche PARAÎT DANS UN REGISTRE. C'est ce que
 *     lib/minute-book/registers.ts garde : un mandat ou une charge NON
 *     SUPPRIMÉS, actifs ou clos ; toute détention, en cours ou terminée (la
 *     section « Anciennes détentions »). ⚖️ Décision de Dom, 2026-09-13 : la
 *     liste des trous signale tout ce qui s'imprime, sans corriger le passé.
 *   · `actif` — le rôle est EN VIGUEUR. ⚖️ Décision de Dom, 2026-09-13 : une
 *     correction ne peut pas vider ce qu'un rôle actif exige.
 *
 * ⛔ SIGNALER N'EST PAS EXIGER. Un rôle clos se signale et n'oblige personne :
 * l'exigence ne mord qu'à la création, et à la correction qui VIDE ce qu'un rôle
 * actif exige (`champsVidesParLaCorrection`) ; aucune fiche close n'est remplie.
 * ⚠️ RIEN NE LIE `imprime` AUX FILTRES DES REGISTRES, SAUF check:adresses (A3) :
 * il lance les trois lecteurs et la liste des trous sur les mêmes fiches, et
 * refuse qu'une fiche imprimée sans ville ou sans pays manque à la liste.
 * ⚠️ NI `deleted_at` NI `is_active` SUR UNE DÉTENTION — mesuré : ces deux
 * colonnes n'existent pas sur `shareholdings`. « En cours » se dérive
 * d'`end_date`, la même source que le registre des actionnaires.
 */
export type EtatDuRole = 'imprime' | 'actif';

/** Les rôles qu'une lecture de company_people rend. `entity_signatory` ne s'y lit pas. */
const ROLES_LUS = ['director', 'officer', 'shareholder'] as const;

const TIENT_LE_ROLE: Record<(typeof ROLES_LUS)[number], (p: PersonneAvecRoles, etat: EtatDuRole) => boolean> = {
  director: (p, etat) => (p.director_mandates ?? []).some((m) => !m.deleted_at && (etat === 'imprime' || m.is_active)),
  officer: (p, etat) => (p.officer_appointments ?? []).some((m) => !m.deleted_at && (etat === 'imprime' || m.is_active)),
  shareholder: (p, etat) =>
    (p.shareholding_holders ?? []).some((h) => !!h.shareholdings && (etat === 'imprime' || !h.shareholdings.end_date)),
};

/**
 * La portée d'une personne dans l'état demandé : ses rôles QUI EXIGENT QUELQUE
 * CHOSE, en tuple non vide — ou HORS_ROLE_AUCUNE_EXIGENCE quand elle n'en tient
 * aucun. Un rôle dont l'entrée de CHAMPS_REQUIS est vide ne compte pas : il ne
 * peut rien exiger.
 */
export function porteeDeLaPersonne(p: PersonneAvecRoles, etat: EtatDuRole): PorteeExigence {
  const [premier, ...autres] = ROLES_LUS.filter((r) => CHAMPS_REQUIS[r].length > 0 && TIENT_LE_ROLE[r](p, etat));
  return premier ? [premier, ...autres] : HORS_ROLE_AUCUNE_EXIGENCE;
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
  | {
      sujet: 'personne';
      id: string;
      nom: string;
      champs: ChampPersonne[];
      /**
       * ⚖️ Décision de Dom, 2026-09-13 : la ligne d'une personne SANS rôle actif reste —
       * le registre l'imprime — et le classeur y ajoute une phrase, parce qu'aucun écran ne
       * corrige son identité. Dérivé par `porteeDeLaPersonne(…, 'actif')`, la portée même
       * de la correction.
       */
      roleActif: boolean;
    }
  | { sujet: 'entite'; id: string; nom: string; champs: ChampEntite[] }
  /**
   * ★★ LE QUATRIÈME MEMBRE — UN MANQUE QUI N'APPARTIENT À PERSONNE. Les trois
   * autres nomment un sujet à qui il manque des champs ; celui-ci dit qu'il
   * manque un SUJET. Aucune ligne de `company_people` ne peut le porter, par
   * définition : il n'y en a pas.
   * ⚠️ `id` EST CELUI DE LA SOCIÉTÉ, pour que la clé de rendu reste unique — il
   * ne désigne pas le manquant, qui n'existe pas.
   * ⛔ ET IL N'A PAS DE `champs`. Un consommateur qui teste un sujet puis traite
   * « sinon » comme une personne lirait `trou.nom` et `trou.champs` sur celui-ci :
   * les deux sont ABSENTS, donc le compilateur l'arrête. C'est voulu — c'est la
   * garde que l'en-tête de ce type réclame depuis le lot des entités.
   */
  | { sujet: 'minimum'; id: string; role: RoleAvecExigence; manque: number };

/**
 * Les trous d'une société — SON SIÈGE, PUIS LES TROIS FAMILLES DE RÔLES, UNE
 * LIGNE PAR PERSONNE, PUIS SES ACTIONNAIRES-SOCIÉTÉS, UNE LIGNE PAR ENTITÉ.
 *
 * ★ LE SIÈGE PASSE EN TÊTE, ET IL NE DÉPEND D'AUCUN RÔLE : c'est le sujet du livre
 * qui manque d'adresse, pas une personne. Sa ligne existe dès qu'un des cinq champs
 * de CHAMPS_REQUIS_SIEGE est vide.
 *
 * ⚖️ LES FICHES QUI S'IMPRIMENT, jamais toutes les personnes du dossier.
 * Décision de Dom, 2026-09-13 : « signaler tout ce qui s'imprime, sans corriger
 * le passé ». Un mandat clos, une charge terminée, une détention close paraissent
 * au registre : leur personne paraît ici (`porteeDeLaPersonne(…, 'imprime')`).
 * Une personne sans rôle, ou dont le seul mandat est supprimé, ne s'imprime pas
 * et n'est pas listée. Les entités suivent la même règle (`trousDesEntites`).
 * ⛔ SIGNALER N'EST PAS BLOQUER. Le classeur désactive son bouton principal et en
 * offre un second (`exportAnyway`) que la liste ne désactive jamais
 * (BinderExportModal) ; l'export porte le compte sur sa page de garde.
 * ⚠️ UNE PERSONNE AUX SEULS RÔLES CLOS NE SE CORRIGE PAS À L'ÉCRAN — mesuré le
 * 2026-09-13 : aucune section « anciens » n'ouvre EditPersonModal. Sa ligne porte
 * donc `roleActif: false`, et le classeur lui ajoute une phrase (décision de Dom).
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

  // ⚠️ LES ENTITÉS AVANT LE RETOUR ANTICIPÉ : elles ont leur propre déclaration, et une
  // société sans rôle exigeant peut encore avoir une actionnaire-société sans adresse.
  const { trous: trousEntites, detentricesEnCours } = await trousDesEntites(supabase, companyId);
  // Aucun rôle n'exige rien : aucune personne ne peut produire de trou, et
  // `entity_signatory` n'y participe jamais — son entrée est vide.
  if (!ROLES_LUS.some((r) => CHAMPS_REQUIS[r].length > 0)) return [...trouSiege, ...trousEntites];

  const { data, error } = await supabase
    .from('company_people')
    .select(`*, ${SELECT_ROLES_PERSONNE}`)
    .eq('company_id', companyId);

  // ⚠️ UN ÉCHEC DE LECTURE N'EST PAS UNE ABSENCE DE TROU. Rendre `[]` sur une
  // erreur ferait dire au modal « rien ne manque » alors qu'il ne sait rien.
  if (error) throw new Error(`trousDeLaSociete: read failed: ${error.message}`);

  const personnes = (data ?? []) as unknown as (CompanyPerson & PersonneAvecRoles)[];

  const trousPersonnes = personnes
    .map((p) => {
      const portee = porteeDeLaPersonne(p, 'imprime');
      if (portee === HORS_ROLE_AUCUNE_EXIGENCE) return null;
      // L'UNION des champs exigés par les rôles imprimés de cette personne : une
      // seule ligne, qui nomme tout ce qui lui manque.
      const champs = champsManquants(portee, p);
      if (champs.length === 0) return null;
      const roleActif = porteeDeLaPersonne(p, 'actif') !== HORS_ROLE_AUCUNE_EXIGENCE;
      return { sujet: 'personne' as const, id: p.id, nom: p.full_name, champs, roleActif };
    })
    .filter((t): t is Extract<Trou, { sujet: 'personne' }> => t !== null);

  /**
   * ★ LE MINIMUM, MESURÉ SUR LES RÔLES ACTIFS — pas sur les rôles imprimés.
   * Une société dont le seul mandat d'administrateur est CLOS n'a pas
   * d'administrateur : elle en a EU un. `porteeDeLaPersonne(…, 'actif')` est la
   * même lecture que celle qui décide ce qu'une correction ne peut pas vider.
   * ⛔ ET IL COMPTE LES PERSONNES QUI TIENNENT LE RÔLE, COMPLÈTES OU NON — voir
   * l'en-tête de `minimumManquant` : une personne incomplète a déjà SA ligne
   * au-dessus, et la recompter ici dirait « aucun administrateur » d'une société
   * qui en a un.
   */
  const trousMinima: Trou[] = ROLES_LUS.flatMap((role) => {
    // ⛔ LES ENTITÉS S'AJOUTENT AU SEUL RÔLE QU'ELLES PEUVENT TENIR. Écrit
    //   `role === 'shareholder' ? … : 0`, et jamais « sinon » : le jour où un
    //   quatrième rôle entre, il compte zéro entité parce que personne ne l'a
    //   décidé, pas parce qu'une branche par défaut l'a avalé.
    const tenants =
      personnes.filter((p) => TIENT_LE_ROLE[role](p, 'actif')).length +
      (role === 'shareholder' ? detentricesEnCours : 0);
    const manque = minimumManquant(role, tenants);
    return manque > 0 ? [{ sujet: 'minimum' as const, id: companyId, role, manque }] : [];
  });

  // ⚪ LES MINIMA EN TÊTE, AVANT MÊME LE SIÈGE : « il n'y a aucun administrateur »
  //   se lit avant « il manque la ville d'un tel ». L'absence prime le détail.
  return [...trousMinima, ...trouSiege, ...trousPersonnes, ...trousEntites];
}

/**
 * Les actionnaires-sociétés QUI S'IMPRIMENT et à qui manque ce que
 * CHAMPS_REQUIS_ENTITE exige — une ligne par entité.
 *
 * ★ UNE DÉTENTION, EN COURS OU TERMINÉE, SUFFIT : le registre des actionnaires imprime les
 * deux, la seconde sous « Anciennes détentions ». Même règle que l'actionnaire personne
 * (`porteeDeLaPersonne(…, 'imprime')`), décision de Dom du 2026-09-13.
 * ⚠️ UN ÉCHEC DE LECTURE LÈVE, pour la même raison que les personnes : ce n'est pas une
 * absence de trou.
 */
async function trousDesEntites(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ trous: Extract<Trou, { sujet: 'entite' }>[]; detentricesEnCours: number }> {
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
  return {
    trous: entites
      .filter((e) => (e.shareholding_holders ?? []).some((h) => !!h.shareholdings))
      .map((e) => ({ sujet: 'entite' as const, id: e.id, nom: e.legal_name, champs: champsManquantsEntite(e) }))
      .filter((t) => t.champs.length > 0),
    /**
     * ⛔ « EN COURS », PAS « IMPRIMÉ » — et c'est la même règle que pour les
     * personnes : une société dont la détention est CLOSE n'est plus actionnaire,
     * elle l'a ÉTÉ. Le filtre au-dessus, lui, garde les détentions closes parce
     * qu'elles s'impriment : deux questions, deux filtres, sur la même lecture.
     */
    detentricesEnCours: entites.filter((e) =>
      (e.shareholding_holders ?? []).some((h) => h.shareholdings && !h.shareholdings.end_date),
    ).length,
  };
}
