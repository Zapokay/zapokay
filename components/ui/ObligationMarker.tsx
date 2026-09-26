import type { KeyboardEvent } from 'react';
import { AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { Echeance } from '@/lib/obligations/echeance';

interface ObligationMarkerProps {
  label: string;
  deadline: string;
  /** V7b — échue (date limite strictement avant aujourd'hui à Montréal), à venir, ou inconnue (sans date) : la couleur seule. */
  echeance: Echeance;
  // resolved / resolvedLabel: RESERVED for the deferred A3 resolved-state.
  resolved?: boolean;
  resolvedLabel?: string;
  /**
   * A-3 — display-only mode for the A3 board. The board shows the always-on
   * filing marker but has no dialog to open in v1 (Part B adds the "J'ai fait la
   * déclaration" interaction), so it renders as a plain, non-interactive span:
   * no role/tabIndex/onClick, no hover cursor, no chevron. Complétude keeps the
   * default interactive behavior. When false, onClick may be omitted.
   */
  interactive?: boolean;
  onClick?: () => void;
}

const baseCls = 'inline-flex items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[11.5px] font-semibold transition-colors self-start min-w-[300px]';
// V7b (Dom) — la couleur suit l'échéance : échue ou à venir (lib/obligations/echeance). En sombre, les deux
// jetons valent l'ambre d'aujourd'hui (:root). Libellé, date et icône : inchangés.
const TON = {
  echue: 'text-[var(--formalite-echue-texte)] bg-[var(--formalite-echue-fond)] border border-[var(--formalite-echue-filet)]',
  'a-venir': 'text-[var(--formalite-a-venir-texte)] bg-[var(--formalite-a-venir-fond)] border border-[var(--formalite-a-venir-filet)]',
  // Sans date limite : les jetons d'aujourd'hui, dans les deux modes (Max).
  inconnue: 'text-[var(--warning-text)] bg-[var(--warning-bg)] border border-[var(--warning-border)]',
} as const;
// Survol : en clair, le contour prend la couleur de texte de l'échéance ; en sombre, l'ambre d'aujourd'hui.
const SURVOL = {
  echue: 'hover:border-[var(--formalite-echue-survol)]',
  'a-venir': 'hover:border-[var(--formalite-a-venir-survol)]',
  inconnue: 'hover:border-[var(--amber-400)]',
} as const;
const activeCls = (e: Echeance) => `${baseCls} cursor-pointer ${TON[e]} ${SURVOL[e]}`;
const displayCls = (e: Echeance) => `${baseCls} ${TON[e]}`;
const resolvedCls = baseCls + ' text-[var(--success-text)] bg-transparent border border-[var(--success-border)]';
const iconCls = 'h-[13px] w-[13px] shrink-0';
const sepCls = 'opacity-50 mx-0.5';
const dateCls = 'font-bold whitespace-nowrap';
const chevCls = 'h-[11px] w-[11px] opacity-60 ml-0.5';

export function ObligationMarker({
  label,
  deadline,
  echeance,
  resolved,
  interactive = true,
  onClick,
}: ObligationMarkerProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  }

  const inner = (
    <>
      {resolved ? (
        <CheckCircle2 className={iconCls} aria-hidden="true" />
      ) : (
        <AlertTriangle className={iconCls} aria-hidden="true" />
      )}
      {label}
      <span className={sepCls}>·</span>
      <span className={dateCls}>{deadline}</span>
      {interactive && <ChevronRight className={chevCls} aria-hidden="true" />}
    </>
  );

  // Display-only (board): a plain span, no interactive affordances.
  if (!interactive) {
    return <span className={displayCls(echeance)}>{inner}</span>;
  }

  const cls = resolved ? resolvedCls : activeCls(echeance);
  return (
    <span
      role="button"
      aria-haspopup="dialog"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cls}
    >
      {inner}
    </span>
  );
}
