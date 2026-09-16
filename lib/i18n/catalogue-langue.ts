/**
 * LE CATALOGUE DANS UNE LANGUE CHOISIE — résolveur de clé pointée, client ET serveur.
 *
 * ⚠️⚠️ IL Y A TROIS LANGUES DANS CE PRODUIT, ET UNE CHAÎNE QUI NE DIT PAS
 * LAQUELLE ELLE SUIT FINIRA PAR SUIVRE LA MAUVAISE :
 *   · la LOCALE DE L'URL          — ce que `useTranslations` lit ;
 *   · la LANGUE DE L'INSCRIPTION  — `activeLocale`, qui peut en diverger ;
 *   · la LANGUE DU DOCUMENT       — `documents.language`.
 * Ce module ne devine aucune des trois : la langue est un PARAMÈTRE, nommé au
 * point d'appel. Un lecteur voit donc laquelle est suivie sans quitter la ligne.
 *
 * ⛔ POURQUOI IL EXISTE, ET CE QU'IL REMPLACE. `useResolveurCatalogue` est lié à
 * l'URL ; `getServerMessage` est interdit d'import depuis un composant client. Il
 * manquait la troisième forme : un résolveur CLIENT lié à une langue choisie.
 * Son absence a produit deux tables de libellés recopiées dans deux modales —
 * et l'une d'elles écrivait au JOURNAL un code brut côté anglais.
 *
 * ★ LE PATRON N'EST PAS NEUF, IL EST SEULEMENT RANGÉ. Sept fichiers importaient
 * déjà les deux catalogues (`lifecycle-labels`, `StepCelebration`, `StepCompany`,
 * `StepSiege`, `StepLanguage`, `BlocAdresse`, `SettingsClient`), dont un module
 * importé par un composant CLIENT. Ce fichier ne crée pas une capacité : il
 * donne un nom à celle qui existait.
 */
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

export type LangueCatalogue = 'fr' | 'en';

const CATALOGUES: Record<LangueCatalogue, unknown> = { fr: frMessages, en: enMessages };

/**
 * Le texte d'une clé POINTÉE depuis la racine (`officers.titles.president`),
 * dans la langue demandée.
 *
 * ⛔ IL LÈVE PLUTÔT QUE DE RENDRE LA CLÉ. C'est la règle que `libelleTitre` et le
 * registre appliquent déjà : un libellé manquant est un défaut de catalogue, pas
 * un texte à afficher. Rendre la clé la ferait voyager jusqu'à l'écran — ou,
 * pire, jusqu'au journal, où elle serait consignée pour toujours.
 */
export function texteDuCatalogue(langue: LangueCatalogue, cle: string): string {
  const valeur = cle
    .split('.')
    .reduce<unknown>(
      (noeud, segment) =>
        noeud && typeof noeud === 'object'
          ? (noeud as Record<string, unknown>)[segment]
          : undefined,
      CATALOGUES[langue],
    );
  if (typeof valeur !== 'string') {
    throw new Error(`texteDuCatalogue: clé absente du catalogue ${langue} — "${cle}"`);
  }
  return valeur;
}

/**
 * La même chose sous la signature `(cle: string) => string` que `libelleTitre`
 * attend — le pendant client de `(cle) => getServerMessage(cle, langue)`.
 */
export function resolveurDeLangue(langue: LangueCatalogue): (cle: string) => string {
  return (cle: string) => texteDuCatalogue(langue, cle);
}
