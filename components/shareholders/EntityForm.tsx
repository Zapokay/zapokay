'use client';

/**
 * LE FORMULAIRE D'UNE ENTITÉ ACTIONNAIRE — onze champs, un contrat
 * `value` / `onChange`, sur le modèle de PersonSelector.
 *
 * ⛔ EXTRAIT D'IssueSharesModal, PAS RÉÉCRIT. Son rendu est celui des lignes
 * 474-651 de ce fichier au commit aed7f5c, recopié par génération puis
 * renommé : un formulaire réécrit à côté de l'original aurait été une SECONDE
 * description de la même chose — le défaut que lib/provinces.ts vient de
 * retirer sur les listes. La preuve d'un balisage identique à l'octet est au
 * message de commit.
 *
 * ★ DEUX ÉCRANS LE MONTENT : la création (IssueSharesModal, dans son enveloppe
 * « Nouvelle entité ») et la correction (EditEntityModal). Ce que chacun fait
 * de la valeur — une charge de RPC ou un UPDATE — est décidé dans
 * lib/entity-payload.ts, jamais ici. Ce composant ne connaît aucune table.
 *
 * ⛔ CE QU'IL NE PORTE PAS :
 *   · `jurisdiction` — colonne morte, jamais écrite ni lue (mesuré) ;
 *   · les signataires — un souci de création, restés dans la modale d'émission ;
 *   · l'enveloppe et le retour au sélecteur — propres à la création.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { EntityDescriptor, ShareholderEntityType } from '@/lib/supabase/people-types';
import { countryOptions } from '@/lib/countries';
import { PROVINCE_CODES } from '@/lib/provinces';
import type { ValeurEntite } from '@/lib/entity-payload';
import { CHAMPS_REQUIS_ENTITE } from '@/lib/data-gaps';
import type { ChampAdresse } from '@/lib/address';

interface EntityFormProps {
  value: ValeurEntite;
  onChange: (value: ValeurEntite) => void;
  /**
   * Le message d'une exigence non remplie, rendu sous le formulaire — le contrat de
   * PersonSelector. La modale le compose ; ce composant ne décide pas ce qui manque.
   */
  error?: string;
}

export default function EntityForm({ value, onChange, error }: EntityFormProps) {
  const t = useTranslations('shareholders');
  // Meme derivation que la modale d'emission le faisait : le catalogue porte
  // la locale sous `_locale`.
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  /**
   * Les etiquettes d'adresse generiques — suite, etat/region, pays, et les deux
   * « non declare » — vivent sous `people`. `address`, `city`, `province` et
   * `postalCode` restent pris dans `shareholders` : celui de `people` dit
   * « Adresse du domicile », ce qu'une societe n'a pas.
   */
  const tAdresse = useTranslations('people');
  // ⚪ `common.*` : le libellé du numéro fédéral est rendu par DEUX surfaces —
  //    celle-ci et l'étape 5 —, donc il n'appartient à aucune des deux.
  const tCommun = useTranslations('common');
  // Canada en tete, puis l'ordre alphabetique de la locale — meme source que
  // la personne.
  const paysOptions = useMemo(() => countryOptions(locale), [locale]);

  /**
   * Pays canadien OU non declare → la liste fermee des treize codes. Sinon un
   * champ libre : aucune liste ne couvre les subdivisions du monde.
   */
  const subdivisionCanadienne = value.addressCountry === 'CA' || value.addressCountry === '';
  /**
   * ⛔ Predicat de RENDU, rien n'est efface ni pose : une valeur detenue hors
   * de la liste gagne son option, et la perd des qu'un vrai code est choisi.
   */
  const valeurHorsListe =
    subdivisionCanadienne &&
    value.addressProvince !== '' &&
    !PROVINCE_CODES.some((code) => code === value.addressProvince);

  function maj<K extends keyof ValeurEntite>(champ: K, v: ValeurEntite[K]) {
    onChange({ ...value, [champ]: v });
  }

  /**
   * ★ LES ASTÉRISQUES D'ADRESSE DÉRIVENT DE LA DÉCLARATION — CHAMPS_REQUIS_ENTITE,
   * lib/data-gaps.ts. Chacun des six champs demande à la liste s'il est exigé : changer la
   * liste déplace les astérisques sans toucher ce fichier. La même liste arme les gardes des
   * deux modales et nomme la ligne de la liste des trous.
   * ⚪ Ceux du nom, du type et du NEQ restent écrits à la main : ce sont des exigences
   * d'identité, gardées par les deux modales, que ce lot ne déplace pas.
   */
  function marque(champ: ChampAdresse) {
    if (!(CHAMPS_REQUIS_ENTITE as readonly ChampAdresse[]).includes(champ)) return null;
    return (
      <>
        {' '}
        <span className="text-red-500">*</span>
      </>
    );
  }

  return (
    <>
      {/* Legal name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t('legalName')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={value.legalName}
          onChange={(e) => maj('legalName', e.target.value)}
          placeholder="9453-2281 Québec Inc."
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Entity type */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t('entityType')} <span className="text-red-500">*</span>
        </label>
        <select
          value={value.entityType}
          onChange={(e) => maj('entityType', e.target.value as ShareholderEntityType)}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="corporation">{t('entityTypeCorporation')}</option>
          <option value="trust">{t('entityTypeTrust')}</option>
        </select>
      </div>

      {/* Conditional row: NEQ (corp, required) + descriptor (corp only) */}
      {value.entityType === 'corporation' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('neq')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={value.entityNumber}
              onChange={(e) => maj('entityNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              placeholder="1234567890"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            {/* ⚖️ LE NUMÉRO FÉDÉRAL, ENTRÉ LE 2026-09-17 — OFFERT, JAMAIS EXIGÉ.
                ⛔ AUCUN ASTÉRISQUE, ET C'EST LA DÉCISION, PAS UN OUBLI. À l'étape 2
                les deux numéros sont EXIGÉS parce que c'est LA société de
                l'utilisateur ; ici c'est un TIERS, dont le numéro n'est pas toujours
                sous la main. Quiconque « alignera » un jour les deux étapes doit lire
                cette ligne d'abord.
                ⛔ ET AUCUN `replace(/\D/g,'')` : un numéro fédéral s'écrit 1709431-1
                OU 17094311 — le trait d'union est de la PRÉSENTATION, et le certificat
                le porte. Recopier le décapage du NEQ, dix lignes plus haut, le
                mangerait en silence. Même raison qu'à l'étape 2, qui le dit déjà.
                ⚪ Le libellé vit dans `common.*` : DEUX surfaces le rendent — celle-ci
                et l'étape 5 — et un message que deux écrans rendent n'appartient à
                aucun des deux. */}
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {tCommun('corporationNumberLabel')}
            </label>
            <input
              type="text"
              value={value.corporationNumber}
              onChange={(e) => maj('corporationNumber', e.target.value)}
              maxLength={12}
              placeholder="1709431-1"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('descriptor')}
            </label>
            <select
              value={value.entityDescriptor}
              onChange={(e) => maj('entityDescriptor', e.target.value as EntityDescriptor)}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {/* ⛔ RENDUE SEULEMENT POUR UNE ABSENCE EXISTANTE. A la creation la valeur
                  vaut 'corporation' et cette option n'apparait pas : le balisage de la
                  creation est inchange. A la correction, un descripteur NULL en base
                  arrive en '' — sans cette option, le menu MONTRERAIT « Societe »
                  pendant que '' resterait la valeur enregistree. */}
              {value.entityDescriptor === '' && (
                <option value="">{t('descriptorNotDeclared')}</option>
              )}
              <option value="corporation">{t('descriptorCorporation')}</option>
              <option value="holding">{t('descriptorHolding')}</option>
              <option value="nonprofit">{t('descriptorNonprofit')}</option>
            </select>
          </div>
        </div>
      )}

      {/* Date — label + target column depend on entity type */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {value.entityType === 'corporation' ? t('dateIncorporated') : t('dateConstituted')}
        </label>
        <input
          type="date"
          value={value.entityDate}
          onChange={(e) => maj('entityDate', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Address */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t('address')}{marque('address_line1')}
        </label>
        <input
          type="text"
          value={value.addressLine1}
          onChange={(e) => maj('addressLine1', e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tAdresse('addressLine2')}{marque('address_line2')}
        </label>
        <input
          type="text"
          value={value.addressLine2}
          onChange={(e) => maj('addressLine2', e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t('city')}{marque('address_city')}
          </label>
          <input
            type="text"
            value={value.addressCity}
            onChange={(e) => maj('addressCity', e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          {/* ★ L'ETIQUETTE COMMUTE, comme chez la personne : une
              subdivision etrangere n'est pas une « province ». */}
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {subdivisionCanadienne ? t('province') : tAdresse('stateRegion')}{marque('address_province')}
          </label>
          {subdivisionCanadienne ? (
            <select
              value={value.addressProvince}
              onChange={(e) => maj('addressProvince', e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {/* En tete, et valeur de depart : aucune province n'est
                  preselectionnee. */}
              <option value="">{tAdresse('provinceNotDeclared')}</option>
              {/* La valeur detenue, telle quelle. Voir valeurHorsListe. */}
              {valeurHorsListe && (
                <option value={value.addressProvince}>{value.addressProvince}</option>
              )}
              {PROVINCE_CODES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={value.addressProvince}
              onChange={(e) => maj('addressProvince', e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t('postalCode')}{marque('address_postal_code')}
          </label>
          <input
            type="text"
            value={value.addressPostalCode}
            onChange={(e) => maj('addressPostalCode', e.target.value)}
            placeholder="J8B 1A1"
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>
      <div>
        {/* ⛔ LE CHAMP QUI N'EXISTAIT PAS. Sans lui, une societe ne
            pouvait declarer aucune adresse hors du Canada, et la cle
            ne partait jamais a la fonction — qui posait 'CA'.
            ★ Meme source que la personne : countryOptions(locale). */}
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tAdresse('country')}{marque('address_country')}
        </label>
        <select
          value={value.addressCountry}
          onChange={(e) => maj('addressCountry', e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">{tAdresse('countryNotDeclared')}</option>
          {paysOptions.map((pays) => (
            <option key={pays.code} value={pays.code}>
              {pays.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </>
  );
}
