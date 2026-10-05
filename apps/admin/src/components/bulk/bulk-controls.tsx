'use client';

import { CheckSquare, Funnel, X } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { DateField } from '@/components/date-field';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { type BulkResult, count, type Noun, pageState, resultText, runInBatches, SELECT_ALL_CAP, toggleId, togglePage } from '@/lib/bulk';

/**
 * Owner 2026-10-04 — bulk moderation building blocks shared by «Посты и
 * отзывы» and «Рилсы и стикеры»: row checkboxes, the selection bar, the
 * author / date filter and the confirm-with-count + reason step.
 */

/** Selected ids; cleared whenever [resetKey] (the list's filter) changes. */
export function useSelection(resetKey: string) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useEffect(() => setSelected(new Set()), [resetKey]);
  return {
    selected,
    toggle: (id: string) => setSelected((s) => toggleId(s, id)),
    togglePage: (ids: string[]) => setSelected((s) => togglePage(s, ids)),
    replace: (ids: string[]) => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
  };
}

export function SelectBox({
  state,
  onChange,
  label,
  disabled,
}: {
  state: 'none' | 'some' | 'all';
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-gold disabled:cursor-default"
      checked={state === 'all'}
      disabled={disabled}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** The header checkbox of a page of rows. */
export function PageSelectBox({ selected, ids, onToggle }: { selected: ReadonlySet<string>; ids: string[]; onToggle: (ids: string[]) => void }) {
  return <SelectBox state={pageState(selected, ids)} disabled={ids.length === 0} label="Выбрать всё на странице" onChange={() => onToggle(ids)} />;
}

export function RowSelectBox({ selected, id, onToggle }: { selected: ReadonlySet<string>; id: string; onToggle: (id: string) => void }) {
  return <SelectBox state={selected.has(id) ? 'all' : 'none'} label="Выбрать" onChange={() => onToggle(id)} />;
}

/**
 * Shown above a list for admins who can act: "select everything matching
 * the filter", the selected count and the bulk actions ([children]).
 */
export function BulkBar({
  selectedCount,
  noun,
  onSelectAll,
  onClear,
  children,
}: {
  selectedCount: number;
  noun: Noun;
  /** Loads every id matching the filter; resolves to whether the cap cut it. */
  onSelectAll: () => Promise<boolean>;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    if (selectedCount === 0) setCapped(false);
  }, [selectedCount]);
  return (
    <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-card backdrop-blur" role="toolbar" aria-label="Массовые действия">
      <span className="text-sm font-medium text-ink" data-testid="bulk-count">
        {selectedCount ? `Выбрано: ${count(selectedCount, noun)}` : 'Ничего не выбрано'}
      </span>
      {capped ? <Badge tone="warning">первые {SELECT_ALL_CAP.toLocaleString('ru-RU')}</Badge> : null}
      <Button
        size="sm"
        variant="ghost"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            setCapped(await onSelectAll());
          } catch (e) {
            toast.error(e);
          } finally {
            setLoading(false);
          }
        }}
      >
        <CheckSquare size={14} /> Выбрать всё по фильтру
      </Button>
      {selectedCount ? (
        <>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Снять выбор
          </Button>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {children}
        </>
      ) : null}
    </div>
  );
}

export interface ListFilter {
  author: { id: string; name: string } | null;
  from: string;
  to: string;
}

export const EMPTY_FILTER: ListFilter = { author: null, from: '', to: '' };

export const filterKey = (f: ListFilter) => `${f.author?.id ?? ''}|${f.from}|${f.to}`;

/** Date window + the author picked from a row ("только этот автор"). */
export function FilterFields({ id, value, onChange, authorLabel = 'Автор' }: { id: string; value: ListFilter; onChange: (f: ListFilter) => void; authorLabel?: string }) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${id}-from`}>С даты</Label>
        <DateField id={`${id}-from`} value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-to`}>По дату</Label>
        <DateField id={`${id}-to`} value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </div>
      {value.author ? (
        <div className="space-y-1">
          <Label>{authorLabel}</Label>
          <div className="flex h-10 items-center">
            <Badge tone="gold" className="gap-1.5">
              {value.author.name}
              <button type="button" aria-label="Убрать фильтр по автору" onClick={() => onChange({ ...value, author: null })} className="text-ink/70 hover:text-ink">
                <X size={12} />
              </button>
            </Badge>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Small funnel next to an author's name: show only this author's rows. */
export function AuthorFilterButton({ onPick, active }: { onPick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      title="Показать только этого автора"
      aria-label="Только этот автор"
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={active ? 'ml-1 text-gold-600' : 'ml-1 text-faint opacity-60 hover:text-gold-600 hover:opacity-100'}
    >
      <Funnel size={12} weight={active ? 'fill' : 'regular'} />
    </button>
  );
}

export interface BulkRunOptions {
  ids: string[];
  /** "Удалить" — the verb of the dialog title and button. */
  verb: string;
  /** "Удалено" — the verb of the result toast. */
  doneVerb: string;
  noun: Noun;
  description: string;
  danger?: boolean;
  send: (batch: string[], reason: string) => Promise<BulkResult>;
  onDone?: (r: BulkResult) => void;
}

/**
 * One bulk action: a dialog that states how many items it touches and asks
 * for the one reason, then batches of ≤ 500 ids, then a toast with what was
 * done and skipped. Render `dialog` once.
 */
export function useBulkRun() {
  const toast = useToast();
  const { ask, dialog } = useReason();
  const run = useMutation({
    mutationFn: async (o: BulkRunOptions) => {
      const n = o.ids.length;
      const a = await ask({
        title: `${o.verb}: ${count(n, o.noun)}?`,
        description: o.description,
        label: 'Причина (одна для всех)',
        confirm: `${o.verb} (${n.toLocaleString('ru-RU')})`,
        danger: o.danger,
      });
      if (!a) return null;
      const r = await runInBatches(o.ids, (batch) => o.send(batch, a.text));
      return { r, o };
    },
    onSuccess: (res) => {
      if (!res) return;
      toast.success(resultText(res.r, res.o.doneVerb, res.o.noun));
      res.o.onDone?.(res.r);
    },
    onError: (e) => toast.error(e),
  });
  return { run: run.mutate, pending: run.isPending, dialog };
}

/** Unwraps an openapi-fetch answer of a bulk endpoint. */
export function bulkData(r: { data?: { data: BulkResult }; error?: unknown }): BulkResult {
  if (r.error || !r.data) throw r.error ?? new Error('Пустой ответ');
  return r.data.data;
}
