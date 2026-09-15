/**
 * LES DEUX RÉGIMES — ET LES DEUX FAÇONS DE LES NOMMER, QUI NE SONT PAS UN DOUBLON.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-15. Le catalogue porte MAINTENANT deux vocabulaires
 * pour le même régime, et ce module existe pour que personne ne les « unifie »
 * dans trois mois en croyant réparer une duplication :
 *
 *   · `common.regimes.<db>.choix` — UNE OPTION. Elle demande à quelqu'un de
 *     CHOISIR : « Société constituée au Québec ». Elle ne paraît qu'à UN endroit
 *     dans tout le produit, l'étape 2 de l'inscription, sur une carte large.
 *   · `common.regimes.<db>.jurisdiction` — UNE ÉTIQUETTE. Elle dit à quelqu'un ce
 *     qu'il A : « Provincial — Québec ». Elle vit dans une pastille de barre
 *     latérale et sur une ligne verrouillée de Paramètres.
 *
 * ★ CE NE SONT PAS DEUX NOMS D'UNE MÊME CHOSE, CE SONT DEUX CHOSES. Un sélecteur
 * de société qui dirait « Société constituée au Québec » serait absurde : il
 * n'invite à rien, il constate. Et une carte de choix qui dirait « Provincial —
 * Québec » demanderait à un propriétaire de PME de reconnaître une juridiction
 * plutôt que de décrire sa situation.
 *
 * QUI LIT QUOI — l'état au 2026-09-15 :
 *
 *   clé            | lue par                                              | rôle
 *   ---------------|------------------------------------------------------|----------
 *   `choix`        | l'étape 2 (StepCompany)                              | choisir
 *   `law`          | l'étape 2 (StepCompany)                              | choisir
 *   `acronym`      | le sélecteur de société · Paramètres · le sommaire   | étiqueter
 *   `jurisdiction` | le sélecteur de société · Paramètres                 | étiqueter
 *
 * ⛔ NE PAS FAIRE LIRE `choix` À UNE SURFACE D'ÉTIQUETTE. Le sélecteur latéral
 * porte sa propre mesure de largeur dans son commentaire — « Provincial — Québec ·
 * LSAQ » y faisait déjà 26 caractères contre 14, et la juridiction s'y ENROULE
 * sans jamais se tronquer. Une phrase de 28 caractères y tiendrait sur trois
 * lignes.
 *
 * ⛔ AUCUNE CHAÎNE N'EST ÉCRITE ICI, et c'est la discipline de lib/provinces.ts et
 * lib/countries.ts, ses voisins : les libellés vivent dans le catalogue, traduits
 * dans les deux locales. Ce module ne porte que la STRUCTURE et le VOCABULAIRE.
 */

import type { IncorporationType } from '@/lib/types';

/** Ce que la base stocke, borné par `companies_incorporation_type_check`. */
export type RegimeEnBase = 'LSA' | 'CBCA';

/**
 * L'ORDRE DES DEUX CARTES, ET LA SEULE TABLE DE CORRESPONDANCE DES DEUX
 * VOCABULAIRES.
 *
 * ⚠️ DEUX VOCABULAIRES POUR UN MÊME RÉGIME, ET CE N'EST PAS UN CHOIX — c'est
 * l'état du dépôt. Le flux d'inscription manipule `'LSAQ' | 'CBCA'`
 * (`IncorporationType`), la base stocke `'LSA' | 'CBCA'`. Le renommage est en
 * file, dans son propre lot, parce qu'il touche la contrainte CHECK.
 */
export const REGIMES: readonly { flux: IncorporationType; base: RegimeEnBase }[] = [
  { flux: 'LSAQ', base: 'LSA' },
  { flux: 'CBCA', base: 'CBCA' },
];

/**
 * Le vocabulaire de la BASE, depuis celui du FLUX.
 *
 * ⚠️ `=== 'CBCA'` ET JAMAIS `!== 'LSA'`, et la raison n'est pas stylistique :
 * `'CBCA'` est la SEULE valeur identique dans les deux vocabulaires. Une liste de
 * refus écrite sur `'LSA'` laisserait passer `'LSAQ'` EN SILENCE — c'est
 * exactement l'avertissement que portent déjà lib/residency.ts, le sélecteur de
 * société et l'écriture de l'étape 3.
 *
 * ★ POURQUOI CETTE FONCTION EXISTE. La conversion était écrite à DEUX endroits —
 * `dbType` à l'écriture de l'étape 3, `dbValue` sur les cartes de l'étape 2 — et
 * le sommaire de l'étape 7 allait être le TROISIÈME. La troisième copie est
 * toujours celle où ça se passe mal.
 */
export function regimeEnBase(type: IncorporationType): RegimeEnBase {
  return type === 'CBCA' ? 'CBCA' : 'LSA';
}
