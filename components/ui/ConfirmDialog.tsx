'use client';

/**
 * Generic yes/no confirm dialog. Namespace-agnostic — every string arrives as a
 * prop, so it is reusable across surfaces (no useTranslations inside).
 *
 * Built on SHELL A (modal-surface) — the house shell that ObligationModal,
 * GenerateLifecycleResolutionDialog, and the Remove* modals use — so it sits
 * visually identical beside ObligationModal on the board + Complétude. (It does
 * NOT copy DocumentRow's lighter Shell B.)
 *
 * tone defaults 'primary' (charbon, matching ObligationModal's footer ack) — a
 * confirm like "J'ai fait la déclaration" is a POSITIVE assertion, not a
 * destructive action, so destructive-red would be wrong. 'destructive' (error
 * tokens) exists for a future DocumentRow migration.
 *
 * First consumer: the Part B-2 filing confirmation. DocumentRow is NOT migrated
 * onto this here (that flips its shell + owns gate — banked as a follow-up).
 */

import { X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Disables both buttons + the close affordance while the action is in flight. */
  loading?: boolean;
  /** 'primary' = charbon (positive confirm, default); 'destructive' = error tokens. */
  tone?: 'primary' | 'destructive';
  /**
   * Inline error surfaced inside the dialog (this repo shows modal errors inline,
   * not as toasts). Rendered above the buttons; the dialog stays open so the user
   * can retry or cancel.
   */
  error?: string | null;
}

const overlayCls = 'fixed inset-0 z-50 flex items-end justify-center sm:items-center';
const backdropCls = 'absolute inset-0 bg-black/40 backdrop-blur-sm';
const containerCls = 'relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl modal-surface';
const headerCls = 'flex items-start justify-between modal-header px-6 py-4';
const titleCls = 'text-lg font-semibold text-[var(--text-heading)] leading-tight';
const closeBtnCls = 'shrink-0 text-[var(--text-muted)] hover:text-[var(--text-body)] disabled:opacity-50';
const bodyCls = 'px-6 py-5 space-y-3';
const bodyTextCls = 'text-sm text-[var(--text-body)] leading-relaxed';
const errorCls = 'text-xs text-[var(--error-text)]';
const footerCls = 'flex items-center justify-end gap-3 modal-footer px-6 py-4';
const btnBase = 'rounded-[10px] px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50';
const cancelBtnCls = `${btnBase} border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--hover)]`;
// Primary = the app's amber primary (matches the board hero's solid Téléverser).
// Theme-aware tokens (--amber-400 / --amber-hover resolve per light/dark), NOT a
// fixed brand-scale stop (Lessons §34).
const confirmPrimaryCls = `${btnBase} bg-[var(--amber-400)] text-[var(--navy-900)] hover:bg-[var(--amber-hover)] active:opacity-90`;
const confirmDestructiveCls = `${btnBase} bg-[var(--error-bg)] text-[var(--error-text)] border border-[var(--error-border)] hover:opacity-80`;

export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading = false,
  tone = 'primary',
  error = null,
}: ConfirmDialogProps) {
  if (!open) return null;
  const confirmCls = tone === 'destructive' ? confirmDestructiveCls : confirmPrimaryCls;
  return (
    <div className={overlayCls}>
      <div
        className={backdropCls}
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />
      <div className={containerCls} role="dialog" aria-modal="true">
        <div className={headerCls}>
          <div className={titleCls}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={closeBtnCls}
            aria-label={cancelLabel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={bodyCls}>
          <p className={bodyTextCls}>{body}</p>
          {error && <p className={errorCls}>{error}</p>}
        </div>
        <div className={footerCls}>
          <button type="button" onClick={onClose} disabled={loading} className={cancelBtnCls}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className={confirmCls}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
