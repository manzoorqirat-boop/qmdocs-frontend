import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-seal text-white hover:bg-seal-hover shadow-sm',
        destructive:
          'bg-danger text-white hover:bg-danger/90 shadow-sm',
        outline:
          'border border-line-strong bg-paper-raised text-ink hover:bg-paper',
        secondary:
          'bg-paper text-ink border border-line hover:bg-line/40',
        ghost: 'text-ink-soft hover:bg-paper hover:text-ink',
        link: 'text-seal underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 [&_svg]:size-4',
        sm: 'h-8 rounded-md px-3 text-[13px] [&_svg]:size-3.5',
        lg: 'h-10 rounded-md px-6 [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
