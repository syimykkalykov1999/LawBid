'use client';

import { BracketsCurly } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { EmailVariable } from './email-utils';

/**
 * Catalog variables as chips. Clicking one inserts `{{name}}` into the
 * last focused field (mousedown is prevented so the field keeps focus);
 * hovering shows the description and the sample value.
 */
export function VariableChips({
  vars,
  onInsert,
  disabled,
}: {
  vars: EmailVariable[];
  onInsert: (name: string) => void;
  disabled?: boolean;
}) {
  if (vars.length === 0) return <p className="text-xs text-faint">У этого письма нет переменных.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {vars.map((v) => (
        <span key={v.name} className="group relative">
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(v.name)}
            aria-label={`Вставить {{${v.name}}} — ${v.description}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs transition-colors disabled:opacity-50',
              v.required
                ? 'border-gold/40 bg-accent-soft text-gold-600 hover:border-gold'
                : 'border-line bg-surface-2 text-ink hover:border-gold/50',
            )}
          >
            <BracketsCurly size={12} weight="light" />
            {v.name}
            {v.required ? <span className="font-sans text-[10px]">обяз.</span> : null}
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full left-0 z-30 mt-1.5 w-64 translate-y-1 rounded-xl border border-line bg-elevated p-3 text-xs opacity-0 shadow-pop transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          >
            <span className="block text-ink">{v.description}</span>
            <span className="mt-1.5 block text-faint">Пример:</span>
            <span className="block break-all font-mono text-muted">{v.sample}</span>
            {v.required ? <span className="mt-1.5 block text-gold-600">Обязательно должна быть в письме</span> : null}
          </span>
        </span>
      ))}
    </div>
  );
}
