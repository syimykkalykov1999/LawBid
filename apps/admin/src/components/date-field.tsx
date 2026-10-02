'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Native date input with a Russian empty-state placeholder (browsers show
 * mm/dd/yyyy according to their own locale, ignoring the page language).
 */
export function DateField({
  className,
  value,
  onFocus,
  onBlur,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value: string }) {
  const [focused, setFocused] = useState(false);
  const empty = !value && !focused;
  return (
    <div className={cn('relative w-40', className)}>
      <Input
        {...props}
        type="date"
        lang="ru"
        value={value}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn('w-full', empty && '[&::-webkit-datetime-edit]:opacity-0')}
      />
      {empty ? (
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-faint">
          дд.мм.гггг
        </span>
      ) : null}
    </div>
  );
}
