'use client';

/**
 * LE BOUTON-ICÔNE DES LIGNES — Documents, Complétude, le Livre (lot V7c, 2026-09-25).
 *
 * ★ IL DÉCIDE SEUL DES CINQ ÉTATS (Aria ; dévoilement : Dom) — aucune page ne lui passe de classe :
 *   1 repos : --nontext-muted à --icone-opacite-repos, pas de carré ;
 *   2 ligne survolée, focus dans la ligne, appareil sans survol : pleine opacité (le `group` est ListRow) ;
 *   3 icône survolée : --icone-survol sur un carré --icone-survol-fond, filet --icone-survol-filet
 *     (ton « danger » : --error-text sur --error-bg, filet --icone-danger-filet) ;
 *   4 focus clavier : état 2 + le contour global (--focus-ring), au rayon du carré ;
 *   5 désactivé : reste à l'état 1, curseur normal, aria-disabled (le clic est bloqué ICI, pas par
 *     l'attribut `disabled` : le bouton reste atteignable au clavier).
 * ⚪ Le filet est toujours là (transparent hors survol) : la case ne saute pas, 26 × 26.
 * ⛔ Un `href` rend un <a> (l'œil de Complétude : les parcours le lisent par a[href*=id]) ; un `onClick`,
 *   un <button>. Un lien ne se désactive pas : une action sans objet est une RÉSERVE (règle 12).
 */

import type { ReactNode } from 'react';

type Commun = { label: string; icon: ReactNode; ton?: 'neutre' | 'danger'; busy?: boolean };
type Props =
  | (Commun & { href: string; onClick?: never; disabled?: never })
  | (Commun & { onClick: () => void; href?: never; disabled?: boolean });

const roue = (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// focus-visible:rounded-[8px] : la règle globale :focus-visible impose 4 px et vient après les utilitaires.
const BASE = 'flex h-[26px] w-[26px] items-center justify-center rounded-[8px] border border-transparent text-[var(--nontext-muted)] transition-[color,background-color,border-color,opacity] duration-150 focus-visible:rounded-[8px] opacity-[var(--icone-opacite-repos)]';
const DEVOILE = 'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';
const SURVOL = {
  neutre: 'hover:text-[var(--icone-survol)] hover:bg-[var(--icone-survol-fond)] hover:border-[var(--icone-survol-filet)]',
  danger: 'hover:text-[var(--error-text)] hover:bg-[var(--error-bg)] hover:border-[var(--icone-danger-filet)]',
};

export default function IconButton(props: Props) {
  const { label, icon, ton = 'neutre', busy = false } = props;
  const inactif = !props.href && !!props.disabled;
  const classes = inactif ? `${BASE} cursor-default` : `${BASE} ${DEVOILE} ${SURVOL[ton]}`;
  const contenu = busy ? roue : icon;

  if (props.href) {
    return (
      <a href={props.href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={classes}>
        {contenu}
      </a>
    );
  }
  const onClick = props.onClick;
  return (
    <button
      type="button"
      onClick={inactif || busy ? undefined : onClick}
      aria-disabled={inactif ? true : undefined}
      aria-busy={busy ? true : undefined}
      aria-label={label}
      title={label}
      className={classes}
    >
      {contenu}
    </button>
  );
}

/** Une case RÉSERVÉE : même place, invisible, non focusable (règle 12 d'Aria). */
IconButton.Reserve = function Reserve() {
  return <span aria-hidden="true" className="invisible h-[26px] w-[26px]" />;
};
