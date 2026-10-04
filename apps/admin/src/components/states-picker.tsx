'use client';

import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { searchStates } from '@/lib/us-states';
import { cn } from '@/lib/utils';

/**
 * Owner 2026-10-04 — audience by state: "Все штаты" or any set of states
 * picked from a searchable list; the chosen ones show as removable chips.
 */
export function StatesPicker({
  mode,
  onMode,
  value,
  onChange,
}: {
  mode: 'all' | 'pick';
  onMode: (m: 'all' | 'pick') => void;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const found = searchStates(q);
  const chosen = new Set(value);
  const toggle = (code: string) => onChange(chosen.has(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className="space-y-3">
      <Tabs<'all' | 'pick'>
        size="sm"
        value={mode}
        onChange={onMode}
        items={[
          { value: 'all', label: 'Все штаты' },
          { value: 'pick', label: 'Выбрать штаты', count: mode === 'pick' && value.length ? value.length : null },
        ]}
      />
      {mode === 'pick' ? (
        <div className="space-y-3 rounded-xl border border-line p-3">
          {value.length ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Выбранные штаты">
              {value.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-gold-600">
                  {c}
                  <button type="button" aria-label={`Убрать ${c}`} onClick={() => toggle(c)} className="hover:text-ink">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onChange([])}>
                Очистить
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">Отметьте один или несколько штатов.</p>
          )}
          <div className="relative">
            <MagnifyingGlass size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input className="h-9 pl-8 text-sm" placeholder="Поиск: IL или Illinois" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск штата" />
          </div>
          <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
            {found.map((s) => (
              <label
                key={s.code}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface-2',
                  chosen.has(s.code) && 'bg-surface-2 font-medium text-ink',
                )}
              >
                <input type="checkbox" className="h-3.5 w-3.5 accent-gold" checked={chosen.has(s.code)} onChange={() => toggle(s.code)} />
                <span className="w-6 font-mono text-faint">{s.code}</span>
                <span className="truncate">{s.name}</span>
              </label>
            ))}
            {found.length === 0 ? <p className="col-span-full py-2 text-xs text-muted">Нет такого штата.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
