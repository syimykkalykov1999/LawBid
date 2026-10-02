'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { DATA_REQUEST_STATUS, DATA_REQUEST_TYPE, label, StatusPill } from '@/lib/labels';
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
type Status = 'received' | 'in_progress' | 'fulfilled' | 'rejected';
const ENTITY_TYPE: Record<string, string> = {
  user: 'пользователь',
  profile: 'профиль',
  contacts: 'контакты',
  case: 'кейс',
  cases: 'кейсы',
  bid: 'ставка',
  bids: 'ставки',
  contact_disclosure: 'раскрытие контактов',
  contact_disclosures: 'раскрытия контактов',
  message: 'сообщение',
  messages: 'сообщения',
};

/** docs/06 §5.4: the package is prepared within the scope, with a
 * justification, and downloaded as JSON for the official channel. */
export default function DataRequestCardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [sections, setSections] = useState<Section[]>(['profile']);
  // null = "the request's current status" (never roll it back by default).
  const [statusDraft, setStatusDraft] = useState<Status | null>(null);
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
        params: { path: { id }, header: { 'X-Justification': encodeURIComponent(a.text) } },
        body: { userId, sections },
      });
      return res.data!.data;
    },
    onSuccess: (p) => {
      if (!p) return;
      toast.success('Пакет подготовлен, файл скачан');
      refresh();
      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lawbid-${p.referenceNumber.replace(/[^\w.-]+/g, '_')}-${p.preparedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (e) => toast.error(e),
  });
  const status: Status | undefined = statusDraft ?? (r?.status as Status | undefined);
  const setStatusM = useMutation({
    mutationFn: async () => {
      if (!status) return null;
      if (status === 'fulfilled' || status === 'rejected') {
        const ok = await confirm({
          title: `Закрыть запрос как «${DATA_REQUEST_STATUS[status]}»?`,
          description: 'После закрытия новые пакеты данных по запросу не готовятся.',
          confirm: 'Закрыть запрос',
          danger: status === 'rejected',
        });
        if (!ok) return null;
      }
      await api.PATCH('/admin/data-requests/{id}/status', {
        params: { path: { id } },
        body: { status, ...(notes.trim() ? { notes: notes.trim() } : {}) },
      });
      return status;
    },
    onSuccess: (s) => {
      if (!s) return;
      toast.success(`Статус: ${DATA_REQUEST_STATUS[s]}`);
      setStatusDraft(null);
      setNotes('');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  if (!r) {
    return (
      <>
        <PageHeader eyebrow="Система · Запросы госорганов" title="Запрос" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <>
      {dialog}
      {confirmDialog}
      <PageHeader
        eyebrow="Система · Запросы госорганов"
        title={`${label(DATA_REQUEST_TYPE, r.requestType)} № ${r.referenceNumber}`}
        subtitle={`${r.agency} · получен ${formatDateTime(r.receivedAt)} · выгрузок: ${r.accessCount}`}
        actions={<StatusPill map={DATA_REQUEST_STATUS} value={r.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn i={0}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Объём запроса</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="whitespace-pre-wrap">{r.scope}</p>
            {r.notes ? <p className="text-xs text-muted">{r.notes}</p> : null}
            <div className="text-xs text-muted">Зарегистрирован {formatDateTime(r.createdAt)}{r.closedAt ? ` · закрыт ${formatDateTime(r.closedAt)}` : ''}</div>
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={1}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Пакет данных</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="uid">Пользователь (id)</Label>
              <Input id="uid" placeholder="uuid из раздела «Пользователи»" value={userId} onChange={(e) => setUserId(e.target.value.trim())} />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-[13px] font-medium text-ink">Разделы (только в объёме запроса)</legend>
              {SECTIONS.map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
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
              loading={pack.isPending}
              disabled={!/^[0-9a-f-]{36}$/i.test(userId) || sections.length === 0 || r.status === 'fulfilled' || r.status === 'rejected'}
              onClick={() => pack.mutate()}
            >
              Подготовить и скачать JSON
            </Button>
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={2}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Статус</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Select aria-label="Статус" value={status} onChange={(e) => setStatusDraft(e.target.value as Status)}>
              {Object.entries(DATA_REQUEST_STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Input placeholder="Заметка (как передано, кому)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button
              variant="outline"
              loading={setStatusM.isPending}
              disabled={status === r.status && !notes.trim()}
              onClick={() => setStatusM.mutate()}
            >
              Сохранить статус
            </Button>
          </CardContent>
        </Card>
        </FadeIn>
      </div>
      <section>
        <SectionTitle>Журнал доступа к данным</SectionTitle>
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
            {r.accessLog.map((l, i) => (
              <MotionRow key={l.id} i={i}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(l.accessedAt)}</Td>
                <Td>
                  <span title={l.entityType}>{label(ENTITY_TYPE, l.entityType)}</span>
                </Td>
                <Td className="font-mono text-xs">{l.entityId}</Td>
                <Td className="font-mono text-xs text-muted">{l.adminId.slice(0, 8)}</Td>
              </MotionRow>
            ))}
            {r.accessLog.length === 0 ? <TableEmpty colSpan={4}>Выгрузок ещё не было</TableEmpty> : null}
          </tbody>
        </Table>
      </section>
    </>
  );
}
