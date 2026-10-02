'use client';

import { Books, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** A sort value is a whole number ≥ 0; empty or decimal input is refused. */
function parseSort(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Owner 2026-09-30 — qualifications: every category and subcategory with
 * how many attorneys, cases and posts use it; rename, reorder, switch off
 * (hidden from pickers, existing data kept) or add a new one.
 */
export default function PracticeAreasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const list = useQuery({
    queryKey: ['admin-practice-areas'],
    queryFn: async () => (await api.GET('/admin/practice-areas')).data!.data,
  });
  const set = (data: unknown) => qc.setQueryData(['admin-practice-areas'], data);
  const update = useMutation({
    mutationFn: async (input: { id: string; nameEn?: string; isActive?: boolean; sort?: number }) => {
      const { id, ...body } = input;
      const r = await api.PATCH('/admin/practice-areas/{id}', { params: { path: { id } }, body });
      if (r.error) throw r.error;
      return { data: r.data!.data, input };
    },
    onSuccess: ({ data, input }) => {
      set(data);
      toast.success(
        input.isActive !== undefined
          ? input.isActive
            ? 'Квалификация включена'
            : 'Квалификация выключена'
          : input.sort !== undefined
            ? `Порядок: ${input.sort}`
            : 'Название сохранено',
      );
    },
    onError: (e) => {
      toast.error(e);
      // Uncontrolled inputs keep the rejected text; reload the server values.
      void qc.invalidateQueries({ queryKey: ['admin-practice-areas'] });
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/practice-areas', { body: { code: code.trim(), nameEn: name.trim() } });
      if (r.error) throw r.error;
      return r.data!.data;
    },
    onSuccess: (d) => {
      set(d);
      toast.success(`Добавлена: ${name.trim()}`);
      setCode('');
      setName('');
    },
    onError: (e) => toast.error(e),
  });
  const toggle = async (p: { id: string; nameEn: string; isActive: boolean; attorneys: number; cases: number }) => {
    const ok = await confirm(
      p.isActive
        ? {
            title: `Выключить «${p.nameEn}»?`,
            description: `Квалификация пропадёт из выбора в приложении. Данные остаются: адвокатов — ${p.attorneys}, кейсов — ${p.cases}.`,
            confirm: 'Выключить',
            danger: true,
          }
        : {
            title: `Включить «${p.nameEn}»?`,
            description: 'Квалификация снова появится в выборе в приложении.',
            confirm: 'Включить',
          },
    );
    if (ok) update.mutate({ id: p.id, isActive: !p.isActive });
  };
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (list.data ?? []).filter((p) => !f || p.code.includes(f) || p.nameEn.toLowerCase().includes(f));
  }, [list.data, filter]);
  const total = list.data?.length ?? 0;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система"
        title="Квалификации"
        subtitle="Категории и подкатегории практики. Выключенная скрывается из выбора, данные остаются."
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() && name.trim()) create.mutate();
        }}
      >
        <div className="w-72 space-y-1">
          <Label htmlFor="nc">Код новой</Label>
          <Input id="nc" value={code} onChange={(e) => setCode(e.target.value)} placeholder="family_law.surrogacy" />
        </div>
        <div className="w-72 space-y-1">
          <Label htmlFor="nn">Название (EN)</Label>
          <Input id="nn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Surrogacy" />
        </div>
        <Button type="submit" loading={create.isPending} disabled={!code.trim() || !name.trim()}>
          <Plus size={16} weight="light" />
          Добавить
        </Button>
        <div className="ml-auto w-72 space-y-1">
          <Label htmlFor="pf">Фильтр</Label>
          <div className="relative">
            <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input id="pf" className="pl-9" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="код или название" />
          </div>
        </div>
      </form>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Код</Th>
            <Th>Название</Th>
            <Th>Порядок</Th>
            <Th>Адвокаты</Th>
            <Th>Кейсы</Th>
            <Th>Посты</Th>
            <Th>Статус</Th>
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={7} loading /> : null}
          {!list.isPending && !list.error && rows.length === 0 ? (
            <TableEmpty colSpan={7}>
              <span className="inline-flex items-center gap-2">
                <Books size={16} weight="light" />
                {total === 0 ? 'Квалификаций пока нет — добавьте первую выше.' : 'Ничего не найдено'}
              </span>
            </TableEmpty>
          ) : null}
          {rows.map((p, i) => (
            <MotionRow key={p.id} i={i}>
              <Td className={cn('font-mono', p.parentCode ? 'pl-8 text-xs text-muted' : 'text-xs font-semibold text-ink')}>{p.code}</Td>
              <Td>
                <Input
                  key={`${p.id}:${p.nameEn}`}
                  aria-label="Название"
                  defaultValue={p.nameEn}
                  className="h-8"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) {
                      e.target.value = p.nameEn;
                      toast.error('Название не может быть пустым');
                    } else if (v !== p.nameEn) update.mutate({ id: p.id, nameEn: v });
                  }}
                />
              </Td>
              <Td>
                <SortCell
                  key={`${p.id}:${p.sort}`}
                  value={p.sort}
                  onSave={(v) => update.mutate({ id: p.id, sort: v })}
                />
              </Td>
              <Td className="tabular-nums">{p.attorneys}</Td>
              <Td className="tabular-nums">{p.cases}</Td>
              <Td className="tabular-nums">{p.posts}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Switch checked={p.isActive} disabled={update.isPending} label={p.nameEn} onChange={() => void toggle(p)} />
                  <Badge tone={p.isActive ? 'success' : 'neutral'} dot={p.isActive}>
                    {p.isActive ? 'включена' : 'выключена'}
                  </Badge>
                </div>
              </Td>
            </MotionRow>
          ))}
        </tbody>
      </Table>
    </>
  );
}

function SortCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const parsed = parseSort(text);
  const invalid = parsed === null;
  const commit = () => {
    if (invalid) {
      setText(String(value));
      return;
    }
    if (parsed !== value) onSave(parsed);
  };
  return (
    <div>
      <Input
        aria-label="Порядок"
        inputMode="numeric"
        value={text}
        aria-invalid={invalid}
        className={cn('h-8 w-20 tabular-nums', invalid && 'border-danger')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={commit}
      />
      {invalid ? <div className="mt-1 text-[11px] text-danger">целое ≥ 0</div> : null}
    </div>
  );
}
