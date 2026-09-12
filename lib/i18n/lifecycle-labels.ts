/**
 * LES LIBELLÉS DE CYCLE DE VIE — ce fichier ne déclare PLUS AUCUN TITRE.
 *
 * ⛔ CE QUI EST PARTI, ET POURQUOI. Il portait `OFFICER_TITLE_LABELS`, la
 * treizième table de libellés de titres du dépôt et la seule qui alimentait
 * les RÉSOLUTIONS. Douze autres la contredisaient — « Trésorier » ici,
 * « Trésorier·ière » dans huit fichiers d'écran, « Trésorier·ère » dans deux
 * autres et au catalogue. La déclaration unique vit désormais dans
 * `lib/officer-titles.ts` (des CLÉS), et les textes au catalogue.
 *
 * ★ LA RÈGLE DE CE FICHIER : IL DÉCLARE DES CLÉS ET REÇOIT SON RÉSOLVEUR.
 * Il ne peut PAS importer `getServerMessage` — `IssueSharesModal` est un
 * composant CLIENT et importe ce module ; l'y faire entrer tirerait le
 * catalogue serveur dans un paquet client, ce que `lib/i18n/server-messages.ts`
 * interdit à sa deuxième ligne. Chaque appelant passe donc SON résolveur :
 * `getServerMessage` au serveur, `useResolveurCatalogue` au client.
 *
 * ⚪ `getEndReasonLabel` GARDE SA FORME — il lit les catalogues importés, et
 * son rangement est un lot à soi. Le distinguer ici serait le réécrire sans
 * l'avoir mesuré.
 *   - 'director' → directors.endReasons.* · 'officer' → officers.endReasons.*
 *   - La portée compte : FR administrateur « Révocation » vs dirigeant
 *     « Destitution ».
 */

import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import type { ShareholderEntitySignatoryRole } from '@/lib/supabase/people-types';
import { CLE_TITRE } from '@/lib/officer-titles';

export type LifecycleLocale = 'fr' | 'en';
export type EndReasonScope = 'director' | 'officer' | 'shareholder';

type EndReasonKey =
  | 'resignation'
  | 'revocation'
  | 'death'
  | 'disqualification'
  | 'term_expired'
  | 'redemption'
  | 'cancellation'
  | 'conversion'
  | 'transfer';

interface MessagesShape {
  directors?: { endReasons?: Partial<Record<EndReasonKey, string>> };
  officers?: { endReasons?: Partial<Record<EndReasonKey, string>> };
  shareholders?: { endReasons?: Partial<Record<EndReasonKey, string>> };
}

const MESSAGES: Record<LifecycleLocale, MessagesShape> = {
  fr: frMessages as unknown as MessagesShape,
  en: enMessages as unknown as MessagesShape,
};

/**
 * Resolve the localized end-reason label for a director or officer act.
 *
 * @throws if the locale or scope is invalid, or if the reason has no
 *         entry in messages JSON for the requested locale/scope. Loud
 *         failure preferred over silently emitting a code identifier
 *         into a legal document.
 */
export function getEndReasonLabel(
  reason: string,
  locale: LifecycleLocale,
  scope: EndReasonScope,
): string {
  if (locale !== 'fr' && locale !== 'en') {
    throw new Error(`getEndReasonLabel: invalid locale "${locale}"`);
  }
  if (scope !== 'director' && scope !== 'officer' && scope !== 'shareholder') {
    throw new Error(`getEndReasonLabel: invalid scope "${scope}"`);
  }
  const bag = MESSAGES[locale];
  const map =
    scope === 'director'
      ? bag.directors?.endReasons
      : scope === 'officer'
        ? bag.officers?.endReasons
        : bag.shareholders?.endReasons;
  const label = map?.[reason as EndReasonKey];
  if (!label || label.trim() === '') {
    throw new Error(
      `getEndReasonLabel: no label for reason="${reason}" scope="${scope}" locale="${locale}"`,
    );
  }
  return label;
}

/**
 * Le rôle d'administrateur, pour la liste des signataires d'une résolution du
 * conseil. La table de deux entrées qui vivait ici valait « Administrateur » /
 * « Director » — EXACTEMENT `lifecycle.roleDirector` du catalogue, vérifié
 * octet pour octet. Rien de rendu ne change ; la source, elle, devient unique.
 */
export const CLE_ROLE_ADMINISTRATEUR = 'lifecycle.roleDirector' as const;

export function getDirectorRoleLabel(resoudre: (cle: string) => string): string {
  return resoudre(CLE_ROLE_ADMINISTRATEUR);
}

/**
 * LES RÔLES DE SIGNATAIRE D'UNE ENTITÉ — quatre d'entre eux SONT des titres de
 * charge, et ils pointent la déclaration unique plutôt que de la recopier.
 *
 * ⛔ C'EST CE LIEN QUI A FORCÉ LE PÉRIMÈTRE. L'ancienne table prenait ses
 * quatre libellés PAR RÉFÉRENCE à `OFFICER_TITLE_LABELS` ; retirer celle-ci
 * cassait celle-là — prouvé au compilateur avant d'écrire une ligne : quatre
 * `TS2552 Cannot find name 'OFFICER_TITLE_LABELS'`. Les signataires n'étaient
 * donc pas un choix d'étendue, mais une conséquence.
 *
 * ⚪ `trustee` N'EST PAS UN TITRE DE CHARGE et ne peut pas venir de
 * `CLE_TITRE` : le CHECK de `officer_appointments` ne l'admet pas. Il reçoit sa
 * propre clé, sous le sous-arbre des signataires.
 * ⚪ `custom` reste du contenu d'utilisateur : ni clé, ni traduction.
 */
export const CLE_ROLE_SIGNATAIRE: Record<
  Exclude<ShareholderEntitySignatoryRole, 'custom'>,
  string
> = {
  trustee: 'shareholders.signatoryRoles.trustee',
  president: CLE_TITRE.president,
  vice_president: CLE_TITRE.vice_president,
  secretary: CLE_TITRE.secretary,
  treasurer: CLE_TITRE.treasurer,
};

export function getSignatoryRoleLabel(
  role: Exclude<ShareholderEntitySignatoryRole, 'custom'>,
  resoudre: (cle: string) => string,
): string {
  return resoudre(CLE_ROLE_SIGNATAIRE[role]);
}
