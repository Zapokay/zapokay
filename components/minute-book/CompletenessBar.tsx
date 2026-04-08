'use client';

interface CompletenessBarProps {
  score: number;
  totalSatisfied: number;
  totalRequired: number;
  size?: 'sm' | 'lg';
}

export default function CompletenessBar({
  score,
  totalSatisfied,
  totalRequired,
  size = 'lg',
}: CompletenessBarProps) {
  const barHeight = size === 'lg' ? 'h-3' : 'h-2';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-sora font-extrabold text-navy ${
              size === 'lg' ? 'text-3xl' : 'text-xl'
            }`}
          >
            {score}%
          </span>
          {size === 'lg' && (
            <span className="text-sm text-neutral-500">
              · {totalSatisfied} / {totalRequired} complets
            </span>
          )}
        </div>
      </div>
      <div
        className={`w-full ${barHeight} bg-neutral-200 rounded-full overflow-hidden`}
      >
        <div
          className={`${barHeight} rounded-full transition-all duration-700 ease-out`}
          style={{
            width: `${score}%`,
            backgroundColor: '#F5B91E',
          }}
        />
      </div>
    </div>
  );
}
