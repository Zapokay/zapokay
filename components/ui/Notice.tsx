import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

// 'icon' = AlertTriangle + full border (UploadModal grammar).
// 'bar'  = left-accent-bar, no icon (BulkCatchUp grammar).
type NoticeVariant = 'bar' | 'icon';

interface NoticeProps {
  title: string;
  body: ReactNode;
  variant?: NoticeVariant;
  // Piece 3 adds the help affordance (helpKey -> info-icon -> modal).
  // Reserved now so Piece 3 is additive, not a signature change.
  onHelp?: () => void;
}

export function Notice({ title, body, variant = 'icon', onHelp }: NoticeProps) {
  if (variant === 'bar') {
    return (
      <div role="alert" className="mb-4 rounded-lg border-l-4 border-[var(--amber-400)] bg-[var(--warning-bg)] p-4">
        <h4 className="text-sm font-semibold text-[var(--warning-text)]">{title}</h4>
        <p className="mt-1 text-sm text-[var(--warning-text)]">{body}</p>
      </div>
    );
  }
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--amber-400)] bg-[var(--warning-bg)] p-4">
      <AlertTriangle className="h-5 w-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <h4 className="text-sm font-semibold text-[var(--warning-text)]">{title}</h4>
        <p className="mt-1 text-sm text-[var(--warning-text)]">{body}</p>
      </div>
    </div>
  );
}
