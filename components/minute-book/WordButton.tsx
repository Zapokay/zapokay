'use client';

/**
 * LE BOUTON À MOTS DES LIGNES — Téléverser, Générer, Régénérer, Remplacer, la déclaration (lot V7b).
 *
 * ★ UN SEUL COMPOSANT DÉCIDE (§394) : Complétude en portait quatre copies de classes, et seul
 *   RequirementRow figeait le survol d'un bouton désactivé.
 * ⚪ Actif : les classes d'aujourd'hui. Désactivé : --mot-inactif-texte à --mot-inactif-opacite, filet
 *   --card-border, AUCUN survol, curseur normal (Aria, comme les icônes). L'attribut natif `disabled` est gardé :
 *   le comportement ne change pas. « Occupé » est décidé par l'appelant (libellé et icône d'attente).
 * ⛔ Aucune prop className.
 */

import type { ReactNode } from 'react';

const BASE = 'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] transition-colors';
const ACTIF = 'text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)]';
const INACTIF = 'text-[var(--mot-inactif-texte)] opacity-[var(--mot-inactif-opacite)] cursor-default';

export default function WordButton({ label, icon, onClick, disabled = false }: {
  label: string; icon: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BASE} ${disabled ? INACTIF : ACTIF}`}>
      {icon}
      {label}
    </button>
  );
}
