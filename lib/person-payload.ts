/**
 * LA CRÉATION D'UNE PERSONNE — UNE SEULE PORTE, ET ELLE NE PEUT PLUS PERDRE
 * UN CHAMP.
 *
 * ⛔ NEUF COPIES, MESURÉES LE 2026-09-11. Le même `insert` sur
 * `company_people` était recopié dans neuf appels applicatifs : six dans les
 * modales (AddDirector, AddOfficer, ReplaceOfficer, IssueShares DEUX FOIS —
 * le détenteur et le signataire — et TransferShareholding) et trois à
 * l'inscription. Les six charges des modales étaient identiques clé pour clé,
 * et TOUTES OUBLIAIENT `address_line2` : le formulaire la collecte depuis
 * c0325f9, aucune n'a jamais écrit sa suite d'adresse.
 *
 * ★ UN MODULE UNIQUE NE VAUT QUE S'IL EST LA SEULE PORTE. Laisser trois
 * écritures dehors, ce serait laisser trois modèles à recopier — et la
 * prochaine copie naîtrait de l'une d'elles, avec le même trou. C'est
 * littéralement ainsi qu'on arrive à treize tables de libellés de titres.
 *
 * ⛔ CE FICHIER N'EST PAS UNE RÈGLE, C'EST UN CHEMIN D'ÉCRITURE. Il n'exige
 * rien, il ne marque rien : l'exigence vit dans `lib/data-gaps.ts`, et
 * l'inscription reste libre en passant par ici.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * LA CHARGE, ET TOUS SES CHAMPS SONT REQUIS — c'est toute la raison d'être du
 * fichier, reprise de `lib/entity-payload.ts`. Les colonnes nullables sont
 * typées `string | null` : la CLÉ DOIT ÊTRE ÉCRITE même quand la valeur est
 * nulle.
 *
 * ⚠️ `string | null` ET NON `string | undefined` : `undefined` disparaît à la
 * sérialisation, la clé repartirait absente, et l'oubli se rejouerait derrière
 * un type qui aurait l'air juste.
 *
 * ⚪ ÉCRIRE `null` N'EST PAS ÉCRIRE AUTRE CHOSE QU'OMETTRE : mesuré le
 * 2026-09-11, aucune des onze colonnes de cette charge ne porte de DEFAULT en
 * base. La ligne insérée est identique, clé absente ou clé nulle — c'est ce
 * qui permet aux trois chemins de l'inscription de passer ici sans changer
 * d'un octet ce qu'ils écrivent.
 */
export interface ChargePersonne {
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  /** ⚠️ LA COLONNE QUI MANQUAIT DANS LES SIX MODALES. Requise comme les autres :
   *  il n'existe plus de façon de l'oublier qui compile. */
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  is_canadian_resident: boolean | null;
}

/**
 * La saisie que rend PersonSelector en mode « nouvelle personne ». Déclarée
 * ici et non importée du composant : `lib/` ne dépend pas de `components/`,
 * et la forme est structurellement celle de `PersonSelectorValue`.
 */
export interface SaisiePersonne {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  /**
   * ⚠️ `string | null` ET NON `string` — mesuré au compilateur : le sélecteur
   * porte `null` pour « non déclaré », et c'est cette valeur-là qui part en
   * base. Un type plus étroit ici aurait forcé un `?? ''` au point d'appel,
   * c'est-à-dire écrit une chaîne vide à la place d'une absence.
   */
  addressCountry: string | null;
  isCanadianResident: boolean | null;
}

/**
 * La charge d'une personne saisie au formulaire.
 *
 * ⛔ REPRISE VALEUR POUR VALEUR DES SIX LITTÉRAUX QU'ELLE REMPLACE, le `||
 * null` compris — SAUF `address_line2`, qui apparaît là où elle manquait.
 * ⚠️ `address_country` part SANS `|| null`, comme dans les six copies : une
 * saisie vide y écrit la chaîne vide, pas `null`. Corriger cette asymétrie
 * changerait la ligne écrite ; elle est notée en file, pas traitée ici.
 */
export function chargePersonne(companyId: string, saisie: SaisiePersonne): ChargePersonne {
  return {
    company_id: companyId,
    full_name: saisie.fullName,
    email: saisie.email || null,
    phone: saisie.phone || null,
    address_line1: saisie.addressLine1 || null,
    address_line2: saisie.addressLine2 || null,
    address_city: saisie.addressCity || null,
    address_province: saisie.addressProvince || null,
    address_postal_code: saisie.addressPostalCode || null,
    address_country: saisie.addressCountry,
    is_canadian_resident: saisie.isCanadianResident,
  };
}

/**
 * L'écriture elle-même. Rend le résultat brut de supabase-js : chaque
 * appelant garde SON traitement d'erreur — l'un lève, l'autre rend `false` —
 * et ce lot ne déplace aucune de ces décisions.
 */
export async function insererPersonne(
  supabase: SupabaseClient,
  charge: ChargePersonne,
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('company_people')
    .insert(charge)
    .select('id')
    .single();
  return { data: data as { id: string } | null, error };
}
