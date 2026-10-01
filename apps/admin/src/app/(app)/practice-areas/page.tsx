'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';

/**
 * Owner 2026-09-30 — qualifications: every category and subcategory with
 * how many attorneys, cases and posts use it; rename, reorder, switch off
 * (hidden from pickers, existing data kept) or add a new one.
 */
export default function PracticeAreasPage() {
  const qc = useQueryClient();
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
      return r.data!.data;
    },
    onSuccess: set,
  });
  const create = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/practice-areas', { body: { code: code.trim(), nameEn: name.trim() } });
      if (r.error) throw r.error;
      return r.data!.data;
    },
    onSuccess: (d) => {
      set(d);
      setCode('');
      setName('');
    },
  });
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (list.data ?? []).filter(
      (p) => !f || p.code.includes(f) || p.nameEn.toLowerCase().includes(f),
    );
  }, [list.data, filter]);
  return (
    <>
      <PageHeader
        title="Квалификации"
        subtitle="Категории и подкатегории практики. Выключенная скрывается из выбора, данные остаются."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
        <div className="w-72 space-y-1">
          <Label htmlFor="nc">Код новой</Label>
          <Input id="nc" value={code} onChange={(e) => setCode(e.target.value)} placeholder="family_law.surrogacy" />
        </div>
        <div className="w-72 space-y-1">
          <Label htmlFor="nn">Название (EN)</Label>
          <Input id="nn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Surrogacy" />
        </div>
        <Button disabled={!code.trim() || !name.trim() || create.isPending} onClick={() => create.mutate()}>
          Добавить
        </Button>
        <div className="ml-auto w-72 space-y-1">
          <Label htmlFor="pf">Фильтр</Label>
          <Input id="pf" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="код или название" />
        </div>
      </div>
      <ErrorNote
        text={list.error ? errorText(list.error) : update.error ? errorText(update.error) : create.error ? errorText(create.error) : null}
      />
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
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-canvas">
              <Td className={p.parentCode ? 'pl-8 text-xs text-muted' : 'text-xs font-semibold'}>{p.code}</Td>
              <Td>
                <Input
                  defaultValue={p.nameEn}
                  className="h-8"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.nameEn) update.mutate({ id: p.id, nameEn: v });
                  }}
                />
              </Td>
              <Td>
                <Input
                  type="number"
                  defaultValue={p.sort}
                  className="h-8 w-20"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v !== p.sort) update.mutate({ id: p.id, sort: v });
                  }}
                />
              </Td>
              <Td>{p.attorneys}</Td>
              <Td>{p.cases}</Td>
              <Td>{p.posts}</Td>
              <Td>
                <button type="button" onClick={() => update.mutate({ id: p.id, isActive: !p.isActive })}>
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'включена' : 'выключена'}</Badge>
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
