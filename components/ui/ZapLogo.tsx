import { cn } from '@/lib/utils';

interface ZapLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'mark' | 'wordmark';
  className?: string;
}

const sizes = {
  sm: { mark: 24, fontSize: '14px' },
  md: { mark: 32, fontSize: '16px' },
  lg: { mark: 40, fontSize: '20px' },
}

export function ZapLogo({ size = 'md', variant = 'wordmark', className }: ZapLogoProps) {
  const s = sizes[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <rect x="2" y="2" width="52" height="52" rx="7" fill="var(--logo-sq)" />
        <path
          d="M11,13 L45,13 L45,21 L21,35 L45,35 L45,43 L11,43 L11,35 L35,21 L11,21 Z"
          fill="var(--logo-z)"
        />
        <circle cx="45" cy="13" r="5" fill="var(--logo-dot)" />
      </svg>
      {variant === 'wordmark' && (
        <span style={{
          fontFamily: 'Sora, sans-serif',
          fontSize: s.fontSize,
          fontWeight: 700,
          color: 'var(--wordmark-color)',
          letterSpacing: '-0.01em',
        }}>
          ZapOkay
        </span>
      )}
    </div>
  );
}

export default ZapLogo;
