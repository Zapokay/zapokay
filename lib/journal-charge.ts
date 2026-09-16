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

/** Les trois lignes de journal qu'une charge produit aujourd'hui. */
export type EvenementCharge = 'nomme' | 'nomme_retroactif' | 'retire';

const TOURNURES: Record<EvenementCharge, { fr: string; en: string }> = {
  nomme: { fr: 'Dirigeant nommé', en: 'Officer appointed' },
  nomme_retroactif: { fr: 'Dirigeant nommé (rétroactif)', en: 'Officer appointed (retroactive)' },
  retire: { fr: 'Dirigeant retiré', en: 'Officer removed' },
};

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
  evenement: EvenementCharge,
  nomComplet: string,
  charge: { title: string; custom_title: string | null },
): { titleFr: string; titleEn: string } {
  const t = TOURNURES[evenement];
  return {
    titleFr: `${t.fr} : ${nomComplet} — ${libelleTitre(charge, resolveurDeLangue('fr'))}`,
    titleEn: `${t.en}: ${nomComplet} — ${libelleTitre(charge, resolveurDeLangue('en'))}`,
  };
}
