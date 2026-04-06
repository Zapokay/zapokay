'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import {
  UserPlus,
  ChevronDown,
  Check,
  Search,
  X,
} from 'lucide-react';
import type { CompanyPerson } from '@/lib/supabase/people-types';

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
      addressCity: string;
      addressProvince: string;
      addressPostalCode: string;
      addressCountry: string;
      isCanadianResident: boolean;
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
}: PersonSelectorProps) {
  const t = useTranslations('people');
  const supabase = createClient();

  // ---- State ----------------------------------------------------------------
  const [people, setPeople] = useState<CompanyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(defaultToNew);

  // New person form fields
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddressLine1, setNewAddressLine1] = useState('');
  const [newAddressCity, setNewAddressCity] = useState('');
  const [newAddressProvince, setNewAddressProvince] = useState('QC');
  const [newAddressPostalCode, setNewAddressPostalCode] = useState('');
  const [newAddressCountry, setNewAddressCountry] = useState('CA');
  const [newIsCanadianResident, setNewIsCanadianResident] = useState(true);

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

  // ---- Sync new-person form → parent onChange -------------------------------
  useEffect(() => {
    if (showNewForm && newFullName.trim()) {
      onChange({
        mode: 'new',
        fullName: newFullName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        addressLine1: newAddressLine1.trim(),
        addressCity: newAddressCity.trim(),
        addressProvince: newAddressProvince,
        addressPostalCode: newAddressPostalCode.trim(),
        addressCountry: newAddressCountry,
        isCanadianResident: newIsCanadianResident,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showNewForm,
    newFullName,
    newEmail,
    newPhone,
    newAddressLine1,
    newAddressCity,
    newAddressProvince,
    newAddressPostalCode,
    newAddressCountry,
    newIsCanadianResident,
  ]);

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
    setNewFullName('');
    setNewEmail('');
    setNewPhone('');
    setNewAddressLine1('');
    setNewAddressCity('');
    setNewAddressProvince('QC');
    setNewAddressPostalCode('');
    setNewIsCanadianResident(true);
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
      {selectedExisting && !showNewForm && (
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
      {!selectedExisting && !showNewForm && (
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
              </div>

              {/* "Add new person" button */}
              <div className="border-t border-zinc-100 p-2 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={handleSwitchToNew}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  <UserPlus className="h-4 w-4" />
                  {t('addNewPerson')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── New person form (inline) ── */}
      {showNewForm && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {t('newPerson')}
            </p>
            {hasExistingPeople && (
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
              {t('fullName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
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
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
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
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
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
              value={newAddressLine1}
              onChange={(e) => setNewAddressLine1(e.target.value)}
              placeholder={t('addressLine1Placeholder')}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* City + Province + Postal */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('city')}
              </label>
              <input
                type="text"
                value={newAddressCity}
                onChange={(e) => setNewAddressCity(e.target.value)}
                placeholder="Sainte-Adèle"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('province')}
              </label>
              <select
                value={newAddressProvince}
                onChange={(e) => setNewAddressProvince(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {PROVINCES.map((prov) => (
                  <option key={prov.value} value={prov.value}>
                    {prov.value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t('postalCode')}
              </label>
              <input
                type="text"
                value={newAddressPostalCode}
                onChange={(e) => setNewAddressPostalCode(e.target.value)}
                placeholder="J8B 1A1"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Canadian resident toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={newIsCanadianResident}
                onChange={(e) => setNewIsCanadianResident(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('canadianResident')}
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

