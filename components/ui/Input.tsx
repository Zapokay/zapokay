import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[var(--text-body)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl border bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)]',
            'text-sm transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[var(--amber-400)] focus:border-transparent',
            error ? 'border-[var(--error-border)] bg-[var(--error-bg)]' : 'border-[var(--input-border)] hover:border-[var(--input-border-hover)]',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
export default Input;
