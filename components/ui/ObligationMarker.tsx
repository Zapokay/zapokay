import type { KeyboardEvent } from 'react';
import { AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';

interface ObligationMarkerProps {
  label: string;
  deadline: string;
  // resolved / resolvedLabel: RESERVED for the deferred A3 resolved-state.
  resolved?: boolean;
  resolvedLabel?: string;
  onClick: () => void;
}

const baseCls = 'inline-flex items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[11.5px] font-semibold transition-colors self-start min-w-[300px]';
const activeCls = baseCls + ' cursor-pointer text-[var(--warning-text)] bg-[var(--warning-bg)] border border-[var(--warning-border)] hover:border-[var(--amber-400)]';
const resolvedCls = baseCls + ' text-[var(--success-text)] bg-transparent border border-[var(--success-border)]';
const iconCls = 'h-[13px] w-[13px] shrink-0';
const sepCls = 'opacity-50 mx-0.5';
const dateCls = 'font-bold whitespace-nowrap';
const chevCls = 'h-[11px] w-[11px] opacity-60 ml-0.5';

export function ObligationMarker({ label, deadline, resolved, onClick }: ObligationMarkerProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }
  const cls = resolved ? resolvedCls : activeCls;
  return (
    <span
      role="button"
      aria-haspopup="dialog"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cls}
    >
      {resolved ? (
        <CheckCircle2 className={iconCls} aria-hidden="true" />
      ) : (
        <AlertTriangle className={iconCls} aria-hidden="true" />
      )}
      {label}
      <span className={sepCls}>·</span>
      <span className={dateCls}>{deadline}</span>
      <ChevronRight className={chevCls} aria-hidden="true" />
    </span>
  );
}
