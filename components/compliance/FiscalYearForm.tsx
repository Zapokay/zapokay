'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface FiscalYearFormProps {
  companyId: string;
  locale: 'fr' | 'en';
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function FiscalYearForm({ companyId, locale }: FiscalYearFormProps) {
  const fr = locale === 'fr';
  const [month, setMonth] = useState('12');
  const [day, setDay] = useState('31');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = fr ? MONTHS_FR : MONTHS_EN;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from('companies')
      .update({
        fiscal_year_end_month: parseInt(month, 10),
        fiscal_year_end_day: parseInt(day, 10),
      })
      .eq('id', companyId);

    if (err) {
      setError(fr ? 'Erreur lors de la sauvegarde.' : 'Error saving.');
      setSaving(false);
      return;
    }

    window.location.reload();
  }

  return (
    <div
      className="mt-4 p-5 rounded-xl border"
      style={{ borderColor: '#D4C9BB', backgroundColor: '#FFFFFF' }}
    >
      <h3
        className="text-sm font-semibold mb-4"
        style={{ fontFamily: "'Sora', sans-serif", color: '#1C1A17' }}
      >
        {fr ? "Fin d'exercice fiscal" : 'Fiscal Year End'}
      </h3>

      <div className="flex flex-wrap gap-3 items-end">
        {/* Month */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#7A7066' }}>
            {fr ? 'Mois' : 'Month'}
          </label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: '#D4C9BB', color: '#1C1A17', backgroundColor: '#FAF8F4' }}
          >
            {months.map((label, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Day */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#7A7066' }}>
            {fr ? 'Jour' : 'Day'}
          </label>
          <select
            value={day}
            onChange={e => setDay(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: '#D4C9BB', color: '#1C1A17', backgroundColor: '#FAF8F4' }}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity"
          style={{
            backgroundColor: '#F5B91E',
            color: '#1C1A17',
            fontFamily: "'DM Sans', sans-serif",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving
            ? (fr ? 'Sauvegarde...' : 'Saving...')
            : (fr ? 'Sauvegarder' : 'Save')}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: '#C9282D' }}>
          {error}
        </p>
      )}
    </div>
  );
}
