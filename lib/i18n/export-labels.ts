/**
 * Les chaînes de l'export du livre, côté serveur — page de garde comprise.
 *
 * Dépend de lib/i18n/server-messages.ts, le seul importeur des catalogues.
 * Séparé de section-labels.ts délibérément : un module nommé « section-labels »
 * qui porterait aussi le titre d'une page de garde serait un nom qui ment, et
 * il redeviendrait la porte par laquelle tout le monde lit le catalogue —
 * c'est-à-dire une seconde source unique.
 */

import { getServerMessage, type ServerLocale } from '@/lib/i18n/server-messages';

/** Le titre de la page de garde. */
export function getCoverTitle(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.cover.title', locale);
}

/**
 * Le sous-titre : le COMPTE des documents, au pluriel de la locale.
 *
 * ★ RÉUTILISE minuteBook.binder.documentCount, la clé de l'écran (62b2645).
 * La page de garde dit exactement la phrase que l'utilisateur a lue sur le
 * Livre avant de cliquer — pas une paraphrase, la même chaîne.
 *
 * ⚠️ Il n'y a plus de pourcentage, et ce n'est pas une simplification : un
 * livre n'a pas de dénominateur. Rien ne dit combien de pièces un livre de
 * minutes devrait contenir, et il en accumulera toute la vie de la société.
 */
export function getCoverSubtitle(count: number, locale: ServerLocale): string {
  return getServerMessage('minuteBook.binder.documentCount', locale, { count });
}

/**
 * Le nom du fichier de la page de garde dans l'archive.
 * Le préfixe « 00_ » est conservé dans les deux locales pour qu'elle trie en
 * tête, avant les dossiers « 1 - … » à « 9 - … ».
 */
export function getCoverFileName(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.cover.fileName', locale);
}

/**
 * La date de préparation, dans la locale — au lieu de 'fr-CA' en dur.
 * Format long : « 2 septembre 2026 » / « September 2, 2026 ».
 */
export function getCoverDate(date: Date, locale: ServerLocale): string {
  return date.toLocaleDateString(locale === 'en' ? 'en-CA' : 'fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Le titre de la page index. */
export function getIndexTitle(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.index.indexTitle', locale);
}

/** Le nom du fichier de l'index dans l'archive — « 01_ » pour trier après la garde. */
export function getIndexFileName(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.index.indexFileName', locale);
}

/** Les deux entêtes de colonnes de l'index. */
export function getIndexColumns(locale: ServerLocale): { title: string; fileName: string } {
  return {
    title: getServerMessage('minuteBook.binderExport.index.columnTitle', locale),
    fileName: getServerMessage('minuteBook.binderExport.index.columnFileName', locale),
  };
}

/**
 * La BASE du nom de l'archive : « livre-minutes » / « minute-book ».
 * Le nom complet est {base}-{dénomination}-{date}.zip, composé dans la route.
 *
 * ⚠️ Elle était écrite en dur, en français, à DEUX endroits — la route et le
 * repli du modal. Le commit fa6cb2d avait localisé le nom du fichier DANS
 * l'archive (la page de garde), pas celui de l'archive elle-même : deux objets
 * que le mot « archive » confondait.
 */
export function getArchiveBaseName(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.archiveBaseName', locale);
}

/** Le nom du fichier des registres, dans le dossier de l'étagère 7. */
export function getRegistersFileName(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.registers.fileName', locale);
}

/**
 * L'étiquette de la date d'arrêté des registres — le mot du cabinet, « En date
 * du » / « As at », jamais « Date ». La VALEUR se formate avec getCoverDate,
 * le même formateur que la page de garde : un seul format de date dans l'export.
 */
export function getRegistersAsAtLabel(locale: ServerLocale): string {
  return getServerMessage('minuteBook.binderExport.registers.asAtLabel', locale);
}

/**
 * Les libellés des registres, tous tirés de `minuteBook.registers.*` — les MÊMES
 * que l'écran emploie. ⛔ Aucune table neuve : ce lot en a supprimé sept.
 */
export function getRegisterLabels(locale: ServerLocale) {
  const col = (k: string) => getServerMessage(`minuteBook.registers.columns.${k}`, locale);
  return {
    name: col('name'), residence: col('residence'), start: col('start'), end: col('end'),
    active: col('active'), title: col('title'), shareClass: col('shareClass'),
    quantity: col('quantity'), certificate: col('certificate'), issueDate: col('issueDate'),
    statedCapital: col('statedCapital'),
    empty: getServerMessage('minuteBook.registers.emptyRegister', locale),
    yes: getServerMessage('minuteBook.registers.residentYes', locale),
    no: getServerMessage('minuteBook.registers.residentNo', locale),
    // Colonne « Actif » : des MOTS, jamais un symbole. Le conteneur de
    // production n'embarque qu'Open Sans, qui ne porte ni U+2713 ni U+2717.
    activeYes: getServerMessage('minuteBook.registers.activeYes', locale),
    activeNo: getServerMessage('minuteBook.registers.activeNo', locale),
    missingConsideration: (count: number) =>
      getServerMessage('minuteBook.registers.missingConsideration', locale, { count }),
    registerCount: (count: number) =>
      getServerMessage('minuteBook.binder.registerCount', locale, { count }),
  };
}
