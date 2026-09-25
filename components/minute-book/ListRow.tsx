'use client';

/**
 * LA LIGNE COMMUNE À DEUX BANDES — Documents et Complétude (lot V4), le Livre ensuite.
 * Forme du document de phase 1 d'Aria (24 sept.) ; ses COULEURS ne s'appliquent pas :
 * jetons existants seulement.
 *
 *   bande 1 : [case 16 px] titre (une ligne, « … », plancher 200 px) [ornement] ··· [état] [date]
 *   bande 2 :   (retrait 26 px) [identité] [faits]                ··· [mots] ⟨9 px⟩ [icônes]
 *
 * ⛔ UNE SEULE <div> DE LIGNE porte les deux bandes : c'est la seule div commune au titre
 * et aux commandes, et les parcours la trouvent ainsi (ligneDuCoffre, ligneDe,
 * ancestor::div[.//input], ancestor::div[.//a]).
 * ⛔ §392 : les fenêtres (children) sont les SŒURS de la ligne, dans l'enveloppe — dedans,
 * leur voile fixe « survolait » la ligne.
 * ⚪ La case de 16 px est RÉSERVÉE même vide ; les icônes arrivent en cases de largeur
 * fixe, fournies par l'appelant (une case vide garde sa place).
 */

import type { ReactNode } from 'react';

const TITRE_PAR_DEFAUT = 'text-[14.5px] font-medium text-[var(--text-heading)]';

interface ListRowProps {
  /** Case de 16 px devant le titre : la pastille d'état à Complétude ; vide ailleurs. */
  leading?: ReactNode;
  /** Une ligne, coupée par CSS : le texte ENTIER reste dans le DOM et dans title=. */
  title: string;
  titleClassName?: string;
  /** Après le titre, HORS de la boîte coupée (DescriptionTooltip : sa bulle ne doit pas être rognée). */
  titleAdornment?: ReactNode;
  /** Bande 1, à droite, avant la date : le badge « À finaliser ». */
  state?: ReactNode;
  date?: ReactNode;
  /** Bande 2, à gauche : la boîte d'identité, puis les faits. */
  identity?: ReactNode;
  facts?: ReactNode;
  /** Bande 2, à droite : les mots d'action, collés 9 px avant la colonne d'icônes. */
  words?: ReactNode;
  icons?: ReactNode;
  /** Fenêtres de la ligne, rendues en SŒURS de la div de ligne. */
  children?: ReactNode;
}

export default function ListRow({
  leading, title, titleClassName = TITRE_PAR_DEFAUT, titleAdornment,
  state, date, identity, facts, words, icons, children,
}: ListRowProps) {
  return (
    <div>
      <div className="group flex h-[72px] flex-col justify-center gap-1 px-4 py-[11px] hover:bg-[var(--hover)] transition-colors duration-[90ms]">
        <div className="flex items-center gap-2.5">
          {/* Plancher : 225 px = case 16 + écart 9 + 200 de titre. Posé sur le CONTENEUR, pas sur
              le titre — un titre court garde sa largeur, et l'ornement le suit à 8 px (point 6). */}
          <div className="flex min-w-[225px] flex-1 items-center gap-[9px]">
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">{leading}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span title={title} className={`min-w-0 truncate ${titleClassName}`}>{title}</span>
              {titleAdornment}
            </span>
          </div>
          {(state || date) && (
            <div className="flex flex-shrink-0 items-center gap-[9px]">
              {state}
              {date}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-[7px] pl-[26px]">
            {identity}
            {facts}
          </div>
          <div className="flex flex-shrink-0 items-center justify-end">
            {words && <div className={`flex items-center gap-2 ${icons ? 'mr-[9px]' : ''}`}>{words}</div>}
            {icons && <div className="flex items-center gap-[5px]">{icons}</div>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
