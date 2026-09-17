/**
 * LE TEXTE QUE LE JOURNAL ÉCRIT POUR UNE CHARGE — fonction pure, deux langues.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-16 : la page Historique est un REGISTRE DU LIVRE.
 * Un registre qui écrit un mauvais titre est déjà un registre qui ment — donc on
 * commence par ce qu'il ÉCRIT, avant ce qu'il montre.
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL EST EN BASE. Deux modales composaient
 * ce texte chacune de son côté : la française par une table recopiée, l'ANGLAISE
 * en interpolant `${title}` — LE CODE. Quatre lignes du parc portent donc
 * « Officer appointed: … — vice_president », et elles y resteront : ce sont des
 * enregistrements datés, on ne réécrit pas l'histoire.
 * ⚠️ Et les deux tables recopiées avaient REDIVERGÉ du catalogue le jour même,
 * sur « Trésorier·ère » contre « Trésorier·ière ».
 *
 * ★ POURQUOI DANS `lib/` ET PAS DANS LA MODALE. Une modale passe par un portail
 * et rend `null` hors navigateur : sa règle est INVÉRIFIABLE autrement qu'à
 * l'œil. Le texte d'un registre ne peut pas reposer sur « quelqu'un l'a regardé
 * une fois ». Sorti ici, il s'exécute dans une sonde.
 *
 * ⚪ LES TOURNURES DE PHRASE RESTENT ÉCRITES ICI, dans les deux langues. Ce n'est
 * pas une chaîne d'interface : le journal STOCKE du texte rendu, dans les deux
 * langues, au moment de l'écriture — il ne peut donc pas passer par
 * `useTranslations`. Elles vivaient en deux exemplaires ; elles en ont un.
 */
import { libelleTitre } from '@/lib/officer-titles';
import { resolveurDeLangue } from '@/lib/i18n/catalogue-langue';

/** Les lignes de journal qu'une charge produit. */
export type EvenementCharge = 'nomme' | 'nomme_retroactif' | 'retire' | 'remplace';

const TOURNURES: Record<EvenementCharge, { fr: string; en: string }> = {
  nomme: { fr: 'Dirigeant nommé', en: 'Officer appointed' },
  nomme_retroactif: { fr: 'Dirigeant nommé (rétroactif)', en: 'Officer appointed (retroactive)' },
  retire: { fr: 'Dirigeant retiré', en: 'Officer removed' },
  remplace: { fr: 'Dirigeant remplacé', en: 'Officer replaced' },
};

/**
 * ⚠️ POURQUOI `remplace` A SA PROPRE FONCTION PLUS BAS, ET PAS LA MÊME.
 * Les trois premières tournures nomment UNE personne ; celle-ci en nomme DEUX.
 * Les faire entrer dans une signature commune demanderait une union sur le
 * paramètre de nom — c'est-à-dire une abstraction tordue pour économiser une
 * fonction. La TOURNURE reste ici, avec les trois autres ; seule l'arité
 * diffère, parce que le GESTE diffère.
 * ⛔ `Exclude<…, 'remplace'>` sur la fonction à un nom rend l'erreur IMPOSSIBLE :
 * passer 'remplace' à la mauvaise porte ne compile pas.
 */

/**
 * Les deux titres d'une ligne de journal, composés du MÊME geste.
 *
 * ⛔ LE TITRE PASSE PAR `libelleTitre`, DONC PAR LE CATALOGUE. Un titre inconnu
 * FAIT LEVER plutôt que de s'imprimer brut — la règle du registre, appliquée à
 * l'écriture. Un code consigné au journal y reste pour toujours.
 * ⚪ `custom` rend son `custom_title` VERBATIM, et replie sur « Titre
 * personnalisé » quand il est vide. Les deux modales repliaient autrement —
 * l'une sur la chaîne VIDE, l'autre sur le code `custom`. Aucune des deux
 * n'était juste ; celle-ci l'est pour les deux.
 */
export function titresDeJournalCharge(
  evenement: Exclude<EvenementCharge, 'remplace'>,
  nomComplet: string,
  charge: { title: string; custom_title: string | null },
): { titleFr: string; titleEn: string } {
  const t = TOURNURES[evenement];
  return {
    titleFr: `${t.fr} : ${nomComplet} — ${libelleTitre(charge, resolveurDeLangue('fr'))}`,
    titleEn: `${t.en}: ${nomComplet} — ${libelleTitre(charge, resolveurDeLangue('en'))}`,
  };
}

/**
 * LES DEUX TITRES D'UN REMPLACEMENT — une charge qui change de main.
 *
 * ⛔ UNE LIGNE, PAS DEUX, ET C'EST L'ÉCRAN QUI LE DIT. `ReplaceOfficerModal`
 * montre UN titre (`replaceOfficer`) et UN bouton (`confirmReplace`) ; le code
 * fait TROIS écritures — la personne parfois, la fin du sortant, la nomination
 * de l'entrant. On consigne ce que la personne a FAIT, pas ce que le code a
 * exécuté. Même règle que l'inscription : il ne s'est pas passé trois choses.
 *
 * ⛔ ET LA MÊME LIGNE SERT LES DEUX PORTES. La branche `replaceConflict`
 * d'`AddOfficerModal` est le MÊME geste vu d'ailleurs : elle désactive le
 * titulaire en conflit puis nomme le nouveau. Elle écrivait « Dirigeant nommé »
 * et TAISAIT la désactivation — un autre associé voyait l'arrivée sans voir le
 * départ. Mesuré le 2026-09-17.
 *
 * ⚪ LE TITRE VIENT DU CATALOGUE, par `libelleTitre`, comme les trois autres
 * tournures. Aucune table recopiée : on en a fermé deux la veille.
 */
export function titresDeJournalRemplacement(
  nomSortant: string,
  nomEntrant: string,
  charge: { title: string; custom_title: string | null },
): { titleFr: string; titleEn: string } {
  const t = TOURNURES.remplace;
  const poste = (langue: 'fr' | 'en') => libelleTitre(charge, resolveurDeLangue(langue));
  return {
    titleFr: `${t.fr} : ${nomSortant} → ${nomEntrant} — ${poste('fr')}`,
    titleEn: `${t.en}: ${nomSortant} → ${nomEntrant} — ${poste('en')}`,
  };
}
