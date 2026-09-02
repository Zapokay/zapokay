/**
 * LE SEUL ENDROIT QUI IMPORTE LES CATALOGUES CÔTÉ SERVEUR.
 *
 * Deux modules du dépôt réécrivaient la même plomberie — les deux imports de
 * JSON, un `Record<locale, Shape>` privé, un accès à la main. Un troisième en
 * aurait fait trois. Ici, une porte unique, et deux conséquences :
 *
 *   · la frontière serveur/client n'a plus qu'un fichier à surveiller. Mesuré
 *     2026-09-02 : un chunk client porte déjà une copie complète du catalogue,
 *     et package.json ne déclare aucun `sideEffects`, donc webpack ne peut pas
 *     l'élaguer. ⛔ AUCUN composant client ne doit importer ce module.
 *   · le PLURIEL vit ici. `createTranslator` de next-intl n'a besoin d'aucun
 *     contexte de requête — ce qui compte, car une route sous /api n'a pas de
 *     segment [locale] et le middleware l'écarte dès sa première ligne.
 *
 * ⚠️ UNE CLÉ MANQUANTE LÈVE. Règle héritée de lifecycle-labels.ts, et pour la
 * même raison : plutôt crier que glisser un identifiant technique dans un livre
 * de minutes. next-intl rendrait la clé brute ; on refuse ce comportement.
 *
 * ⛔ lifecycle-labels.ts n'est PAS migré vers ce module. Il fonctionne, et son
 * rangement est un lot à soi.
 */

import { createTranslator } from 'next-intl';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

export type ServerLocale = 'fr' | 'en';

type Catalogue = Record<string, unknown>;

const CATALOGUES: Record<ServerLocale, Catalogue> = {
  fr: frMessages as unknown as Catalogue,
  en: enMessages as unknown as Catalogue,
};

/** Un traducteur par locale, bâti une fois sur le catalogue entier. */
type Formateur = (key: string, values: Record<string, string | number | Date>) => string;

const TRADUCTEURS: Record<ServerLocale, Formateur> = {
  fr: createTranslator({ locale: 'fr', messages: frMessages }) as unknown as Formateur,
  en: createTranslator({ locale: 'en', messages: enMessages as never }) as unknown as Formateur,
};

/** Descend une clé pointée dans un catalogue. Rend undefined plutôt que de lever. */
function brut(catalogue: Catalogue, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (noeud, part) =>
      noeud && typeof noeud === 'object'
        ? (noeud as Record<string, unknown>)[part]
        : undefined,
    catalogue,
  );
}

/**
 * Le message d'une clé pointée, dans la locale demandée, valeurs ICU comprises.
 *
 * @throws si la locale est invalide, ou si la clé n'existe pas / est vide dans
 *         le catalogue de cette locale.
 */
export function getServerMessage(
  key: string,
  locale: ServerLocale,
  values?: Record<string, string | number | Date>,
): string {
  if (locale !== 'fr' && locale !== 'en') {
    throw new Error(`getServerMessage: invalid locale "${locale}"`);
  }
  const valeur = brut(CATALOGUES[locale], key);
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    throw new Error(`getServerMessage: no message for key="${key}" locale="${locale}"`);
  }
  // Sans valeurs, rien à formater : le message brut EST le résultat. Cela évite
  // aussi de faire passer par ICU des chaînes qui contiennent une accolade
  // décorative.
  if (!values) return valeur;

  // ⚠️ LE TRADUCTEUR EST BÂTI SUR LE VRAI CATALOGUE, avec la vraie clé pointée.
  // Une première version l'enveloppait dans un faux namespace `__zk` pour n'y
  // mettre qu'un message : tsc l'a refusé — global.d.ts déclare `IntlMessages`
  // à partir de messages/fr.json, et next-intl type le namespace contre lui.
  // Passer par le catalogue réel est aussi plus honnête : la clé formatée est
  // celle qui existe.
  return TRADUCTEURS[locale](key, values);
}
