'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { DATA_REQUEST_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

const SECTIONS = [
  ['profile', 'Профиль'],
  ['contacts', 'Контакты (email, телефон)'],
  ['cases', 'Кейсы'],
  ['bids', 'Биды'],
  ['contact_disclosures', 'Раскрытия контактов'],
  ['messages', 'Сообщения чатов'],
] as const;
type Section = (typeof SECTIONS)[number][0];

/** docs/06 §5.4: the package is prepared within the scope, with a
 * justification, and downloaded as JSON for the official channel. */
export default function DataRequestCardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [sections, setSections] = useState<Section[]>(['profile']);
  const [status, setStatus] = useState<'received' | 'in_progress' | 'fulfilled' | 'rejected'>('in_progress');
  const [notes, setNotes] = useState('');

  const q = useQuery({
    queryKey: ['data-request', id],
    queryFn: async () => (await api.GET('/admin/data-requests/{id}', { params: { path: { id } } })).data!.data,
  });
  const r = q.data;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['data-request', id] });
    void qc.invalidateQueries({ queryKey: ['data-requests'] });
  };

  const pack = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Подготовить пакет данных',
        description: `Запрос ${r?.referenceNumber}: укажите, какие пункты запроса покрывает выгрузка. Каждая сущность попадёт в data_access_log.`,
        label: 'Основание (пункты запроса)',
        confirm: 'Подготовить',
      });
      if (!a) return null;
      const res = await api.POST('/admin/data-requests/{id}/package', {
        params: { path: { id }, header: { 'X-Justification': a.text } },
        body: { userId, sections },
      });
      return res.data!.data;
    },
    onSuccess: (p) => {
      if (!p) return;
      setError(null);
      refresh();
      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lawbid-${p.referenceNumber.replace(/[^\w.-]+/g, '_')}-${p.preparedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => setError(errorText(e)),
  });
  const setStatusM = useMutation({
    mutationFn: () => api.PATCH('/admin/data-requests/{id}/status', { params: { path: { id } }, body: { status, ...(notes ? { notes } : {}) } }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });

  if (!r) {
    return (
      <>
        <PageHeader title="Запрос" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
      </>
    );
  }
  return (
    <>
      {dialog}
      <PageHeader
        title={`${r.requestType === 'subpoena' ? 'Subpoena' : 'Court order'} ${r.referenceNumber}`}
        subtitle={`${r.agency} · получен ${formatDateTime(r.receivedAt)} · выгрузок: ${r.accessCount}`}
        actions={<Badge tone={r.status === 'fulfilled' ? 'success' : r.status === 'rejected' ? 'danger' : 'gold'}>{DATA_REQUEST_STATUS[r.status] ?? r.status}</Badge>}
      />
      <ErrorNote text={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Объём запроса</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="whitespace-pre-wrap">{r.scope}</p>
            {r.notes ? <p className="text-xs text-muted">{r.notes}</p> : null}
            <div className="text-xs text-muted">Зарегистрирован {formatDateTime(r.createdAt)}{r.closedAt ? ` · закрыт ${formatDateTime(r.closedAt)}` : ''}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Пакет данных</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="uid">Пользователь (id)</Label>
              <Input id="uid" placeholder="uuid из раздела «Пользователи»" value={userId} onChange={(e) => setUserId(e.target.value.trim())} />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Разделы (только в объёме запроса)</legend>
              {SECTIONS.map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sections.includes(v)}
                    onChange={(e) => setSections(e.target.checked ? [...sections, v] : sections.filter((s) => s !== v))}
                  />
                  {l}
                </label>
              ))}
            </fieldset>
            <Button
              disabled={pack.isPending || !/^[0-9a-f-]{36}$/i.test(userId) || sections.length === 0 || r.status === 'fulfilled' || r.status === 'rejected'}
              onClick={() => pack.mutate()}
            >
              Подготовить и скачать JSON
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Статус</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {Object.entries(DATA_REQUEST_STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Input placeholder="Заметка (как передано, кому)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button variant="outline" disabled={setStatusM.isPending} onClick={() => setStatusM.mutate()}>
              Сохранить статус
            </Button>
          </CardContent>
        </Card>
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted">data_access_log</h2>
        <Table>
          <thead>
            <tr>
              <Th>Когда</Th>
              <Th>Сущность</Th>
              <Th>Id</Th>
              <Th>Администратор</Th>
            </tr>
          </thead>
          <tbody>
            {r.accessLog.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap">{formatDateTime(l.accessedAt)}</Td>
                <Td>{l.entityType}</Td>
                <Td className="font-mono text-xs">{l.entityId}</Td>
                <Td className="font-mono text-xs">{l.adminId.slice(0, 8)}</Td>
              </tr>
            ))}
            {r.accessLog.length === 0 ? (
              <tr>
                <Td colSpan={4} className="py-6 text-center text-muted">
                  Выгрузок ещё не было
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>
    </>
  );
}
