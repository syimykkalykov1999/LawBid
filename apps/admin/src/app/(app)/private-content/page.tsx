'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { SortTh, Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { PRIVATE_KIND_LABEL } from '@/lib/labels';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';

type MessagesPage = components['schemas']['PrivateMessagesPageDto'];
type CallsPage = components['schemas']['PrivateCallsDto'];
type FilesPage = components['schemas']['PrivateCaseFilesDto'];

/** Mirrors PRIVATE_REASON_CODES in the API (admin-private-content.ts). */
const REASONS: { value: string; label: string }[] = [
  { value: 'report_review', label: 'Рассмотрение жалобы' },
  { value: 'imminent_harm', label: 'Предотвращение непосредственного вреда' },
  { value: 'legal_process', label: 'Законный юридический запрос' },
  { value: 'tech_fix_consent', label: 'Техническая проблема, с согласия пользователя' },
];

const REASON_LABEL: Record<string, string> = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const MESSAGE_SORT_KEYS = ['time', 'sender', 'type'] as const;
const CALL_SORT_KEYS = ['time', 'caller', 'callee', 'status', 'duration'] as const;
const FILE_SORT_KEYS = ['file', 'type', 'size'] as const;
const REPORT_SORT_KEYS = ['admin', 'kind', 'reason', 'count'] as const;

/** Fresh month (UTC) as YYYY-MM for the report. */
const lastMonth = () => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

/**
 * Owner 2026-10-28 (attorney-client privilege): the only place where staff
 * open private chats, calls and case files. Every read needs a reason code
 * and a written reason (also for the owner) and is written to the audit
 * log first; message texts and files are hidden until revealed one by one
 * with a fresh authenticator code. No second administrator is needed.
 */
export default function PrivateContentPage() {
  const [conversationId, setConversationId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [reasonCode, setReasonCode] = useState(REASONS[0].value);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagesPage | null>(null);
  const [calls, setCalls] = useState<CallsPage | null>(null);
  const [files, setFiles] = useState<FilesPage | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [stepUp, setStepUp] = useState<null | (() => void)>(null);
  const [month, setMonth] = useState(lastMonth());

  const ready = reason.trim().length >= 10;
  const header = {
    'X-Reason-Code': reasonCode,
    'X-Justification': encodeURIComponent(reason.trim()),
  };

  /** Runs [fn]; a missing fresh code opens the 2FA dialog and retries once. */
  const guarded = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
        setStepUp(() => () => void guarded(fn));
        return;
      }
      setError(errorText(e));
    }
  };

  const loadMessages = useMutation({
    mutationFn: () =>
      guarded(async () => {
        const r = await api.GET('/admin/private-content/conversations/{id}/messages', {
          params: { path: { id: conversationId.trim() }, query: { limit: 50 }, header },
        });
        if (r.error) throw r.error;
        setMessages(r.data.data);
      }),
  });
  const loadCalls = useMutation({
    mutationFn: () =>
      guarded(async () => {
        const r = await api.GET('/admin/private-content/conversations/{id}/calls', {
          params: { path: { id: conversationId.trim() }, header },
        });
        if (r.error) throw r.error;
        setCalls(r.data.data);
      }),
  });
  const loadFiles = useMutation({
    mutationFn: () =>
      guarded(async () => {
        const r = await api.GET('/admin/private-content/cases/{id}/files', {
          params: { path: { id: caseId.trim() }, header },
        });
        if (r.error) throw r.error;
        setFiles(r.data.data);
      }),
  });

  const reveal = (id: string) =>
    guarded(async () => {
      const r = await api.POST('/admin/private-content/messages/{id}/reveal', {
        params: { path: { id }, header },
      });
      if (r.error) throw r.error;
      setRevealed((p) => ({ ...p, [id]: r.data.data.body }));
    });

  const openFile = (fileId: string) =>
    guarded(async () => {
      // 12.11: opened before the request, while the click still counts
      // (Safari/phones block window.open() after an await).
      const tab = window.open('about:blank', '_blank');
      const r = await api.POST('/admin/private-content/cases/{id}/files/{fileId}/url', {
        params: { path: { id: caseId.trim(), fileId }, header },
      });
      if (r.error) {
        tab?.close();
        throw r.error;
      }
      if (!tab) throw new Error('Браузер не дал открыть новую вкладку — разрешите всплывающие окна для admin.lawbid.dev');
      tab.opener = null;
      tab.location.href = r.data.data.url;
    });

  const report = useQuery({
    queryKey: ['access-report', month],
    queryFn: async () => {
      const r = await api.GET('/admin/audit-log/access-report', { params: { query: { month } } });
      if (r.error) throw r.error;
      return r.data.data;
    },
    retry: false,
  });

  const messageSort = useTableSort(MESSAGE_SORT_KEYS, 'messageSort');
  const messageRows = sortRows(messages?.items ?? [], messageSort.sort, {
    time: (m) => m.createdAt,
    sender: (m) => m.senderId ?? 'система',
    type: (m) => m.type,
  });
  const callSort = useTableSort(CALL_SORT_KEYS, 'callSort');
  const callRows = sortRows(calls?.items ?? [], callSort.sort, {
    time: (c) => c.createdAt,
    caller: (c) => c.callerId,
    callee: (c) => c.calleeId,
    status: (c) => c.status,
    duration: (c) => c.durationSec ?? null,
  });
  const fileSort = useTableSort(FILE_SORT_KEYS, 'fileSort');
  const fileRows = sortRows(files?.items ?? [], fileSort.sort, {
    file: (f) => f.description ?? f.fileId,
    type: (f) => f.mime,
    size: (f) => f.sizeBytes,
  });
  const reportSort = useTableSort(REPORT_SORT_KEYS, 'reportSort');
  const reportRows = sortRows(report.data?.rows ?? [], reportSort.sort, {
    admin: (r) => r.adminEmail ?? r.adminId,
    kind: (r) => PRIVATE_KIND_LABEL[r.kind] ?? r.kind,
    reason: (r) => (r.reasonCode ? REASON_LABEL[r.reasonCode] ?? r.reasonCode : null),
    count: (r) => r.count,
  });

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Приватные чаты и файлы"
        subtitle="Чтение переписки, звонков и файлов кейса только по причине из списка. Каждое обращение пишется в журнал до показа. Тексты и файлы открываются по одному, с кодом из приложения-аутентификатора."
      />

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Код причины">
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Пояснение (не короче 10 символов)" hint="Что именно и почему вы открываете. Видно в журнале и в месячном отчёте.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        </div>
        <ErrorNote text={error} />
      </Card>

      <SectionTitle>Переписка и звонки</SectionTitle>
      <Card className="space-y-3 p-5">
        <Field label="ID разговора">
          <Input value={conversationId} onChange={(e) => setConversationId(e.target.value)} placeholder="uuid" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready || !conversationId.trim() || loadMessages.isPending} onClick={() => loadMessages.mutate()}>
            Показать переписку (без текста)
          </Button>
          <Button variant="ghost" disabled={!ready || !conversationId.trim() || loadCalls.isPending} onClick={() => loadCalls.mutate()}>
            Показать звонки
          </Button>
        </div>
        {messages ? (
          <Table>
            <thead>
              <tr>
                <SortTh {...messageSort.header('time')}>Время</SortTh>
                <SortTh {...messageSort.header('sender')}>Отправитель</SortTh>
                <SortTh {...messageSort.header('type')}>Тип</SortTh>
                <Th>Текст</Th>
              </tr>
            </thead>
            <tbody>
              {messages.items.length === 0 ? <TableEmpty colSpan={4}>Сообщений нет</TableEmpty> : null}
              {messageRows.map((m) => (
                <tr key={m.id}>
                  <Td>{formatDateTime(m.createdAt)}</Td>
                  <Td className="font-mono text-xs">{m.senderId ?? 'система'}</Td>
                  <Td>
                    {m.type}
                    {m.deleted ? ' · удалено' : ''}
                  </Td>
                  <Td>
                    {revealed[m.id] !== undefined ? (
                      <span className="whitespace-pre-wrap">{revealed[m.id] || '—'}</span>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={!ready} onClick={() => void reveal(m.id)}>
                        Показать текст
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {calls ? (
          <Table>
            <thead>
              <tr>
                <SortTh {...callSort.header('time')}>Время</SortTh>
                <SortTh {...callSort.header('caller')}>Кто звонил</SortTh>
                <SortTh {...callSort.header('callee')}>Кому</SortTh>
                <SortTh {...callSort.header('status')}>Статус</SortTh>
                <SortTh {...callSort.header('duration')}>Длительность, с</SortTh>
              </tr>
            </thead>
            <tbody>
              {calls.items.length === 0 ? <TableEmpty colSpan={5}>Звонков нет</TableEmpty> : null}
              {callRows.map((c) => (
                <tr key={c.id}>
                  <Td>{formatDateTime(c.createdAt)}</Td>
                  <Td className="font-mono text-xs">{c.callerId}</Td>
                  <Td className="font-mono text-xs">{c.calleeId}</Td>
                  <Td>
                    {c.status}
                    {c.video ? ' · видео' : ''}
                  </Td>
                  <Td>{c.durationSec ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <SectionTitle>Файлы кейса</SectionTitle>
      <Card className="space-y-3 p-5">
        <Field label="ID кейса">
          <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="uuid" />
        </Field>
        <Button disabled={!ready || !caseId.trim() || loadFiles.isPending} onClick={() => loadFiles.mutate()}>
          Показать список файлов
        </Button>
        {files ? (
          <Table>
            <thead>
              <tr>
                <SortTh {...fileSort.header('file')}>Файл</SortTh>
                <SortTh {...fileSort.header('type')}>Тип</SortTh>
                <SortTh {...fileSort.header('size')}>Размер, байт</SortTh>
                <Th>Открыть</Th>
              </tr>
            </thead>
            <tbody>
              {files.items.length === 0 ? <TableEmpty colSpan={4}>Файлов нет</TableEmpty> : null}
              {fileRows.map((f) => (
                <tr key={f.fileId}>
                  <Td>{f.description ?? f.fileId}</Td>
                  <Td>{f.mime}</Td>
                  <Td>{f.sizeBytes}</Td>
                  <Td>
                    <Button size="sm" variant="ghost" disabled={!ready} onClick={() => void openFile(f.fileId)}>
                      Открыть (2FA)
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <SectionTitle>Месячный отчёт: кто читал приватное</SectionTitle>
      <Card className="space-y-3 p-5">
        <Field label="Месяц (ГГГГ-ММ)" hint="Отчёт приходит владельцу на почту 1-го числа; журнал аудита хранит каждую строку.">
          <Input value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-40" />
        </Field>
        <ErrorNote text={report.error ? errorText(report.error) : null} />
        {report.data ? (
          <>
            <p className="text-sm text-muted">
              Всего обращений за {report.data.month}: <b>{report.data.total}</b>
            </p>
            <Table>
              <thead>
                <tr>
                  <SortTh {...reportSort.header('admin')}>Сотрудник</SortTh>
                  <SortTh {...reportSort.header('kind')}>Что читал</SortTh>
                  <SortTh {...reportSort.header('reason')}>Причина</SortTh>
                  <SortTh {...reportSort.header('count')}>Раз</SortTh>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.length === 0 ? <TableEmpty colSpan={4}>Никто не читал приватное</TableEmpty> : null}
                {reportRows.map((r) => (
                  <tr key={`${r.adminId}|${r.kind}|${r.reasonCode}`}>
                    <Td>{r.adminEmail ?? r.adminId}</Td>
                    <Td>{PRIVATE_KIND_LABEL[r.kind] ?? r.kind}</Td>
                    <Td>{r.reasonCode ? <Badge>{REASON_LABEL[r.reasonCode] ?? r.reasonCode}</Badge> : '—'}</Td>
                    <Td>{r.count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : null}
      </Card>

      <StepUpDialog
        open={stepUp !== null}
        description="Для показа текста или файла нужен свежий код из приложения-аутентификатора."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const retry = stepUp;
          setStepUp(null);
          retry?.();
        }}
      />
    </>
  );
}
