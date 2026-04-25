'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';

interface BulkCatchUpButtonProps {
  missingCount: number;
  onOpen: () => void;
  disabled?: boolean;
}

export default function BulkCatchUpButton({
  missingCount,
  onOpen,
  disabled,
}: BulkCatchUpButtonProps) {
  const t = useTranslations('minuteBook.bulkCatchUp');

  if (missingCount < 2) return null;

  const overCap = missingCount > 10;
  const tooltipId = 'bulk-catch-up-overcap-tooltip';

  return (
    <div className="relative inline-block group">
      <Button
        variant="secondary"
        size="md"
        onClick={onOpen}
        disabled={disabled}
        aria-describedby={overCap ? tooltipId : undefined}
      >
        {t('button.label', { count: missingCount })}
      </Button>
      {overCap && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg bg-[var(--navy-900)] px-3 py-2 text-xs text-[var(--neutral-0)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {t('button.overCapTooltip')}
        </span>
      )}
    </div>
  );
}
