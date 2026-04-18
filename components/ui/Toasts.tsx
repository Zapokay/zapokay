'use client';

import { useCallback, useState } from 'react';

export type ToastType = 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

function ToastStackImpl({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-xl shadow-md text-sm font-medium border animate-fade-in pointer-events-auto ${
            toast.type === 'success'
              ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
              : 'bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Toast hook. Returns:
 *   - toasts: current stack (read-only)
 *   - addToast(message, type): adds a toast; auto-dismisses after 4s
 *   - ToastStack: a bound JSX element — render with `{ToastStack}` once in your tree
 *
 * Auto-dismiss: 4000 ms (matches the prior inline implementation in DocumentsClient).
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    // Use (Date.now + random) to avoid collisions when multiple toasts are added in the same tick.
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const ToastStack = <ToastStackImpl toasts={toasts} />;

  return { toasts, addToast, ToastStack };
}
