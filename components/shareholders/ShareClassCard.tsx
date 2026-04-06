'use client';

import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import type { ShareClass } from '@/lib/supabase/people-types';

// =============================================================================
// Types
// =============================================================================

interface ShareClassCardProps {
  shareClass: ShareClass;
  onEdit: (shareClass: ShareClass) => void;
}

// =============================================================================
// Component
// =============================================================================

export default function ShareClassCard({ shareClass, onEdit }: ShareClassCardProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const typeLabel =
    shareClass.type === 'common'
      ? locale === 'fr' ? 'Ordinaires' : 'Common'
      : locale === 'fr' ? 'Privilégiées' : 'Preferred';

  const votingLabel = shareClass.voting_rights
    ? locale === 'fr'
      ? `Votantes (${shareClass.votes_per_share} vote${shareClass.votes_per_share > 1 ? 's' : ''}/action)`
      : `Voting (${shareClass.votes_per_share} vote${shareClass.votes_per_share > 1 ? 's' : ''}/share)`
    : locale === 'fr' ? 'Non votantes' : 'Non-voting';

  const quantityLabel = shareClass.max_quantity
    ? locale === 'fr'
      ? `Max ${shareClass.max_quantity.toLocaleString('fr-CA')} actions`
      : `Max ${shareClass.max_quantity.toLocaleString('en-CA')} shares`
    : locale === 'fr' ? 'Quantité illimitée' : 'Unlimited';

  return (
    <div className="flex items-start justify-between rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {shareClass.name}
        </h4>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {locale === 'fr' ? 'Type' : 'Type'} : {typeLabel} · {votingLabel} · {quantityLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEdit(shareClass)}
        className="ml-3 shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

