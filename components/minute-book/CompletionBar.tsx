'use client';

import { useTranslations } from 'next-intl';
import { getDocumentState, getStateForChecklistItem } from '@/lib/minute-book/state';
import { displayStateOf, type DisplayState } from '@/lib/minute-book/display-state';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';

interface CompletionBarItem {
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  /**
   * Phase B B5-fix — enables segment coloring to distinguish signed-final
   * uploads (green) from WIP uploads (amber). Threaded via the API's
   * ChecklistItem.document_is_finalized field; the field-name remap to
   * the helper's `is_finalized` parameter is encapsulated in
   * getStateForChecklistItem.
   */
  document_is_finalized?: boolean | null;
  can_generate?: boolean | null;
  /** V6 — la fenêtre de la ligne : 'upcoming' → segment « à venir » (gris), hors du compte. */
  availability?: 'open' | 'upcoming' | null;
}

interface CompletionBarProps {
  items: CompletionBarItem[];
  /**
   * Tier 1 #21 — per-year lifecycle act stack folded into the X/Y count and
   * the bar segments. The CompletenessPage groups events by FY and passes
   * eventsByYear[year] through RequirementSection. Hors-exercice events are
   * filtered out upstream (they render in their own standalone section) so
   * this prop only ever receives same-FY acts. Same three-state derivation
   * as requirements via getDocumentState (field-name remap: documentSource →
   * source, documentIsFinalized → is_finalized).
   */
  eventActs?: EventActStatus[];
}

// V6 — carrés fixes jusqu'à 12 lignes ; au-delà, UNE barre de la largeur de 12 carrés (jamais plus
// courte en grandissant). Une seule source pour les deux calculs.
const CARRE = 11;
const ECART = 2;
const MAX_CARRES = 12;
const LARGEUR_BARRE = MAX_CARRES * CARRE + (MAX_CARRES - 1) * ECART; // 154 px

// Ordre des parts de la barre continue. V7b — couleurs ET formes par jetons de sens : :root garde celles
// d'aujourd'hui (le sombre ne bouge pas) ; le clair suit Aria (manquant en pointillé gris, à venir en aplat).
const ORDRE: DisplayState[] = ['final', 'draft', 'upcoming', 'missing'];
const SEGMENT: Partial<Record<DisplayState, string>> = {
  final: 'bg-[var(--sens-final)]',
  draft: 'bg-[var(--sens-brouillon)]',
  upcoming: 'bg-[var(--sens-a-venir-fond)] border-2 border-[var(--sens-a-venir-filet)] [border-style:var(--sens-a-venir-trait)]',
  missing: 'border-2 border-[var(--sens-manquant)] [border-style:var(--sens-manquant-trait)]',
};

/**
 * La barre de section de Complétude (V6, décision de Dom : « un brouillon n'est pas fait »).
 *
 *   final · brouillon (visible, HORS du compte) · à venir · manquant — couleurs et formes : jetons --sens-* (V7b)
 *
 * Compteur = finaux / total. Le % pondéré de la page reste à lib/minute-book/state.ts (STATE_WEIGHT).
 * Les actes n'ont pas de fenêtre : jamais « à venir » (même règle que CompletenessPage).
 */
export default function CompletionBar({ items, eventActs }: CompletionBarProps) {
  const t = useTranslations('minuteBook.completeness');
  if (items.length === 0 && (!eventActs || eventActs.length === 0)) return null;

  const states: DisplayState[] = [
    ...items.map((i) => displayStateOf({ documentState: getStateForChecklistItem(i), availability: i.availability })),
    ...(eventActs ?? []).map((a) =>
      displayStateOf({
        documentState: getDocumentState({
          satisfied: a.satisfied,
          source: a.documentSource,
          is_finalized: a.documentIsFinalized,
        }),
      }),
    ),
  ];
  const finalCount = states.filter((s) => s === 'final').length;
  const totalCount = states.length;

  return (
    <div className="flex items-center gap-3">
      {totalCount <= MAX_CARRES ? (
        <div className="flex shrink-0 items-center" style={{ gap: ECART }} aria-hidden="true">
          {states.map((state, i) => (
            <div key={i} className={`rounded-sm ${SEGMENT[state]}`} style={{ width: CARRE, height: CARRE }} />
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 overflow-hidden rounded-sm" style={{ width: LARGEUR_BARRE, height: CARRE }} aria-hidden="true">
          {ORDRE.map((etat) => {
            const n = states.filter((s) => s === etat).length;
            return n === 0 ? null : (
              <div key={etat} className={SEGMENT[etat]} style={{ width: `${(n / totalCount) * 100}%` }} />
            );
          })}
        </div>
      )}
      <span aria-hidden="true" className="min-w-[5ch] text-right text-[12.5px] text-[var(--text-meta)] tabular-nums shrink-0">
        {finalCount}/{totalCount}
      </span>
      <span className="sr-only">{t('barLabel', { final: finalCount, total: totalCount })}</span>
    </div>
  );
}
