import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-line-strong bg-paper-raised px-3 py-1 text-sm text-ink shadow-xs transition-colors outline-none',
        'placeholder:text-slate',
        'focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring',
        'disabled:pointer-events-none disabled:opacity-50 disabled:bg-paper',
        'aria-invalid:border-danger aria-invalid:ring-danger/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
