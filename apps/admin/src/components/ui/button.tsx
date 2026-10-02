import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Navy by day, ivory by night — the site's white CTA.
        default:
          'bg-primary text-primary-fg shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_6px_16px_-8px_rgb(10_26_63/0.5)] hover:brightness-110',
        gold: 'bg-gradient-to-b from-gold-300 to-gold text-[#0b0b0d] shadow-[0_1px_0_rgb(255_255_255/0.4)_inset,0_8px_20px_-10px_rgb(201_162_74/0.8)] hover:brightness-105',
        outline: 'border border-line-strong bg-surface text-ink hover:border-gold/60 hover:bg-surface-2',
        ghost: 'text-ink hover:bg-surface-2',
        soft: 'bg-accent-soft text-gold-600 hover:brightness-95 dark:hover:brightness-125',
        danger: 'bg-danger text-white shadow-[0_6px_16px_-8px_rgb(194_54_47/0.6)] hover:brightness-110 dark:text-[#0b0b0d]',
        'danger-soft': 'bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-[10px] px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export { buttonVariants };
