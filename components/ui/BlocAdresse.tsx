'use client';

import { useMemo } from 'react';
import type React from 'react';
import type { AdresseSaisie, ChampAdresse } from '@/lib/address';
import { countryOptions } from '@/lib/countries';
import { PROVINCE_CODES, optionsProvinces } from '@/lib/provinces';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

/**
 * LES SIX CHAMPS D'ADRESSE, UNE FOIS — le formulaire qui n'existait pas.
 *
 * ⛔ LE DÉPÔT LE RENDAIT QUATRE FOIS, À LA MAIN — les deux surfaces du siège
 * (l'étape 3 et les Paramètres) et les deux surfaces de rôle (PersonSelector,
 * EntityForm). Chacune montait les mêmes six `<label>/<input>`, le même prédicat
 * canadien, la même garde « la valeur détenue gagne son option quand elle sort de
 * la liste ». Quatre copies d'une seule idée, et elles avaient déjà divergé sur
 * DEUX points :
 *
 *   · le MENU DE PROVINCES — les surfaces de rôle passaient `PROVINCE_CODES`
 *     bruts et affichaient le CODE ; les surfaces de société passaient
 *     `optionsProvinces` et affichaient le NOM TRADUIT. Le même menu disait deux
 *     choses selon l'écran. lib/provinces.ts portait déjà cet item en file ; il
 *     se ferme ici, pour les surfaces montées.
 *   · l'ORDRE — voir le bloc suivant.
 *
 * ⛔ DEUX COPIES SURVIVENT, ET C'EST DÉLIBÉRÉ. PersonSelector et EntityForm
 * portent la nomenclature camelCase et sont les deux seules surfaces que
 * check:adresses garde par leurs astérisques (A4a, A4b). Les migrer demande un
 * adaptateur et une relecture de leurs montages : déclaré en file, hors de ce lot.
 * L'inventaire daté des quatre copies vit dans le message de commit.
 *
 * ⚖️ LE PAYS VIENT AVANT LA PROVINCE (décision de Dom, 2026-09-15). Les quatre
 * copies posaient le pays EN DERNIER alors que c'est lui qui décide de la forme
 * du champ province. L'utilisateur choisissait donc une province dans une liste
 * canadienne AVANT d'avoir dit son pays : le formulaire SUPPOSAIT le Canada.
 * Rien n'était fabriqué en base — mais l'écran affirmait à sa place.
 *
 * ⚖️ ET LA LISTE FERMÉE NE VAUT QUE POUR `CA` (forme (ii), décision de Dom,
 * 2026-09-15). Le prédicat des quatre copies était
 * `pays === 'CA' || pays === ''` : un pays NON DÉCLARÉ recevait la liste des
 * provinces canadiennes. Ici, `=== 'CA'` et rien d'autre — pays vide ou
 * étranger, le champ est LIBRE.
 * ★ Le champ province ne disparaît jamais et n'apparaît jamais : seule sa FORME
 * change, et elle change AVANT que l'utilisateur y arrive, puisque le pays est
 * au-dessus. Rien ne bascule sous le curseur.
 * ⚪ MESURÉ AVANT D'APPLIQUER, sur les trois tables qui portent une adresse :
 * aucune fiche du parc ne porte une province sans pays, donc aucune ne change
 * d'apparence en passant de la liste fermée au champ libre. ⛔ Le compte vit dans
 * le message de commit, que l'historique date — écrit ici, il serait faux dès la
 * fiche suivante.
 *
 * ⛔ CE COMPOSANT N'EXIGE RIEN ET NE MARQUE RIEN DE LUI-MÊME. `marque` est une
 * PROP : chaque surface dérive son astérisque de SA déclaration —
 * `CHAMPS_REQUIS_SIEGE` pour le siège, `champsRequisDeLaPortee` pour une
 * personne — et une surface qui n'exige rien n'en passe aucune. Poser la règle
 * ici aurait fait de ce fichier une cinquième source d'exigence, à côté de
 * lib/data-gaps.ts qui existe pour être la seule.
 *
 * ⛔ IL NE PORTE PAS NON PLUS SON APPARENCE. `classeChamp` et `styleChamp`
 * viennent de l'appelant, parce que le dépôt a DEUX idiomes vivants — Tailwind
 * dans le tableau de bord, styles en ligne sur variables CSS à l'inscription —
 * et qu'aucun des deux n'est en tort. Ce composant possède la STRUCTURE et la
 * LOGIQUE, jamais la peau : c'est ce qui permet de le monter sur quatre écrans
 * sans en changer un seul visuellement.
 */

export interface BlocAdresseProps {
  /**
   * ★ LES NOMS DE COLONNES, PAS UNE TRADUCTION EN camelCase. `AdresseSaisie`
   * est la nomenclature de lib/address.ts — celle que `champsManquantsSiege`
   * lit et que `chargeAdresse` écrit. PersonSelector et EntityForm portent
   * encore la forme camelCase ; leur migration est déclarée en file (C-3) et
   * n'est PAS dans ce lot.
   */
  valeur: AdresseSaisie;
  onChange: (valeur: AdresseSaisie) => void;
  locale: string;
  /**
   * ⚠️ REQUIS ET SANS DÉFAUT : c'est la SEULE étiquette qui diffère vraiment
   * d'une surface à l'autre — « Adresse du domicile » pour une personne,
   * « Adresse » pour un siège. Un défaut aurait fait dire « domicile » à un
   * siège en silence.
   */
  libelleLigne1: string;
  /** Défaut : `people.addressLine2`. Le siège passe la sienne, identique au mot près. */
  libelleLigne2?: string;
  /**
   * L'astérisque, DÉRIVÉ PAR L'APPELANT de sa propre déclaration. Absent = la
   * surface n'exige rien, et rien n'est marqué.
   */
  marque?: (champ: ChampAdresse) => React.ReactNode;
  /**
   * ⚠️ REQUIS : les `id`/`htmlFor` doivent rester uniques dans la page. Une
   * étape qui monte plusieurs blocs (un par administrateur) passe un préfixe
   * portant son index.
   */
  idPrefixe: string;
  classeChamp?: string;
  styleChamp?: React.CSSProperties;
  classeEtiquette?: string;
  styleEtiquette?: React.CSSProperties;
}

export default function BlocAdresse({
  valeur,
  onChange,
  locale,
  libelleLigne1,
  libelleLigne2,
  marque,
  idPrefixe,
  classeChamp,
  styleChamp,
  classeEtiquette,
  styleEtiquette,
}: BlocAdresseProps) {
  const fr = locale === 'fr';
  // Forme statique — celle de StepCompany, StepSiege et SettingsClient. Elle ne
  // dépend d'aucun fournisseur, donc ce composant se monte dans un harnais sans
  // NextIntlClientProvider aussi bien que dans l'application. Zéro clé neuve.
  const m = fr ? frMessages : enMessages;
  const pp = m.people;

  const paysOptions = useMemo(() => countryOptions(locale), [locale]);
  // ★ Les noms traduits et triés par la locale — « Île-du-Prince-Édouard » se
  //   classe correctement. Voir lib/provinces.ts pour le motif du localeCompare.
  const provinces = useMemo(
    () => optionsProvinces(locale, m.provinces as Record<string, string | undefined>),
    [locale, m],
  );

  // ⛔ `=== 'CA'` ET RIEN D'AUTRE. Voir l'en-tête : le `|| ''` des quatre copies
  //    donnait la liste canadienne à un pays non déclaré.
  const listeCanadienne = valeur.address_country === 'CA';
  // La valeur détenue gagne son option quand elle sort de la liste : le menu ne
  // doit pas afficher une chose et en sauver une autre.
  const provinceHorsListe =
    listeCanadienne &&
    valeur.address_province !== '' &&
    !PROVINCE_CODES.some((code) => code === valeur.address_province);

  const maj = (champ: ChampAdresse, v: string) => onChange({ ...valeur, [champ]: v });
  const marquer = (champ: ChampAdresse) => (marque ? marque(champ) : null);

  /**
   * ⚠️ RÉSOLUE ICI, PAS DANS LE JSX — ET CE N'EST PAS DU STYLE. A1 de check:adresses
   * compte les noms de champs d'adresse lus dans les ENFANTS d'un élément JSX (les
   * attributs sont exemptés : un formulaire n'est pas une composition). `pp.addressLine2`
   * écrit à l'intérieur d'un enfant est un accès de propriété nommé `addressLine2`, donc
   * un nom lu ; avec le `{valeur.address_province}` de l'option hors liste plus bas, le
   * <div> englobant en comptait DEUX et A1 le déclarait composition. Mesuré : la garde a
   * refusé ce fichier à son premier montage.
   * ★ Les quatre copies que ce composant remplace n'avaient pas le problème parce
   * qu'elles n'écrivaient leurs étiquettes nulle part ailleurs qu'en position directe.
   * Règle pour la suite : dans ce fichier, aucun `pp.address*` en position d'ENFANT JSX.
   */
  const etiquetteLigne2 = libelleLigne2 ?? pp.addressLine2;
  const invitationLigne1 = pp.addressLine1Placeholder;
  const invitationLigne2 = pp.addressLine2Placeholder;

  const etiquette = (champ: ChampAdresse, texte: string) => (
    <label htmlFor={`${idPrefixe}-${champ}`} className={classeEtiquette} style={styleEtiquette}>
      {texte}
      {marquer(champ)}
    </label>
  );

  const champTexte = (champ: ChampAdresse, placeholder?: string) => (
    <input
      id={`${idPrefixe}-${champ}`}
      type="text"
      value={valeur[champ]}
      onChange={(e) => maj(champ, e.target.value)}
      placeholder={placeholder}
      className={classeChamp}
      style={styleChamp}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        {etiquette('address_line1', libelleLigne1)}
        {champTexte('address_line1', invitationLigne1)}
      </div>
      <div>
        {etiquette('address_line2', etiquetteLigne2)}
        {champTexte('address_line2', invitationLigne2)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          {etiquette('address_city', pp.city)}
          {champTexte('address_city')}
        </div>
        <div>
          {etiquette('address_postal_code', pp.postalCode)}
          {champTexte('address_postal_code')}
        </div>
      </div>

      {/* ⚠️ LE PAYS D'ABORD, LA PROVINCE ENSUITE — ET L'ORDRE EST LA RÈGLE, PAS
          UNE MISE EN PAGE. Inverser ces deux cellules rendrait de nouveau une
          liste de provinces canadiennes avant que le pays soit dit. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          {etiquette('address_country', pp.country)}
          <select
            id={`${idPrefixe}-address_country`}
            value={valeur.address_country}
            onChange={(e) => maj('address_country', e.target.value)}
            className={classeChamp}
            style={styleChamp}
          >
            <option value="">{pp.countryNotDeclared}</option>
            {paysOptions.map((pays) => (
              <option key={pays.code} value={pays.code}>
                {pays.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          {etiquette('address_province', listeCanadienne ? pp.province : pp.stateRegion)}
          {listeCanadienne ? (
            <select
              id={`${idPrefixe}-address_province`}
              value={valeur.address_province}
              onChange={(e) => maj('address_province', e.target.value)}
              className={classeChamp}
              style={styleChamp}
            >
              <option value="">{pp.provinceNotDeclared}</option>
              {provinceHorsListe && (
                <option value={valeur.address_province}>{valeur.address_province}</option>
              )}
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          ) : (
            champTexte('address_province')
          )}
        </div>
      </div>
    </div>
  );
}
