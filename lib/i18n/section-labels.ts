/**
 * Libellés des sections du Livre, côté SERVEUR.
 *
 * Forme calquée sur lib/i18n/lifecycle-labels.ts : les deux catalogues sont
 * importés statiquement, la fonction prend (clé, locale), et elle LÈVE si le
 * libellé manque ou est vide. La raison est celle de son précédent — plutôt
 * crier que glisser un identifiant technique dans un livre de minutes.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE À PART, ET PAS DANS lib/minute-book-section.ts.
 * Ce fichier-là est importé comme VALEUR par des composants client
 * (UploadDocumentModal lit MINUTE_BOOK_SECTIONS). Y placer
 * `import frMessages from '@/messages/fr.json'` embarquerait les deux
 * catalogues dans le paquet du navigateur. Mesuré 2026-09-02 : un chunk client
 * porte déjà une copie complète du catalogue — 85 % des chaînes purement ASCII
 * s'y retrouvent, le reste n'y échappant qu'à l'échappement `\xea` — et
 * package.json ne déclare AUCUN `sideEffects`, donc webpack ne peut pas
 * l'élaguer. Ce module n'est importé que par du code serveur.
 *
 * ★ LA LISTE ORDONNÉE N'EST PAS REDÉCLARÉE ICI : elle est importée. La source
 * unique du 0257ce6 ne se dédouble pas — c'est elle qui donne aussi le RANG,
 * donc le numéro du dossier, qui n'est jamais écrit à la main.
 */

import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import { MINUTE_BOOK_SECTIONS, type MinuteBookSection } from '@/lib/minute-book-section';

export type SectionLabelLocale = 'fr' | 'en';

interface MessagesShape {
  minuteBook?: { binder?: { sections?: Partial<Record<string, string>> } };
}

const MESSAGES: Record<SectionLabelLocale, MessagesShape> = {
  fr: frMessages as unknown as MessagesShape,
  en: enMessages as unknown as MessagesShape,
};

/**
 * Le libellé d'une section, dans la langue demandée.
 *
 * @throws si la locale est invalide, ou si la clé n'a aucun libellé non vide
 *         dans le catalogue de cette locale.
 */
export function getSectionLabel(
  section: MinuteBookSection,
  locale: SectionLabelLocale,
): string {
  if (locale !== 'fr' && locale !== 'en') {
    throw new Error(`getSectionLabel: invalid locale "${locale}"`);
  }
  const label = MESSAGES[locale].minuteBook?.binder?.sections?.[section];
  if (!label || label.trim() === '') {
    throw new Error(
      `getSectionLabel: no label for section="${section}" locale="${locale}"`,
    );
  }
  return label;
}

/**
 * Le nom du dossier d'une section dans l'archive : « N - Libellé ».
 *
 * ★ LE NUMÉRO VIENT DU RANG DANS LA LISTE, jamais d'un littéral. Réordonner la
 * taxonomie renumérote l'export sans que personne ait à y penser.
 *
 * ⚠️ ACCENTS ET ESPACES CONSERVÉS, et c'est une décision datée (2026-09-02).
 * Mesuré sur JSZip 3.10.1 : le drapeau UTF-8 (bit 11) est posé et l'aller-retour
 * d'un nom accentué est identique. Les très vieux extracteurs qui ignorent ce
 * drapeau afficheront des caractères abîmés ; un dossier nommé « Depots et avis
 * federaux » dans un livre de minutes québécois ferait plus de mal.
 */
export function getSectionFolderName(
  section: MinuteBookSection,
  locale: SectionLabelLocale,
): string {
  const rang = MINUTE_BOOK_SECTIONS.indexOf(section);
  if (rang === -1) {
    throw new Error(`getSectionFolderName: unknown section "${section}"`);
  }
  return `${rang + 1} - ${getSectionLabel(section, locale)}`;
}
