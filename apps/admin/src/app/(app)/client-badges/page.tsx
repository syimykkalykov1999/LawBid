'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Badge, type Tone } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { VerifiedBadge } from '@/components/verified-badge';
import { api, errorText } from '@/lib/api/client';
import { can } from '@/lib/rbac';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

type Status = '' | 'pending' | 'approved' | 'rejected' | 'revoked';
type Sub = '' | 'none' | 'active' | 'past_due' | 'canceled' | 'comped';

const STATUS_RU: Record<string, { text: string; tone: Tone }> = {
  pending: { text: 'Ждёт проверки', tone: 'warning' },
  approved: { text: 'Одобрена', tone: 'success' },
  rejected: { text: 'Отклонена', tone: 'danger' },
  revoked: { text: 'Снята', tone: 'neutral' },
};
const SUB_RU: Record<string, string> = {
  none: 'нет подписки',
  active: 'оплачена',
  past_due: 'долг по оплате',
  canceled: 'отменена',
  comped: 'бесплатно (подарок)',
};

/** Owner 2026-10-02: paid gold badge for clients — application queue. */
export default function ClientBadgesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canManage = me.data ? can(me.data, 'verification', 'manage') : false;
  const { ask, dialog } = useReason();
  const [status, setStatus] = useState<Status>('pending');
  const [sub, setSub] = useState<Sub>('');
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 300);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['client-badges', status, sub, search],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/client-badges', {
          params: {
            query: {
              status: status || undefined,
              subStatus: sub || undefined,
              q: search || undefined,
              cursor: pageParam,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const pendingRows = rows.filter((r) => r.status === 'pending');
  const allPicked = pendingRows.length > 0 && pendingRows.every((r) => picked.has(r.id));

  const refresh = () => {
    setPicked(new Set());
    void qc.invalidateQueries({ queryKey: ['client-badges'] });
  };
  const report = (res: { done: string[]; skipped: { id: string; reason: string }[] }, verb: string) => {
    toast.success(
      res.skipped.length
        ? `${verb}: ${res.done.length}, пропущено: ${res.skipped.length}`
        : `${verb}: ${res.done.length}`,
    );
    refresh();
  };

  const bulk = useMutation({
    mutationFn: async (kind: 'approve' | 'approve-free' | 'reject') => {
      const ids = [...picked];
      if (kind === 'reject') {
        const a = await ask({
          title: `Отклонить заявки: ${ids.length}`,
          description: 'Одна причина для всех. Клиенты увидят её в приложении.',
          label: 'Причина',
          min: 3,
          confirm: 'Отклонить',
          danger: true,
        });
        if (!a) return;
        const { data } = await api.POST('/admin/client-badges/bulk-reject', { body: { ids, reason: a.text } });
        report(data!.data, 'Отклонено');
      } else {
        const free = kind === 'approve-free';
        const msg = free
          ? `Выдать галочку бесплатно (${ids.length})? Без подписки $10 в месяц.`
          : `Одобрить заявки (${ids.length})? Клиенты получат ссылку на оплату.`;
        if (!window.confirm(msg)) return;
        const { data } = await api.POST('/admin/client-badges/bulk-approve', { body: { ids, free } });
        report(data!.data, free ? 'Выдано бесплатно' : 'Одобрено');
      }
    },
    onError: (e) => toast.error(e),
  });

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        eyebrow="Люди"
        title="Галочки клиентов"
        subtitle="Золотая галочка за $10 в месяц: клиент присылает документы, вы одобряете, он оплачивает. Цена — в Настройках (verification.client_badge_cents)."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Status>
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPicked(new Set());
          }}
          items={[
            { value: 'pending', label: 'Ждут проверки' },
            { value: 'approved', label: 'Одобренные' },
            { value: 'rejected', label: 'Отклонённые' },
            { value: 'revoked', label: 'Снятые' },
            { value: '', label: 'Все' },
          ]}
        />
        <Select
          aria-label="Подписка"
          className="w-52"
          value={sub}
          onChange={(e) => {
            setSub(e.target.value as Sub);
            setPicked(new Set());
          }}
        >
          <option value="">Подписка: любая</option>
          {Object.entries(SUB_RU).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Поиск"
          className="w-60"
          placeholder="Имя или @username"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {canManage && picked.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
          <span className="text-sm text-ink">Выбрано: {picked.size}</span>
          <Button size="sm" loading={bulk.isPending} onClick={() => bulk.mutate('approve')}>
            Одобрить
          </Button>
          <Button size="sm" variant="gold" loading={bulk.isPending} onClick={() => bulk.mutate('approve-free')}>
            Выдать бесплатно
          </Button>
          <Button size="sm" variant="danger-soft" loading={bulk.isPending} onClick={() => bulk.mutate('reject')}>
            Отклонить
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Снять выбор
          </Button>
        </div>
      ) : null}

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              {canManage ? (
                <input
                  type="checkbox"
                  aria-label="Выбрать все ожидающие"
                  checked={allPicked}
                  disabled={pendingRows.length === 0}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(pendingRows.map((r) => r.id)))}
                />
              ) : null}
            </Th>
            <Th>Клиент</Th>
            <Th>Заявка</Th>
            <Th>Подписка</Th>
            <Th>Документы</Th>
            <Th>Подана</Th>
          </tr>
        </thead>
        <tbody>
          {list.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>Заявок нет.</TableEmpty>
          ) : (
            rows.map((r) => {
              const st = STATUS_RU[r.status] ?? { text: r.status, tone: 'neutral' as Tone };
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpenId(r.id)}>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {canManage && r.status === 'pending' ? (
                      <input
                        type="checkbox"
                        aria-label="Выбрать"
                        checked={picked.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    ) : null}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 font-medium text-heading">
                      {r.displayName || (r.username ? `@${r.username}` : r.userId.slice(0, 8))}
                      {r.badgeActive ? <VerifiedBadge kind="client" /> : null}
                    </span>
                    {r.username ? <div className="text-xs text-faint">@{r.username}</div> : null}
                  </Td>
                  <Td>
                    <Badge tone={st.tone} dot>
                      {st.text}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{SUB_RU[r.subStatus] ?? r.subStatus}</Td>
                  <Td className="tabular-nums">{r.documentsCount}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.submittedAt)}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      <MoreButton show={list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />

      {openId ? (
        <DetailDialog
          id={openId}
          canManage={canManage}
          ask={ask}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      ) : null}
      {dialog}
    </>
  );
}

function DetailDialog({
  id,
  canManage,
  ask,
  onClose,
  onChanged,
}: {
  id: string;
  canManage: boolean;
  ask: ReturnType<typeof useReason>['ask'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const q = useQuery({
    queryKey: ['client-badge', id],
    queryFn: async () => (await api.GET('/admin/client-badges/{id}', { params: { path: { id } } })).data!.data,
  });
  const d = q.data;

  const act = useMutation({
    mutationFn: async (kind: 'approve' | 'approve-free' | 'reject' | 'revoke') => {
      const path = { params: { path: { id } } };
      if (kind === 'approve' || kind === 'approve-free') {
        await api.POST('/admin/client-badges/{id}/approve', { ...path, body: { free: kind === 'approve-free' } });
        toast.success(kind === 'approve' ? 'Одобрено, клиент получит ссылку на оплату' : 'Галочка выдана бесплатно');
      } else {
        const a = await ask(
          kind === 'reject'
            ? { title: 'Отклонить заявку', description: 'Причину увидит клиент.', label: 'Причина', min: 3, confirm: 'Отклонить', danger: true }
            : { title: 'Снять галочку', description: 'Галочка исчезнет сразу, подписка остановится.', label: 'Причина', min: 3, confirm: 'Снять', danger: true },
        );
        if (!a) return;
        await api.POST(kind === 'reject' ? '/admin/client-badges/{id}/reject' : '/admin/client-badges/{id}/revoke', {
          ...path,
          body: { reason: a.text },
        });
        toast.success(kind === 'reject' ? 'Заявка отклонена' : 'Галочка снята');
      }
      onChanged();
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog open onClose={onClose} wide title={d?.displayName || (d?.username ? `@${d.username}` : 'Заявка')}>
      {q.error ? <ErrorNote text={errorText(q.error)} /> : null}
      {!d ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={STATUS_RU[d.status]?.tone ?? 'neutral'} dot>
              {STATUS_RU[d.status]?.text ?? d.status}
            </Badge>
            <span className="text-muted">Подписка: {SUB_RU[d.subStatus] ?? d.subStatus}</span>
            {d.badgeActive ? <VerifiedBadge kind="client" size={18} /> : null}
            {d.currentPeriodEnd ? (
              <span className="text-muted">
                до {formatDateTime(d.currentPeriodEnd)}
                {d.cancelAtPeriodEnd ? ' (не продлится)' : ''}
              </span>
            ) : null}
          </div>
          {d.note ? <p className="text-sm text-ink">Комментарий клиента: {d.note}</p> : null}
          {d.rejectReason ? <p className="text-sm text-danger">Причина отказа: {d.rejectReason}</p> : null}
          {d.revokeReason ? <p className="text-sm text-danger">Причина снятия: {d.revokeReason}</p> : null}
          <div>
            <div className="mb-2 text-sm font-medium text-heading">Документы ({d.documents.length})</div>
            {d.documents.length === 0 ? (
              <p className="text-sm text-muted">Файлов нет.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.documents.map((f, i) =>
                  f.url ? (
                    <a
                      key={f.fileId}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block overflow-hidden rounded-[var(--radius-md)] border border-line"
                    >
                      {/* short-lived signed link, so a plain img */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={`Документ ${i + 1}`} className="h-40 w-full object-cover" />
                    </a>
                  ) : (
                    <div key={f.fileId} className="rounded-[var(--radius-md)] border border-line p-3 text-xs text-muted">
                      Документ {i + 1}: ссылка недоступна
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
          {canManage ? (
            <div className="flex flex-wrap justify-end gap-2">
              {d.status === 'pending' ? (
                <>
                  <Button variant="danger-soft" loading={act.isPending} onClick={() => act.mutate('reject')}>
                    Отклонить
                  </Button>
                  <Button variant="gold" loading={act.isPending} onClick={() => act.mutate('approve-free')}>
                    Выдать бесплатно
                  </Button>
                  <Button loading={act.isPending} onClick={() => act.mutate('approve')}>
                    Одобрить
                  </Button>
                </>
              ) : null}
              {d.status === 'approved' ? (
                <Button variant="danger" loading={act.isPending} onClick={() => act.mutate('revoke')}>
                  Снять галочку
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
