import type { DocumentState } from '@/lib/minute-book/state';

/**
 * LES CINQ ÉTATS AFFICHÉS — UNE SEULE SOURCE (lot V1, 2026-09-24).
 *
 * ★ Au-dessus de state.ts, jamais à sa place : state.ts calcule l'état du
 * document (trois valeurs) ; ce module décide ce que l'écran en DIT.
 * ⚠️ Pur : ni React, ni supabase. Les filtres de Complétude ne passent pas ici.
 */
export type DisplayState = 'final' | 'draft' | 'missing' | 'upcoming' | 'archived';

/** Les clés sous `documentState` dans messages/*.json. */
export type DisplayStateLabelKey = DisplayState | 'archivedCertified';

export function displayStateOf(input: {
  documentState: DocumentState;
  availability?: 'open' | 'upcoming' | null;
  isArchived?: boolean;
}): DisplayState {
  // L'ordre EST la règle : l'archive d'abord, la fenêtre seulement pour un manquant.
  if (input.isArchived) return 'archived';
  if (input.documentState === 'téléversé') return 'final';
  if (input.documentState === 'généré') return 'draft';
  if (input.availability === 'upcoming') return 'upcoming';
  return 'missing';
}

export function displayStateLabelKey(
  state: DisplayState,
  opts?: { certified?: boolean },
): DisplayStateLabelKey {
  // La certification ne nuance QUE l'archive ; le code, lui, reste `archived`.
  if (state === 'archived' && opts?.certified === true) return 'archivedCertified';
  return state;
}
