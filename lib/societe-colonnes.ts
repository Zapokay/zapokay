/**
 * LA SOCIÉTÉ DU FLUX D'INSCRIPTION, DITE EN NOMS DE COLONNES — UN SEUL ENDROIT.
 *
 * ⛔ POURQUOI CE MODULE EXISTE, ET POURQUOI IL N'EST PAS UN TROISIÈME VOCABULAIRE.
 * Le dépôt porte déjà DEUX vocabulaires pour le régime — `'LSAQ' | 'CBCA'` dans le
 * flux, `'LSA' | 'CBCA'` en base — et `lib/regimes.ts` existe uniquement pour que
 * la conversion ne s'écrive pas trois fois ; son en-tête raconte que la troisième
 * copie est toujours celle où ça se passe mal.
 *
 * Les champs de la société ont exactement le même problème : l'étape 2 tient
 * `legalName`, `incorporationNumber`, `corporationNumber` ; la base tient
 * `legal_name_fr`, `neq`, `corporation_number` ; et `lib/data-gaps.ts` déclare ses
 * exigences en NOMS DE COLONNES, comme ses trois autres déclarations. Sans ce
 * module, la correspondance s'écrirait une fois dans la garde et une fois dans
 * l'écriture — deux copies, et celle qui ne sert qu'à la garde divergerait en
 * silence le jour où une colonne bouge.
 *
 * ★ IL N'AJOUTE DONC RIEN : il EXTRAIT la conversion qui vivait déjà, en ligne,
 * dans `companyPayload` d'OnboardingFlow. Ce payload l'appelle maintenant, la
 * garde de l'étape 2 aussi. UNE source, deux lecteurs.
 *
 * ⚠️ IL NE PORTE QUE LES CINQ COLONNES QUE LA DÉCLARATION PEUT RÉCLAMER. Le siège
 * a déjà sa conversion (`chargeAdresse`, lib/address.ts), la fin d'exercice et le
 * régime s'écrivent tels quels : les ajouter ici ferait de ce module un second
 * `companyPayload`, ce qu'il n'est pas.
 */
import type { OnboardingData } from '@/lib/types';
import type { ChampSociete } from '@/lib/data-gaps';
import { normalizeNeq, normalizeCorporationNumber } from '@/lib/identifiers';

/** Les cinq colonnes, telles que la base les reçoit : une valeur, ou `null`. */
export type SocieteEnColonnes = Record<ChampSociete, string | null>;

/**
 * ⛔ « VIDE → `null` », JAMAIS UNE CHAÎNE VIDE, et ce n'est pas cosmétique : la
 * contrainte `companies_legal_name_present` accepte l'une des deux dénominations
 * vide, jamais les deux, et elle compte un `''` comme une valeur.
 *
 * ⚠️ LA NORMALISATION EST CELLE DE L'ÉCRITURE, PAS UNE SECONDE. `normalizeNeq` et
 * `normalizeCorporationNumber` sont les fonctions que `companyPayload` appelait
 * déjà ; l'écran les applique aussi à la frappe, donc elles sont idempotentes ici.
 * Les répéter garantit que la garde juge la valeur QUI SERA ÉCRITE, et non celle
 * qui a été tapée.
 *
 * ⚠️ LE NUMÉRO FÉDÉRAL EST FILTRÉ PAR LE RÉGIME — DÉPLACÉ DEPUIS `companyPayload`,
 * PAS AFFAIBLI. Sa raison d'origine tient mot pour mot : le champ est désactivé
 * pour LSAQ à l'écran, ce qui NE SUFFIT PAS, car les deux cartes de régime restent
 * cliquables tant que l'étape 2 est affichée. Taper un numéro, cliquer LSAQ, puis
 * continuer amène ici un numéro avec un régime non fédéral.
 * ★ ET LA VALEUR TAPÉE N'EST PAS EFFACÉE POUR AUTANT : elle survit dans l'état du
 * formulaire et revient si l'on rebascule sur CBCA. Elle n'est simplement jamais
 * écrite tant que le régime n'est pas fédéral.
 * ⚠️ `=== 'CBCA'` ET JAMAIS `!== 'LSA'` : le vocabulaire d'ici est `'LSAQ' | 'CBCA'`,
 * et un test contre `'LSA'` n'y reconnaîtrait AUCUNE société — il laisserait tout
 * passer, en silence. Voir lib/regimes.ts.
 *
 * ⭐ ET C'EST CE FILTRE QUI REND LA DÉCLARATION EXACTE. Pour une société LSA,
 * `corporation_number` vaut `null` ici, donc `exigencesManquantesSociete` ne peut
 * pas le réclamer — puisque `CHAMPS_REQUIS_SOCIETE.LSA` ne le nomme pas. Les deux
 * bouts disent la même chose depuis des endroits différents, et c'est voulu.
 */
export function societeEnColonnes(company: OnboardingData['company']): SocieteEnColonnes {
  const neq = normalizeNeq(company.incorporationNumber);
  const corporationNumber = normalizeCorporationNumber(company.corporationNumber);
  return {
    legal_name_fr: company.legalName.trim() || null,
    legal_name_en: company.legalNameEn.trim() || null,
    neq: neq || null,
    corporation_number: company.incorporationType === 'CBCA' ? corporationNumber || null : null,
    incorporation_date: company.incorporationDate || null,
  };
}
