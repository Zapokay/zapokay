'use client';

/**
 * LA PORTE DU CATALOGUE CÔTÉ CLIENT — le pendant exact de `getServerMessage`.
 *
 * ⛔ POURQUOI CE FICHIER EXISTE, ET CE QU'IL N'EST PAS. Il ne déclare AUCUN
 * libellé et ne connaît AUCUNE clé : il adapte un traducteur next-intl à la
 * signature `(cle: string) => string` que `libelleTitre` attend. La
 * déclaration, elle, vit dans `lib/officer-titles.ts`, en un seul exemplaire,
 * et le catalogue porte les textes.
 *
 * ⚠️ LA RAISON EST MESURÉE AU COMPILATEUR, PAS SUPPOSÉE. `global.d.ts` augmente
 * `IntlMessages` depuis messages/fr.json, donc next-intl type la clé contre
 * l'arbre réel — une garde qu'on veut garder. Conséquence : le traducteur
 * n'accepte pas un `string` quelconque, et `tsc` refuse de le passer là où un
 * `(cle: string) => string` est attendu :
 *
 *   TS2345 : Type 'string' is not assignable to type
 *            'MessageKeys<IntlMessages, …>'
 *
 * ★ UN SEUL TRANSTYPAGE DANS TOUT LE DÉPÔT, ET IL EST ICI. L'autre façon
 * d'écrire cela en aurait demandé un par point d'appel — seize, tous
 * identiques, tous à relire un jour. Celui-ci est nommé, commenté, et il a un
 * seul lecteur : la fonction ci-dessous.
 *
 * ⛔ NE PAS IMPORTER `lib/i18n/server-messages.ts` DEPUIS UN COMPOSANT CLIENT.
 * C'est la règle posée dans ce fichier-là, et ce module existe précisément
 * pour que personne n'ait à l'enfreindre : le serveur résout par
 * `getServerMessage`, le client par ce crochet, et les DEUX lisent les mêmes
 * clés — celles de `CLE_TITRE`.
 */

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

/**
 * ⚠️ LE TYPE DE LA CLÉ NE SE NOMME PAS D'ICI, ET C'EST MESURÉ. Une première
 * version écrivait `Parameters<ReturnType<typeof useTranslations>>[0]` : le
 * générique s'instancie alors SANS portée, et l'union obtenue n'est pas celle
 * qu'attend le point d'appel — `tsc` a rendu
 *
 *   TS2345 : Type '"fr"' is not assignable to type
 *            'MessageKeys<IntlMessages, …>'
 *
 * — c'est-à-dire qu'il proposait les clés de premier niveau d'un AUTRE arbre.
 * Le transtypage porte donc sur la FONCTION, une fois, plutôt que sur une clé
 * dont on ne sait pas écrire le type.
 */

/**
 * Un résolveur de clés COMPLÈTES (`officers.titles.president`), pointées
 * depuis la racine du catalogue — exactement les clés que le serveur résout.
 *
 * ⚠️ LA RACINE, ET PAS UNE PORTÉE. Un traducteur de portée (`useTranslations
 * ('officers')`) obligerait chaque appelant à raboter le préfixe de la clé,
 * c'est-à-dire à la réécrire — donc à en former une seconde version, dans le
 * fichier même dont ce lot retire la table.
 */
/**
 * ⚠️ L'IDENTITÉ DE LA FONCTION RENDUE DOIT ÊTRE STABLE, ET C'EST MESURÉ.
 * Une première version rendait le traducteur sans le mémoïser : le résolveur
 * devenait une valeur neuve à chaque rendu, et `react-hooks/exhaustive-deps`
 * a signalé une dépendance manquante chez l'appelant — un avertissement de
 * plus au compte du dépôt. `useCallback` rend l'identité stable, donc
 * l'inscrire dans un tableau de dépendances ne déclenche aucun re-rendu.
 */
export function useResolveurCatalogue(): (cle: string) => string {
  const t = useTranslations();
  return useCallback((cle: string) => (t as unknown as (c: string) => string)(cle), [t]);
}
