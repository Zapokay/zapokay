'use client';

/**
 * LE MARQUEUR D'ÉTAT — la pastille devant une ligne ou un compte (lot V7b).
 *
 * ★ UN SEUL COMPOSANT DÉCIDE (§394) : RequirementRow, EventActRow, InventoryLine et
 *   UploadDocumentModal en écrivaient chacun une copie, en couleurs de palette codées en dur.
 * ⚪ final : cercle coché en --sens-final ; brouillon : demi-cercle en --sens-brouillon ;
 *   manquant : le cercle pointillé (MissingMarker) ; à venir : l'horloge en --nontext-muted.
 * ⛔ --sens-final est réservé aux marqueurs et aux parts de barre, jamais à du texte (Max).
 */

import { CheckCircle2, Clock } from 'lucide-react';
import { MissingMarker } from './state-visuals';

export type EtatMarqueur = 'final' | 'brouillon' | 'manquant' | 'a-venir';
const TAILLE = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' } as const;

export default function StateMarker({ etat, taille = 'md' }: { etat: EtatMarqueur; taille?: keyof typeof TAILLE }) {
  const t = TAILLE[taille];
  if (etat === 'final') return <CheckCircle2 className={`${t} flex-shrink-0 text-[var(--sens-final)]`} aria-hidden="true" />;
  if (etat === 'brouillon') {
    return (
      <svg viewBox="0 0 24 24" className={`${t} flex-shrink-0 text-[var(--sens-brouillon)]`} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
      </svg>
    );
  }
  if (etat === 'manquant') return <MissingMarker className={t} />;
  return <Clock className={`${t} flex-shrink-0 text-[var(--nontext-muted)]`} aria-hidden="true" />;
}
