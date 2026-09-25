'use client';

/**
 * LA LIGNE COMMUNE — Documents d'abord (lot V3, 2026-09-24), Complétude et le Livre ensuite.
 *
 * ⛔ UNE SEULE <div> DE LIGNE, qui porte à la fois le TITRE et le RAIL. `ligneDuCoffre`
 * (e2e/aides.ts) cherche la div la plus profonde contenant le titre ET le bouton
 * « Supprimer » : deux div sœurs sans parent commun feraient tomber cette recherche
 * sur la carte entière, et le clic en mode strict.
 * ★ Les modales (children) sont les SŒURS de la ligne, dans une enveloppe <div> :
 * dedans, leur voile fixe « survolait » la ligne (:hover remonte aux ancêtres).
 * L'enveloppe porte le filet de divide-y ; la liste arrondit `>div:last-child>div:first-child`.
 * ⚪ Emplacements, de gauche à droite : chevron (réservé) · identité · titre · état
 * (case de LARGEUR FIXE, même vide) · méta · rail. Le rail lit `group-hover`.
 */

import type { ReactNode } from 'react';

interface ListRowProps {
  /** Réservé au chevron ; vide sur Documents, la case garde sa largeur. */
  leading?: ReactNode;
  identity?: ReactNode;
  /** Coupé par CSS (truncate) : le texte entier reste dans le DOM. */
  title: string;
  /** Le badge d'état ; la case est réservée même quand il n'y en a pas. */
  state?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Modales de la ligne. */
  children?: ReactNode;
}

export default function ListRow({ leading, identity, title, state, meta, actions, children }: ListRowProps) {
  return (
    <div>
      <div className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-colors duration-[90ms]">
        <span aria-hidden={leading ? undefined : true} className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          {leading}
        </span>
        {identity}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-heading)]">{title}</span>
        <span className="flex w-[120px] flex-shrink-0 items-center">{state}</span>
        {meta && <div className="flex flex-shrink-0 items-center gap-3">{meta}</div>}
        {actions}
      </div>
      {children}
    </div>
  );
}
