'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { BulkBar, PageSelectBox, RowSelectBox, useSelection } from '@/components/bulk/bulk-controls';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { TRUST_NOTE_MAX, useDocumentRequest } from '@/components/trust/document-request-dialog';
import { invalidateTrust } from '@/components/trust/trust-panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import {
  attorneyName,
  BADGE_STATUS_RU,
  BADGE_STATUSES,
  BadgeStatusChip,
  HOLD_RU,
  MANUAL_STATUS_RU,
  MANUAL_STATUSES,
  missingText,
  staffName,
  TrustLevelChip,
  type BadgeStatus,
  type DocTemplate,
  type ManualStatus,
} from '@/lib/trust-labels';
import { formatDateTime } from '@/lib/utils';

type Row = components['schemas']['TrustAttorneyListItemDto'];
type BulkAction = components['schemas']['BulkTrustDto']['action'];

const ATTORNEYS = ['адвокат', 'адвоката', 'адвокатов'] as const;
const LIMIT = 200;

/**
 * Owner 2026-10-05 — «Адвокаты»: every attorney with their badge status
 * (Не проверено … Приостановлено). The owner filters by status, finds a
 * person and sets the status by hand with a reason; bulk actions are the
 * same as in the queue (`POST /admin/trust/bulk`).
 */
export function AttorneysList({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const { askDocuments, dialog: docDialog } = useDocumentRequest();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [status, setStatus] = useState<'' | BadgeStatus>('');
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 300);
  const sel = useSelection(`${status}|${search}`);

  const stats = useQuery({
    queryKey: ['trust-stats'],
    queryFn: async () => (await api.GET('/admin/trust/stats')).data!.data,
  });
  const counts = new Map((stats.data?.byStatus ?? []).map((x) => [x.status, x.attorneys] as const));
  const total = (stats.data?.byStatus ?? []).reduce((n, x) => n + x.attorneys, 0);

  const q = useQuery({
    queryKey: ['trust-attorneys', status, search],
    queryFn: async () =>
      (await api.GET('/admin/trust/attorneys', { params: { query: { status: status || undefined, q: search || undefined, limit: LIMIT } } })).data!.data,
  });
  const rows = q.data ?? [];
  const ids = rows.map((r) => r.attorney.id);
  const onError = (e: unknown) => toast.error(e);
  const done = (t: string) => {
    toast.success(t);
    void qc.invalidateQueries({ queryKey: ['trust-attorneys'] });
    invalidateTrust(qc);
    void qc.invalidateQueries({ queryKey: ['verification-queue'] });
  };
  const noteBody = (t: string) => (t ? { note: t } : {});

  const setStatusM = useMutation({
    mutationFn: async (r: Row) => {
      const current = BADGE_STATUS_RU[r.badgeStatus]?.text ?? r.badgeStatus;
      const a = await ask({
        title: `Сменить статус — ${attorneyName(r.attorney)}`,
        description: `Сейчас: ${current}. Причина обязательна и останется в истории адвоката.`,
        choiceLabel: 'Новый статус',
        choices: MANUAL_STATUSES.map((x) => ({ value: x, label: MANUAL_STATUS_RU[x].text })),
        label: 'Причина',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Сменить статус',
      });
      if (!a) return null;
      const next = (a.choice ?? MANUAL_STATUSES[0]) as ManualStatus;
      return api.POST('/admin/trust/attorneys/{attorneyId}/status', {
        params: { path: { attorneyId: r.attorney.id } },
        body: { status: next, note: a.text },
      });
    },
    onSuccess: (x) => x && done('Статус изменён'),
    onError,
  });

  const bulk = useMutation({
    mutationFn: async (action: BulkAction) => {
      const attorneyIds = [...sel.selected];
      const n = attorneyIds.length;
      let body: components['schemas']['BulkTrustDto'] = { attorneyIds, action };
      if (action === 'request_documents') {
        const d = await askDocuments(`Запросить документы у ${n} адвокатов`);
        if (!d) return null;
        body = { ...body, template: d.template as DocTemplate, ...noteBody(d.note) };
      } else if (action === 'reject') {
        const a = await ask({
          title: `Отклонить ${n} адвокатов`,
          description: 'Аккаунты приостанавливаются, ставки отзываются.',
          label: 'Причина',
          min: 3,
          max: TRUST_NOTE_MAX,
          confirm: 'Отклонить',
          danger: true,
        });
        if (!a) return null;
        body = { ...body, ...noteBody(a.text) };
      } else {
        const ok = await confirm({
          title: action === 'clear' ? `Подтвердить ${n} адвокатов?` : `Снять холды у ${n} адвокатов?`,
          description: action === 'clear' ? 'Галочка и приём денег откроются насовсем у каждого выбранного.' : 'Платежи и ставки возобновятся у каждого выбранного.',
          confirm: action === 'clear' ? 'Подтвердить' : 'Снять холды',
        });
        if (!ok) return null;
      }
      return (await api.POST('/admin/trust/bulk', { body })).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      sel.clear();
      done(r.failed.length ? `Готово: ${r.done}, не удалось: ${r.failed.length}` : `Готово: ${r.done}`);
    },
    onError,
  });

  const cols = canManage ? 9 : 7;

  return (
    <>
      {dialog}
      {docDialog}
      {confirmDialog}
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Все адвокаты и что сейчас значит их галочка. Статус можно сменить вручную с причиной — она останется в истории; массовые действия те же, что в
        очереди.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Статус" className="w-64" value={status} onChange={(e) => setStatus(e.target.value as '' | BadgeStatus)}>
          <option value="">Все статусы{stats.data ? ` (${total})` : ''}</option>
          {BADGE_STATUSES.map((x) => (
            <option key={x} value={x}>
              {BADGE_STATUS_RU[x].text}
              {stats.data ? ` (${counts.get(x) ?? 0})` : ''}
            </option>
          ))}
        </Select>
        <Input aria-label="Поиск" className="w-64" placeholder="Имя или @username" value={text} onChange={(e) => setText(e.target.value)} />
        {status ? <span className="text-xs text-muted">{BADGE_STATUS_RU[status].hint}</span> : null}
      </div>
      {canManage ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={ATTORNEYS}
          onClear={sel.clear}
          onSelectAll={async () => {
            sel.replace(ids);
            return false;
          }}
        >
          <Button size="sm" variant="gold" className="w-36" disabled={bulk.isPending} onClick={() => bulk.mutate('clear')}>
            Подтвердить
          </Button>
          <Button size="sm" variant="outline" className="w-44" disabled={bulk.isPending} onClick={() => bulk.mutate('request_documents')}>
            Запросить документы
          </Button>
          <Button size="sm" variant="danger" className="w-36" disabled={bulk.isPending} onClick={() => bulk.mutate('reject')}>
            Отклонить
          </Button>
          <Button size="sm" variant="soft" className="w-36" disabled={bulk.isPending} onClick={() => bulk.mutate('release')}>
            Снять холд
          </Button>
        </BulkBar>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            {canManage ? (
              <Th className="w-10">
                <PageSelectBox selected={sel.selected} ids={ids} onToggle={sel.togglePage} />
              </Th>
            ) : null}
            <Th>Адвокат</Th>
            <Th>Статус</Th>
            <Th>Уровень</Th>
            <Th>Не хватает</Th>
            <Th>Холды</Th>
            <Th>Кто подтвердил</Th>
            <Th>Жалоб</Th>
            {canManage ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={cols} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={cols}>{status || search ? 'Никого не нашли — измените статус или поиск.' : 'Адвокатов пока нет.'}</TableEmpty>
          ) : (
            rows.map((r, i) => {
              const busy = setStatusM.isPending && setStatusM.variables?.attorney.id === r.attorney.id;
              return (
                <MotionRow key={r.attorney.id} i={i}>
                  {canManage ? (
                    <Td>
                      <RowSelectBox selected={sel.selected} id={r.attorney.id} onToggle={sel.toggle} />
                    </Td>
                  ) : null}
                  <Td>
                    <Link href={`/verification/trust/${r.attorney.id}`} className="font-medium text-heading hover:underline">
                      {attorneyName(r.attorney)}
                    </Link>
                    <div className="text-xs text-faint">@{r.attorney.username}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <BadgeStatusChip status={r.badgeStatus} />
                      {r.badge ? <Badge tone="info">галочка</Badge> : null}
                    </div>
                    {r.documentsRequestedAt ? <div className="mt-1 text-xs text-muted">запрошены {formatDateTime(r.documentsRequestedAt)}</div> : null}
                  </Td>
                  <Td>
                    <TrustLevelChip level={r.level} />
                  </Td>
                  <Td className="text-xs">{r.missing.length ? missingText(r.missing) : <span className="text-muted">всё пройдено</span>}</Td>
                  <Td>
                    {r.holds.payments || r.holds.bids ? (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {r.holds.payments ? <Badge tone="danger">платежи: {HOLD_RU[r.holds.payments] ?? r.holds.payments}</Badge> : null}
                        {r.holds.bids ? <Badge tone="danger">ставки: {HOLD_RU[r.holds.bids] ?? r.holds.bids}</Badge> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">нет</span>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {r.staffClearedBy ? (
                      <>
                        <div className="text-ink">{staffName(r.staffClearedBy)}</div>
                        <div className="text-muted">{formatDateTime(r.staffClearedAt)}</div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className={r.complaintsTotal > 0 ? 'font-medium text-warning' : 'text-muted'}>{r.complaintsTotal}</Td>
                  {canManage ? (
                    <Td>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="w-36" loading={busy} disabled={setStatusM.isPending} onClick={() => setStatusM.mutate(r)}>
                          Сменить статус
                        </Button>
                      </div>
                    </Td>
                  ) : null}
                </MotionRow>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}
