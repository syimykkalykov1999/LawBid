'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

type Entry = {
  key: string;
  type: string;
  value: unknown;
  defaultValue: unknown;
  description: string | null;
  min: number | null;
  max: number | null;
  stored: boolean;
  updatedAt: string | null;
};

function parse(type: string, raw: string): { value?: unknown; error?: string } {
  const t = raw.trim();
  try {
    switch (type) {
      case 'integer':
      case 'number': {
        const n = Number(t);
        if (t === '' || !Number.isFinite(n)) return { error: 'число' };
        return { value: n };
      }
      case 'boolean':
        if (t === 'true' || t === 'false') return { value: t === 'true' };
        return { error: 'true / false' };
      case 'string':
        return { value: t };
      case 'string[]':
        return { value: t === '' ? [] : t.split(',').map((x) => x.trim()).filter(Boolean) };
      case 'integer[]':
        return { value: t === '' ? [] : t.split(',').map((x) => Number(x.trim())) };
      default:
        return { value: JSON.parse(t) as unknown };
    }
  } catch {
    return { error: 'неверный формат' };
  }
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v));

/** docs/06 §2.3 item 8: schema-validated editor of app_config. */
export default function ConfigPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const q = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data as Entry[],
  });
  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown }) =>
      // The contract types `value` as an opaque object; any JSON value is valid here.
      api.PUT('/admin/config/{key}', { params: { path: { key: v.key } }, body: { value: v.value } as never }),
    onSuccess: (_r, v) => {
      setError(null);
      setDrafts((d) => {
        const next = { ...d };
        delete next[v.key];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => setError(errorText(e)),
  });
  const rows = (q.data ?? []).filter((e) => !filter || e.key.includes(filter));

  return (
    <>
      <PageHeader
        title="Конфигурация"
        subtitle="Лимиты, минимальные версии приложения, льготный период, пороги. Значения проверяются схемой ключа."
        actions={<Input placeholder="фильтр по ключу" className="w-64" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      />
      <ErrorNote text={error ?? (q.error ? errorText(q.error) : null)} />
      <Table>
        <thead>
          <tr>
            <Th>Ключ</Th>
            <Th>Тип</Th>
            <Th>Значение</Th>
            <Th>По умолчанию</Th>
            <Th>Изменён</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const draft = drafts[e.key];
            const parsed = draft === undefined ? null : parse(e.type, draft);
            return (
              <tr key={e.key}>
                <Td>
                  <span className="font-mono text-xs">{e.key}</span>
                  {e.description ? <div className="text-xs text-muted">{e.description}</div> : null}
                </Td>
                <Td className="text-xs">
                  {e.type}
                  {e.min !== null || e.max !== null ? <div className="text-muted">{e.min ?? '−∞'} … {e.max ?? '∞'}</div> : null}
                </Td>
                <Td>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      if (parsed && !parsed.error) save.mutate({ key: e.key, value: parsed.value });
                    }}
                  >
                    <Input
                      className="h-8 min-w-48 font-mono text-xs"
                      value={draft ?? show(e.value)}
                      onChange={(ev) => setDrafts({ ...drafts, [e.key]: ev.target.value })}
                    />
                    {draft !== undefined ? (
                      <Button size="sm" type="submit" disabled={save.isPending || Boolean(parsed?.error)} title={parsed?.error}>
                        Сохранить
                      </Button>
                    ) : null}
                  </form>
                  {!e.stored ? <div className="text-[10px] text-muted">значение по умолчанию (строки нет)</div> : null}
                </Td>
                <Td className="font-mono text-xs text-muted">{show(e.defaultValue)}</Td>
                <Td className="whitespace-nowrap text-xs">{e.updatedAt ? formatDateTime(e.updatedAt) : <Badge>—</Badge>}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
