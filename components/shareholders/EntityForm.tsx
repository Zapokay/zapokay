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

interface EntityFormProps {
  value: ValeurEntite;
  onChange: (value: ValeurEntite) => void;
}

export default function EntityForm({ value, onChange }: EntityFormProps) {
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
          {t('address')}
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
          {tAdresse('addressLine2')}
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
            {t('city')}
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
            {subdivisionCanadienne ? t('province') : tAdresse('stateRegion')}
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
            {t('postalCode')}
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
          {tAdresse('country')}
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
    </>
  );
}
