'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-300 disabled:opacity-45',
        checked ? 'border-transparent bg-gradient-to-r from-gold-500 to-gold-300' : 'border-line-strong bg-surface-2',
        className,
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={cn(
          'block h-[18px] w-[18px] rounded-full shadow-[0_2px_6px_rgb(0_0_0/0.25)]',
          checked ? 'ml-[22px] bg-white' : 'ml-[3px] bg-white dark:bg-[#9a9aa6]',
        )}
      />
    </button>
  );
}
