import { cn } from '@/lib/utils';

interface ZapLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ZapLogo({ size = 'md', className }: ZapLogoProps) {
  const sizes = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' };
  const iconSizes = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-8 h-8' };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('bg-navy-900 rounded-lg flex items-center justify-center p-1.5', iconSizes[size])}>
        <svg viewBox="0 0 16 16" fill="none" className="w-full h-full">
          <path d="M9 1L3 9h5l-1 6 7-9H9l1-5z" fill="#D4821A" strokeLinejoin="round" />
        </svg>
      </div>
      <span className={cn('font-sora font-bold text-navy-900', sizes[size])}>
        Zap<span className="text-amber">Okay</span>
      </span>
    </div>
  );
}
