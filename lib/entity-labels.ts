/**
 * L'ÉTIQUETTE DE CORRECTION D'UNE ENTITÉ, SELON SON TYPE.
 *
 * « Modifier la société » est faux pour une fiducie. Le formulaire propose les
 * deux types ; le lien qui l'ouvre et le titre qui le coiffe doivent dire
 * lequel.
 *
 * ★ UNE TABLE EXHAUSTIVE, PAS UN TERNAIRE. `Record<ShareholderEntityType, …>`
 * exige une entrée par type : le jour où un troisième type d'entité s'ajoute,
 * le compilateur refuse tant que son étiquette n'est pas écrite. Un ternaire
 * `type === 'trust' ? … : …` rangerait en silence tout type nouveau du côté de
 * la société.
 *
 * ⛔ LE DÉPÔT PORTE DÉJÀ CE DÉFAUT AILLEURS, ET ON N'EN AJOUTE PAS UN SECOND.
 * `readStatedCapitalRegister` range tout ce qui n'est pas fédéral du côté
 * québécois et cite l'art. 68 LSAQ : un régime qu'il ne connaît pas recevrait
 * une citation fausse, sans que rien ne le signale.
 *
 * ⛔ AUCUN LIBELLÉ ICI. La table rend des CLÉS du catalogue `shareholders` ;
 * chaque surface les résout par `useTranslations`, qui vérifie à la compilation
 * que chacune existe.
 */

import type { ShareholderEntityType } from '@/lib/supabase/people-types';

export const CLE_CORRIGER_ENTITE: Record<
  ShareholderEntityType,
  'editCorporationLink' | 'editTrustLink'
> = {
  corporation: 'editCorporationLink',
  trust: 'editTrustLink',
};
