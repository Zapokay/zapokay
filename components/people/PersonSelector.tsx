'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations, useLocale } from 'next-intl';
import { countryOptions } from '@/lib/countries';
import {
  CHAMPS_REQUIS,
  HORS_ROLE_AUCUNE_EXIGENCE,
  REQUIS_PAR_LE_COMPOSANT,
  type ChampPersonne,
  type PorteeExigence,
} from '@/lib/data-gaps';
import {
  UserPlus,
  Building2,
  ChevronDown,
  Check,
  Search,
  X,
} from 'lucide-react';
import type { CompanyPerson, ShareholderEntity } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

export type PersonSelectorValue =
  | {
      mode: 'existing';
      personId: string;
      person: CompanyPerson;
    }
  | {
      mode: 'new';
      fullName: string;
      email: string;
      phone: string;
      addressLine1: string;
      /** Suite / appartement. Ajoute le 2026-09-06 pour l'edition d'identite ;
       *  les cinq appelants d'AJOUT ne le collectent pas (voir lockToNewMode). */
      addressLine2: string;
      addressCity: string;
      addressProvince: string;
      addressPostalCode: string;
      addressCountry: string | null;
      /**
       * ⚠️ TROIS ETATS, PAS DEUX : declare oui · declare non · JAMAIS DECLARE.
       * `null` quand la residence ne s'applique pas au regime — et `null` n'est
       * PAS `false`. « Non » est une affirmation sur une personne ; l'absence
       * de declaration n'en est pas une.
       */
      isCanadianResident: boolean | null;
    };

/**
 * ⛔ L'ÉTAT VIERGE, DÉCLARÉ UNE SEULE FOIS — ET LE TYPE L'IMPOSE.
 *
 * `handleClear` et le montage déclaraient chacun ce qu'est un formulaire vide.
 * Les deux ont divergé sans que rien ne le dise : le lot résidence a retiré le
 * `?? true` de l'initialiseur et laissé `setNewIsCanadianResident(true)` dans
 * handleClear, avec un `'QC'` à côté. Corriger la liste aurait laissé la
 * divergence ÉCRIVABLE ; le dixième champ ajouté un jour l'aurait refaite.
 *
 * ★ Le type est DÉRIVÉ de PersonSelectorValue, il n'est pas recopié. Ajouter un
 * champ à la branche « new » fait donc échouer tsc ici tant que VIERGE ne le
 * porte pas — la seconde liste ne peut plus être écrite, pas seulement ne plus
 * exister.
 */
type ChampsFormulaire = Omit<
  Extract<PersonSelectorValue, { mode: 'new' }>,
  'mode' | 'addressCountry'
> & {
  /** `''` = non déclaré ; converti en `null` à l'émission, en un seul endroit. */
  addressCountry: string;
};

const VIERGE: ChampsFormulaire = {
  fullName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  addressCity: '',
  // ★ Ni 'QC', ni 'CA', ni `true`. Une déclaration se fait, elle ne se devine pas.
  addressProvince: '',
  addressPostalCode: '',
  addressCountry: '',
  isCanadianResident: null,
};

interface PersonSelectorProps {
  companyId: string;
  /** Currently selected value (controlled) */
  value: PersonSelectorValue | null;
  onChange: (value: PersonSelectorValue | null) => void;
  /** IDs to exclude from the dropdown (e.g. already-assigned directors) */
  excludePersonIds?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Show the inline "new person" form expanded by default */
  defaultToNew?: boolean;
  /** Label above the selector */
  label?: string;
  /** Error message */
  error?: string;
  /**
   * ⚠️ REQUISE ET SANS DÉFAUT. Un défaut ferait qu'un appelant qui l'oublie
   * reçoit « aucune exigence » en silence — et son formulaire cesserait de
   * marquer ce qu'il exige, sans que rien ne le dise. Les SEPT montages
   * doivent se prononcer, et tsc refuse celui qui omet.
   *
   * `HORS_ROLE_AUCUNE_EXIGENCE` est une décision lisible, pas un trou.
   */
  exigences: PorteeExigence;
  /** When provided, renders a second footer link signalling the parent to switch
   *  to entity (company/trust) creation. PersonSelector stays an identity picker —
   *  the PersonSelectorValue contract is untouched; this is a fire-and-forget signal. */
  onAddEntity?: () => void;
  /** Opt-in: when true, ALSO list existing shareholder_entities inline. Default
   *  false → no entity fetch, so the other PersonSelector callers are unaffected. */
  includeEntities?: boolean;
  /** Fired when an existing entity row is picked. Does NOT flow through value/
   *  onChange — the PersonSelectorValue contract stays person-only (parallel path). */
  onSelectEntity?: (entity: ShareholderEntity) => void;
  /**
   * EDITION D'IDENTITE — verrouille l'affichage sur le bloc « nouvelle
   * personne » et masque tout chemin de SELECTION : en edition la personne
   * n'est pas a choisir, elle est deja connue.
   *
   * ⚠️ CE COMPOSANT N'ECRIT TOUJOURS RIEN. Il reste un selecteur controle a
   * deux .select ; l'UPDATE vit dans EditPersonModal, comme les cinq appelants
   * font chacun leur propre INSERT. Cette prop ne change que l'AFFICHAGE.
   *
   * ★ Elle commande aussi DEUX choses sans lesquelles elle ne servirait a rien :
   *   · les champs se pre-remplissent depuis `value` (mode 'new') au lieu de
   *     partir vides — sans cela, passer une valeur pre-remplie n'afficherait
   *     rien, `value` n'etant lu que pour la branche 'existing' ;
   *   · le champ « suite » n'apparait QUE la. Les cinq formulaires d'ajout ne
   *     l'affichent pas, donc ne peuvent pas collecter une valeur que leurs
   *     INSERT jetteraient.
   *
   * Defaut absent/false : les six montages existants ne voient rien changer.
   */
  lockToNewMode?: boolean;

  /**
   * La residence canadienne s'applique-t-elle ? REQUIS, et sans defaut.
   *
   * ⛔ OPTIONNEL, IL SERAIT DANGEREUX DANS LE SENS LE PLUS COUTEUX : un
   * montage qui l'oublierait recevrait `undefined`, donc falsy, donc le champ
   * se VERROUILLERAIT sur une societe federale — empechant une declaration que
   * la LCSA art. 105(3) exige, et sans un mot. Requis, tsc force les sept
   * montages a decider.
   *
   * ⚠️ C'est un BOOLEEN, pas un regime : ce composant ne compare rien. La
   * decision vient de residencyApplies(), en amont.
   */
  residencyApplies: boolean;
}

// =============================================================================
// Province options (Canada)
// =============================================================================
const PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'Colombie-Britannique / British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'Nouveau-Brunswick / New Brunswick' },
  { value: 'NL', label: 'Terre-Neuve / Newfoundland' },
  { value: 'NS', label: 'Nouvelle-Écosse / Nova Scotia' },
  { value: 'NT', label: 'Territoires du Nord-Ouest' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Île-du-Prince-Édouard / PEI' },
  { value: 'QC', label: 'Québec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
];

// =============================================================================
// Component
// =============================================================================
export default function PersonSelector({
  companyId,
  value,
  onChange,
  excludePersonIds = [],
  placeholder,
  defaultToNew = false,
  label,
  error,
  onAddEntity,
  includeEntities = false,
  onSelectEntity,
  lockToNewMode = false,
  residencyApplies,
  exigences,
}: PersonSelectorProps) {
  const t = useTranslations('people');
  const locale = useLocale();
  // 252 pays triés à chaque frappe du formulaire sans ce memo.
  const paysOptions = useMemo(() => countryOptions(locale), [locale]);
  /**
   * ⚠️ UN SECOND ESPACE DE NOMS, ET C'EST DELIBERE. Les trois libelles du
   * menu sont EXACTEMENT ceux de la colonne du registre. Les recopier sous
   * `people` donnerait deux jeux de mots identiques a tenir synchronises, et
   * le jour ou l'un bougerait, l'ecran de saisie et le document imprime ne
   * diraient plus la meme chose de la meme donnee. Une seule source.
   */
  const tRegistres = useTranslations('minuteBook.registers');
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [people, setPeople] = useState<CompanyPerson[]>([]);
  const [entities, setEntities] = useState<ShareholderEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(defaultToNew);

  // New person form fields
  // ⚠️ PRE-REMPLISSAGE. `value` n'etait lu que pour la branche 'existing' ; une
  // valeur de forme 'new' passee par l'appelant n'affichait donc RIEN.
  // L'initialiseur la lit. Sans effet sur les six montages existants, qui
  // montent tous avec value={null} : `depart` y vaut null et VIERGE
  // s'applique — l'absence, plus les defauts litteraux d'origine.
  // ⚠️ useState ne lit son initialiseur QU'AU PREMIER RENDU : l'appelant doit
  // donc construire la valeur AVANT de monter ce composant, pas apres.
  const depart = value && value.mode === 'new' ? value : null;
  const [form, setForm] = useState<ChampsFormulaire>(() => {
    if (!depart) return VIERGE;
    const { mode: _mode, ...champs } = depart;
    // `null` en base = non déclaré ; le formulaire le porte comme `''`.
    return { ...VIERGE, ...champs, addressCountry: champs.addressCountry ?? '' };
  });
  const maj = <C extends keyof ChampsFormulaire>(
    champ: C,
    valeur: ChampsFormulaire[C],
  ) => setForm((f) => ({ ...f, [champ]: valeur }));

  /**
   * ⚠️ L'EMPREINTE, PAS L'OBJET. Une dépendance `[form]` re-tirerait sur un
   * changement d'IDENTITÉ à valeurs égales. Mesuré sur une suite de 14 actions :
   * 12 scalaires → 13 émissions, `[form]` nu → 14, l'empreinte → 13. Elle rend
   * exactement ce que les douze dépendances rendaient.
   */
  const empreinte = JSON.stringify(form);

  /**
   * ⛔ PLUS AUCUN ASTÉRISQUE ÉCRIT À LA MAIN DANS CE COMPOSANT. La marque
   * dérive de la déclaration — c'est ce qui corrige au passage le défaut que
   * d1746da a créé : ville et pays étaient exigés par AddDirectorModal et ne
   * portaient aucune marque.
   */
  const champsRequis = new Set<ChampPersonne>([
    ...REQUIS_PAR_LE_COMPOSANT,
    ...(exigences === HORS_ROLE_AUCUNE_EXIGENCE ? [] : CHAMPS_REQUIS[exigences]),
  ]);
  const marque = (champ: ChampPersonne) =>
    champsRequis.has(champ) ? <span className="text-red-500">*</span> : null;

  /**
   * Pays canadien OU non déclaré → la liste fermée des 13 codes.
   * Sinon un champ libre : aucune liste ne couvre les subdivisions du monde,
   * et sans lui une adresse étrangère ne peut pas s'écrire du tout.
   */
  const subdivisionCanadienne =
    form.addressCountry === 'CA' || form.addressCountry === '';

  /**
   * ⛔ CECI N'EST PAS LE VIDAGE ÉCARTÉ LE 2026-09-08, et la distinction est
   * la raison d'être de ce prédicat.
   *
   * Le vidage automatique effaçait la province au changement de pays : il
   * empêchait une erreur d'UTILISATEUR, et Dom l'a écarté — « France + QC »
   * est une faute de saisie, qu'un formulaire d'adresse n'a pas à corriger.
   *
   * Ceci empêche le PRODUIT d'afficher une chose et d'en sauver une autre.
   * Revenu au Canada avec « Occitanie » en état, le <select> montrerait sa
   * première option pendant que « Occitanie » resterait la valeur écrite.
   *
   * ★ RIEN N'EST EFFACÉ NI POSÉ : c'est un prédicat de RENDU, comme
   * subdivisionCanadienne. La valeur détenue gagne son option, reste
   * sélectionnée et remplaçable ; l'option disparaît d'elle-même dès qu'un
   * vrai code est choisi, sa condition cessant d'être vraie. Aucun nettoyage.
   */
  const valeurHorsListe =
    subdivisionCanadienne &&
    form.addressProvince !== '' &&
    !PROVINCES.some((prov) => prov.value === form.addressProvince);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ---- Fetch existing people ------------------------------------------------
  useEffect(() => {
    async function fetchPeople() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('company_people')
        .select('*')
        .eq('company_id', companyId)
        .order('full_name');

      if (!fetchError && data) {
        setPeople(data as CompanyPerson[]);
      }
      setLoading(false);
    }
    fetchPeople();
  }, [companyId, supabase]);

  // ---- Fetch existing entities (opt-in) -------------------------------------
  useEffect(() => {
    if (!includeEntities) return;
    async function fetchEntities() {
      const { data } = await supabase
        .from('shareholder_entities')
        .select('*')
        .eq('company_id', companyId)
        .order('legal_name');
      if (data) setEntities(data as ShareholderEntity[]);
    }
    fetchEntities();
  }, [companyId, supabase, includeEntities]);

  // ---- Click outside to close dropdown --------------------------------------
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ⚠️ LE VERROU EST DERIVE, PAS UN ETAT. `showNewForm` reste ce qu'il etait ;
  // `enModeNouveau` le force quand l'appelant verrouille. Un chemin qui
  // remettrait showNewForm a false — handleSelectPerson, handleClear — ne peut
  // donc pas rouvrir la selection : ces deux fonctions sont d'ailleurs
  // inatteignables en mode verrouille, leurs boutons n'etant pas rendus.
  const enModeNouveau = lockToNewMode || showNewForm;

  // ---- Sync new-person form → parent onChange -------------------------------
  useEffect(() => {
    if (enModeNouveau && form.fullName.trim()) {
      onChange({
        mode: 'new',
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        addressCity: form.addressCity.trim(),
        addressProvince: form.addressProvince,
        addressPostalCode: form.addressPostalCode.trim(),
        addressCountry: form.addressCountry || null,
        // ② ON ECRIT `null`, ON N'OMET PAS. Omettre laisserait le DEFAULT TRUE
        //    de la colonne refabriquer un « Oui » a l'insertion — il est encore
        //    la, on ne le retire qu'a l'etape 7a. Ecrire null rend ce code juste
        //    avant ET apres ce retrait, dans les deux ordres.
        isCanadianResident: residencyApplies ? form.isCanadianResident : null,
      });
    } else if (enModeNouveau) {
      // ⛔ LE NOM VIDE RETIRE LA VALEUR, IL NE LA FIGE PLUS. Sans cette branche,
      // effacer le nom APRES avoir emis laissait le parent sur la derniere
      // valeur — bouton actif, garde du domicile calculee sur un fantome.
      // ★ Sûr parce que `value` n'est PAS dans les dependances : ce que le
      //   parent renvoie ne peut pas re-declencher cet effet. Mesure du jour.
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enModeNouveau, empreinte, residencyApplies]);

  // ---- Filtered list --------------------------------------------------------
  const filteredPeople = people.filter((p) => {
    if (excludePersonIds.includes(p.id)) return false;
    if (!searchQuery) return true;
    return p.full_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const availablePeople = filteredPeople;
  const hasExistingPeople = people.filter((p) => !excludePersonIds.includes(p.id)).length > 0;

  // ---- Select an existing person --------------------------------------------
  function handleSelectPerson(person: CompanyPerson) {
    onChange({ mode: 'existing', personId: person.id, person });
    setDropdownOpen(false);
    setShowNewForm(false);
    setSearchQuery('');
  }

  // ---- Switch to "new person" mode ------------------------------------------
  function handleSwitchToNew() {
    setShowNewForm(true);
    setDropdownOpen(false);
    onChange(null); // reset until they type a name
  }

  // ---- Clear selection ------------------------------------------------------
  function handleClear() {
    onChange(null);
    setShowNewForm(defaultToNew);
    // ★ EXACTEMENT l'état d'un montage sans `depart` — plus une liste à tenir
    //   à jour, donc plus de divergence possible avec l'initialiseur.
    setForm(VIERGE);
  }

  // ---- Helpers --------------------------------------------------------------
  function getInitials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // ---- Render ---------------------------------------------------------------
  const selectedExisting = value && value.mode === 'existing' ? value : null;
  const placeholderText = placeholder || t('selectPerson');

  return (
    <div className="w-full space-y-2">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      )}

      {/* ── Existing person selected ── */}
      {selectedExisting && !enModeNouveau && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {getInitials(selectedExisting.person.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {selectedExisting.person.full_name}
            </p>
            {selectedExisting.person.email && (
              <p className="truncate text-xs text-zinc-500">
                {selectedExisting.person.email}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Dropdown trigger ── */}
      {!selectedExisting && !enModeNouveau && (
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
              error
                ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600'
            }`}
          >
            <span className="text-zinc-400 dark:text-zinc-500">{placeholderText}</span>
            <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              {/* Search */}
              {hasExistingPeople && (
                <div className="border-b border-zinc-100 p-2 dark:border-zinc-700">
                  <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('searchPeople')}
                      className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* People list */}
              <div className="max-h-48 overflow-y-auto">
                {loading && (
                  <div className="px-3 py-4 text-center text-sm text-zinc-400">
                    {t('loading')}
                  </div>
                )}

                {!loading && availablePeople.length === 0 && hasExistingPeople && (
                  <div className="px-3 py-4 text-center text-sm text-zinc-400">
                    {t('noResults')}
                  </div>
                )}

                {!loading &&
                  availablePeople.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => handleSelectPerson(person)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {getInitials(person.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                          {person.full_name}
                        </p>
                        {person.address_city && (
                          <p className="truncate text-xs text-zinc-400">
                            {person.address_city}
                            {person.address_province ? `, ${person.address_province}` : ''}
                          </p>
                        )}
                      </div>
                      {value?.mode === 'existing' && value.personId === person.id && (
                        <Check className="h-4 w-4 text-amber-500" />
                      )}
                    </button>
                  ))}

                {/* Existing entities (opt-in) — squircle avatar + "Entité" tag */}
                {!loading && includeEntities &&
                  entities
                    .filter((e) => !searchQuery || e.legal_name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((entity) => (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => {
                          onSelectEntity?.(entity);
                          setDropdownOpen(false);
                          setSearchQuery('');
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-[11px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {getInitials(entity.legal_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                            {entity.legal_name}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          {t('entityBadge')}
                        </span>
                      </button>
                    ))}
              </div>

              {/* "Add new person" + optional "Add a company / trust" buttons */}
              <div className="border-t border-zinc-100 p-2 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={handleSwitchToNew}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  <UserPlus className="h-4 w-4" />
                  {t('addNewPerson')}
                </button>
                {onAddEntity && (
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onAddEntity();
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                  >
                    <Building2 className="h-4 w-4" />
                    {t('addEntity')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── New person form (inline) ── */}
      {enModeNouveau && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {t('newPerson')}
            </p>
            {hasExistingPeople && !lockToNewMode && (
              <button
                type="button"
                onClick={() => {
                  setShowNewForm(false);
                  handleClear();
                }}
                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {t('selectExisting')}
              </button>
            )}
          </div>

          {/* Full name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('fullName')} {marque('full_name')}
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => maj('fullName', e.target.value)}
              placeholder="Jean-Philippe Roussy"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Email + Phone row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('email')}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => maj('email', e.target.value)}
                placeholder="jp@example.com"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('phone')}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => maj('phone', e.target.value)}
                placeholder="514-555-0123"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('address')}
            </label>
            <input
              type="text"
              value={form.addressLine1}
              onChange={(e) => maj('addressLine1', e.target.value)}
              placeholder={t('addressLine1Placeholder')}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Suite / appartement — ⚠️ AFFICHE SEULEMENT EN EDITION.
              Les cinq formulaires d'AJOUT ne le montrent pas : leurs INSERT ne
              passent pas address_line2, un champ visible la accepterait une
              saisie pour la jeter. Le leur ouvrir demande de toucher leurs cinq
              INSERT — un autre lot. */}
          {lockToNewMode && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('addressLine2')}
              </label>
              <input
                type="text"
                value={form.addressLine2}
                onChange={(e) => maj('addressLine2', e.target.value)}
                placeholder={t('addressLine2Placeholder')}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {/* City + Province + Postal */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('city')} {marque('address_city')}
              </label>
              <input
                type="text"
                value={form.addressCity}
                onChange={(e) => maj('addressCity', e.target.value)}
                placeholder="Sainte-Adèle"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {subdivisionCanadienne ? t('province') : t('stateRegion')}
              </label>
              {subdivisionCanadienne ? (
                <select
                  value={form.addressProvince}
                  onChange={(e) => maj('addressProvince', e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {/* En tête, et valeur de départ à l'ajout — même patron que les
                      trois états de la résidence, dix lignes plus bas. */}
                  <option value="">{t('provinceNotDeclared')}</option>
                  {/* La valeur détenue, telle quelle et sans décoration — c'est
                      une valeur, pas un message. Voir valeurHorsListe. */}
                  {valeurHorsListe && (
                    <option value={form.addressProvince}>{form.addressProvince}</option>
                  )}
                  {PROVINCES.map((prov) => (
                    <option key={prov.value} value={prov.value}>
                      {prov.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.addressProvince}
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
                value={form.addressPostalCode}
                onChange={(e) => maj('addressPostalCode', e.target.value)}
                placeholder="J8B 1A1"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t('country')} {marque('address_country')}
            </label>
            {/* Le Canada en tête, puis l'ordre alphabétique DE LA LOCALE —
                26 noms à initiale accentuée l'exigent (voir lib/countries.ts). */}
            <select
              value={form.addressCountry}
              onChange={(e) => maj('addressCountry', e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">{t('countryNotDeclared')}</option>
              {paysOptions.map((pays) => (
                <option key={pays.code} value={pays.code}>
                  {pays.label}
                </option>
              ))}
            </select>
          </div>

          {/* ① LE CHAMP EST REMPLACE, PAS DESACTIVE. Un interrupteur grise en
              position « off » se lit `false` — une AFFIRMATION fausse sur une
              personne. Ici il n'y a rien a affirmer : la question ne se pose
              pas. Une mention neutre, et aucune valeur.
              ⚠️ DEUX COUCHES SEULEMENT. Un seul champ sur neuf est
              inapplicable ; les huit autres s'enregistrent normalement, donc
              le bouton « Enregistrer » reste actif. Ne pas copier la
              troisieme couche du patron isTransfer, qui verrouille TOUTE sa
              modale. */}
          {residencyApplies ? (
            /* ⛔ UN MENU, PAS UN INTERRUPTEUR. Un interrupteur n'a que deux
               positions et il en fabrique donc une troisieme par defaut — c'est
               ainsi qu'une absence devenait « Oui ». Trois etats demandent trois
               choix nommes.
               ★ « Non declare » RESTE SELECTIONNABLE : une declaration faite par
               erreur doit pouvoir revenir a l'absence, comme toute donnee de ce
               lot se corrige.
               ⚠️ L'ETIQUETTE GARDE LA FORME PERSONNE, « Resident canadien ». La
               forme PROPRIETE, « Residence canadienne », appartient a la colonne
               du registre et au pourcentage. Deux sens, deux libelles. */
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('canadianResident')}
              </label>
              <select
                value={
                  form.isCanadianResident === true ? 'true'
                  : form.isCanadianResident === false ? 'false'
                  : 'null'
                }
                onChange={(e) =>
                  maj(
                    'isCanadianResident',
                    e.target.value === 'true' ? true
                    : e.target.value === 'false' ? false
                    : null,
                  )
                }
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="null">{tRegistres('residentNotDeclared')}</option>
                <option value="true">{tRegistres('residentYes')}</option>
                <option value="false">{tRegistres('residentNo')}</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {t('canadianResident')}
              </span>
              <span className="text-[var(--text-muted)]">
                {t('residencyNotApplicable')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

