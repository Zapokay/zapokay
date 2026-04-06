'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { ShareClass } from '@/lib/supabase/people-types';

interface ShareClassModalProps {
  companyId: string;
  shareClass?: ShareClass | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ShareClassModal({
  companyId,
  shareClass,
  onClose,
  onSuccess,
}: ShareClassModalProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const isEdit = !!shareClass;

  const [name, setName] = useState(shareClass?.name ?? '');
  const [type, setType] = useState<'common' | 'preferred'>(shareClass?.type ?? 'common');
  const [votingRights, setVotingRights] = useState(shareClass?.voting_rights ?? true);
  const [votesPerShare, setVotesPerShare] = useState(String(shareClass?.votes_per_share ?? 1));
  const [maxQuantity, setMaxQuantity] = useState(
    shareClass?.max_quantity ? String(shareClass.max_quantity) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError(locale === 'fr' ? 'Le nom est requis.' : 'Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      company_id: companyId,
      name: name.trim(),
      type,
      voting_rights: votingRights,
      votes_per_share: votingRights ? Math.max(1, parseInt(votesPerShare) || 1) : 0,
      max_quantity: maxQuantity.trim() ? parseInt(maxQuantity) || null : null,
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase
          .from('share_classes')
          .update(payload)
          .eq('id', shareClass.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('share_classes').insert(payload);
        if (err) throw err;
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {isEdit
              ? locale === 'fr' ? "Modifier la classe d'actions" : 'Edit share class'
              : locale === 'fr' ? "Ajouter une classe d'actions" : 'Add share class'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {locale === 'fr' ? 'Nom' : 'Name'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={locale === 'fr' ? 'Ex. Actions ordinaires' : 'E.g. Common shares'}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {locale === 'fr' ? 'Type' : 'Type'}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'common' | 'preferred')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="common">{locale === 'fr' ? 'Ordinaires' : 'Common'}</option>
              <option value="preferred">{locale === 'fr' ? 'Privilégiées' : 'Preferred'}</option>
            </select>
          </div>

          {/* Voting rights */}
          <div className="flex items-center gap-3">
            <input
              id="voting-rights"
              type="checkbox"
              checked={votingRights}
              onChange={(e) => setVotingRights(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
            />
            <label
              htmlFor="voting-rights"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {locale === 'fr' ? 'Droit de vote' : 'Voting rights'}
            </label>
          </div>

          {/* Votes per share */}
          {votingRights && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {locale === 'fr' ? 'Votes par action' : 'Votes per share'}
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={votesPerShare}
                onChange={(e) => setVotesPerShare(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {/* Max quantity */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {locale === 'fr' ? 'Quantité maximale' : 'Max quantity'}
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={maxQuantity}
              onChange={(e) => setMaxQuantity(e.target.value)}
              placeholder={locale === 'fr' ? 'Illimitée si vide' : 'Unlimited if empty'}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-zinc-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {locale === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locale === 'fr' ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
