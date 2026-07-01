import { AlertTriangle, Calendar, Clock, X } from 'lucide-react';

interface ObligationModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  deadlineLabel: string;
  deadline: string;
  body: string;
  legalRef: string;
  howToLabel: string;
  comingSoonTitle: string;
  comingSoonBadge: string;
  comingSoonBody: string;
  ackLabel: string;
}

const overlayCls = 'fixed inset-0 z-50 flex items-end justify-center sm:items-center';
const backdropCls = 'absolute inset-0 bg-black/40 backdrop-blur-sm';
const containerCls = 'relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl modal-surface';
const headerCls = 'flex items-start gap-3 modal-header px-6 py-4';
const tileCls = 'flex items-center justify-center h-[38px] w-[38px] rounded-[10px] shrink-0 bg-[var(--warning-bg)] border border-[var(--warning-border)] text-[var(--warning-text)]';
const tileIconCls = 'h-5 w-5';
const titleCls = 'text-lg font-semibold text-[var(--text-heading)] leading-tight';
const subtitleCls = 'text-xs text-[var(--text-muted)] mt-0.5';
const closeBtnCls = 'ml-auto shrink-0 text-[var(--text-muted)] hover:text-[var(--text-body)]';
const bodyCls = 'px-6 py-5 space-y-4';
const dlCalloutCls = 'flex items-center gap-3 rounded-[10px] p-3 bg-[var(--warning-bg)] border border-[var(--warning-border)] border-l-[3px] border-l-[var(--amber-400)]';
const dlIconCls = 'h-[18px] w-[18px] shrink-0 text-[var(--warning-text)]';
const dlTxCls = 'text-xs text-[var(--warning-text)] leading-snug';
const dlDateCls = 'block font-bold text-[15px] text-[var(--warning-text)] mt-0.5';
const obligBodyCls = 'text-sm text-[var(--text-body)] leading-relaxed';
const legalCls = 'text-xs text-[var(--text-muted)] font-mono mt-2';
const dividerCls = 'border-t border-[var(--divider)]';
const howToLabelCls = 'text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]';
const howToCardCls = 'flex items-center gap-3 rounded-[10px] p-4 border border-dashed border-[var(--card-border)] bg-[var(--card-bg)]';
const howToIconWrapCls = 'flex items-center justify-center h-[34px] w-[34px] rounded-[9px] shrink-0 text-[var(--text-muted)] bg-[var(--card-bg)] border border-[var(--card-border)]';
const howToIconCls = 'h-[18px] w-[18px]';
const howToTitleCls = 'text-sm font-semibold text-[var(--text-body)] flex items-center gap-2';
const badgeCls = 'text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-[var(--warning-bg)] border border-[var(--warning-border)] text-[var(--warning-text)]';
const howToBodyCls = 'text-xs text-[var(--text-muted)] mt-1';
const footerCls = 'flex items-center justify-end modal-footer px-6 py-4';
const ackBtnCls = 'rounded-[10px] px-5 py-2 text-sm font-semibold bg-[var(--text-heading)] text-[var(--card-bg)] hover:opacity-90';

export function ObligationModal(props: ObligationModalProps) {
  const { open, onClose, title, subtitle, deadlineLabel, deadline, body, legalRef, howToLabel, comingSoonTitle, comingSoonBadge, comingSoonBody, ackLabel } = props;
  if (!open) return null;
  return (
    <div className={overlayCls}>
      <div className={backdropCls} onClick={onClose} aria-hidden="true" />
      <div className={containerCls} role="dialog" aria-modal="true">
        <div className={headerCls}>
          <span className={tileCls}>
            <AlertTriangle className={tileIconCls} aria-hidden="true" />
          </span>
          <div>
            <div className={titleCls}>{title}</div>
            <div className={subtitleCls}>{subtitle}</div>
          </div>
          <button type="button" onClick={onClose} className={closeBtnCls} aria-label={ackLabel}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={bodyCls}>
          <div className={dlCalloutCls}>
            <Calendar className={dlIconCls} aria-hidden="true" />
            <span className={dlTxCls}>
              {deadlineLabel}
              <span className={dlDateCls}>{deadline}</span>
            </span>
          </div>
          <div>
            <p className={obligBodyCls}>{body}</p>
            <div className={legalCls}>{legalRef}</div>
          </div>
          <div className={dividerCls} />
          <div className={howToLabelCls}>{howToLabel}</div>
          <div className={howToCardCls}>
            <span className={howToIconWrapCls}>
              <Clock className={howToIconCls} aria-hidden="true" />
            </span>
            <div>
              <div className={howToTitleCls}>
                {comingSoonTitle}
                <span className={badgeCls}>{comingSoonBadge}</span>
              </div>
              <div className={howToBodyCls}>{comingSoonBody}</div>
            </div>
          </div>
        </div>
        <div className={footerCls}>
          <button type="button" onClick={onClose} className={ackBtnCls}>{ackLabel}</button>
        </div>
      </div>
    </div>
  );
}
