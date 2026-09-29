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

/** docs/06 §2.3 item 7: switches + rollout percent; paid flags warn and
 * the server refuses to enable them without provider keys. */
export default function FlagsPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [rollout, setRollout] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data,
  });
  const update = useMutation({
    mutationFn: (v: { key: string; enabled?: boolean; rolloutPercent?: number }) =>
      api.PATCH('/admin/feature-flags/{key}', {
        params: { path: { key: v.key } },
        body: { ...(v.enabled !== undefined ? { enabled: v.enabled } : {}), ...(v.rolloutPercent !== undefined ? { rolloutPercent: v.rolloutPercent } : {}) },
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <>
      <PageHeader title="Флаги функций" subtitle="Изменения применяются без релиза (кэш сбрасывается) и пишутся в аудит." />
      <ErrorNote text={error ?? (q.error ? errorText(q.error) : null)} />
      <Table>
        <thead>
          <tr>
            <Th>Флаг</Th>
            <Th>Описание</Th>
            <Th>Состояние</Th>
            <Th>Раскрытие, %</Th>
            <Th>Изменён</Th>
          </tr>
        </thead>
        <tbody>
          {(q.data ?? []).map((f) => (
            <tr key={f.key}>
              <Td>
                <span className="font-mono text-xs">{f.key}</span>
                {f.paid ? (
                  <div className="mt-1 text-xs text-gold-600">
                    Функция использует платный сервис
                    {f.missingKeys.length ? ` · нет ключей: ${f.missingKeys.join(', ')}` : ' · ключи настроены'}
                  </div>
                ) : null}
              </Td>
              <Td className="max-w-md text-xs text-muted">{f.description ?? ''}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Badge tone={f.enabled ? 'success' : 'neutral'}>{f.enabled ? 'вкл' : 'выкл'}</Badge>
                  <Button
                    size="sm"
                    variant={f.enabled ? 'outline' : 'default'}
                    disabled={update.isPending}
                    title={f.paid && !f.enabled && f.missingKeys.length ? 'Сервер откажет: нет ключей провайдера' : undefined}
                    onClick={() => {
                      if (f.paid && !f.enabled && !confirm(`«${f.key}» использует платный сервис. Включить?`)) return;
                      update.mutate({ key: f.key, enabled: !f.enabled });
                    }}
                  >
                    {f.enabled ? 'Выключить' : 'Включить'}
                  </Button>
                </div>
              </Td>
              <Td>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(rollout[f.key] ?? f.rolloutPercent);
                    if (Number.isInteger(n) && n >= 0 && n <= 100) update.mutate({ key: f.key, rolloutPercent: n });
                  }}
                >
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="h-8 w-20"
                    value={rollout[f.key] ?? String(f.rolloutPercent)}
                    onChange={(e) => setRollout({ ...rollout, [f.key]: e.target.value })}
                  />
                  <Button size="sm" variant="ghost" type="submit" disabled={update.isPending}>
                    OK
                  </Button>
                </form>
              </Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(f.updatedAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
