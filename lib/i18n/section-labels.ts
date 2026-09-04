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
 * (UploadDocumentModal lit MINUTE_BOOK_SECTIONS). Y placer un accès aux
 * catalogues embarquerait les deux dans le paquet du navigateur. Le raisonnement
 * complet et sa mesure vivent dans lib/i18n/server-messages.ts, seul importeur
 * des JSON. Ce module n'est importé que par du code serveur.
 *
 * ★ LA LISTE ORDONNÉE N'EST PAS REDÉCLARÉE ICI : elle est importée. La source
 * unique du 0257ce6 ne se dédouble pas — c'est elle qui donne aussi le RANG,
 * donc le numéro du dossier, qui n'est jamais écrit à la main.
 */

import { getServerMessage, type ServerLocale } from '@/lib/i18n/server-messages';
import { MINUTE_BOOK_SECTIONS, type MinuteBookSection } from '@/lib/minute-book-section';
import { toStorageSafeName } from '@/lib/storage-key';

export type SectionLabelLocale = ServerLocale;

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
  // La levée sur clé absente vit désormais dans getServerMessage — même règle,
  // un seul endroit qui la porte.
  return getServerMessage(`minuteBook.binder.sections.${section}`, locale);
}

/**
 * Le nom du dossier d'une section dans l'archive : « N - Libellé ».
 *
 * ★ LE NUMÉRO VIENT DU RANG DANS LA LISTE, jamais d'un littéral. Réordonner la
 * taxonomie renumérote l'export sans que personne ait à y penser.
 *
 * ⛔ ACCENTS ET ESPACES RETIRÉS — DÉCISION DU 2026-09-04, QUI EN RENVERSE UNE.
 *
 * Le 2026-09-02, ce même commentaire disait l'inverse : accents conservés, au
 * motif — MESURÉ, et toujours vrai — que JSZip 3.10.1 pose le drapeau UTF-8
 * (bit 11) et qu'un nom accentué fait l'aller-retour à l'identique. Cette
 * mesure n'est pas invalidée ; elle est hors sujet.
 *
 * Elle portait sur NOTRE producteur. La question posée le 09-04 porte sur le
 * système du DESTINATAIRE : « on ne sait jamais à qui l'utilisateur envoie son
 * archive ni quel système il utilise ». Ce terrain-là n'est pas observable
 * depuis ici — nous ne pouvons ni le mesurer ni le nier. Devant une inconnue
 * qu'on ne peut pas lever, la compatibilité passe devant l'orthographe.
 *
 * Le prix est assumé : « 4 - Depots et avis federaux » dans un livre de minutes
 * québécois se lit moins bien. Cinq dossiers français sur neuf portaient des
 * accents, un seul en anglais (« 5 - Québec Declarations »).
 *
 * ★ Le libellé accentué N'EST PAS PERDU : getSectionLabel le rend intact, et
 * c'est lui que l'index du PDF affiche en titre de section. L'archive perd les
 * accents dans ses CHEMINS, pas dans son texte.
 *
 * ── 2026-09-05 : LES ESPACES REVIENNENT, LES ACCENTS RESTENT PARTIS ─────────
 * La décision du 09-04 avait emporté les espaces avec les accents, par un
 * malentendu sur sa formulation : l'un était souhaité « s'il le faut », l'autre
 * exigé. Le risque de compatibilité mesuré ne porte que sur les ACCENTS — un
 * système de destination qui les abîme ne bute pas sur une espace, qui passe
 * partout. « 6 - Minutes and Resolutions » se lit ; « 6_-_Minutes_and_
 * Resolutions » ne se lit pas mieux qu'un nom accentué.
 */
export function getSectionFolderName(
  section: MinuteBookSection,
  locale: SectionLabelLocale,
): string {
  const rang = MINUTE_BOOK_SECTIONS.indexOf(section);
  if (rang === -1) {
    throw new Error(`getSectionFolderName: unknown section "${section}"`);
  }
  // La règle UNIQUE du dépôt, la même qui nomme les fichiers de l'archive.
  // `readable` : voir la note du 2026-09-05 ci-dessus.
  return toStorageSafeName(`${rang + 1} - ${getSectionLabel(section, locale)}`, 80, {
    readable: true,
  });
}
