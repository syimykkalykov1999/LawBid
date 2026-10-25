'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import {
  LEGAL_EXPORT_STATUS,
  LEGAL_HOLD_TARGET,
  LEGAL_SECTIONS,
  LEGAL_SECTION_COUNT,
  LEGAL_SECTION_LABEL,
  MATCHED_BY,
  dayBound,
  formatBytes,
  hasActiveExport,
  legalJustification,
  type LegalSection,
} from '@/lib/legal-export';
import { livePoll } from '@/lib/live';
import { formatDateTime } from '@/lib/utils';

type Row = Record<string, unknown>;
interface Card360 {
  profile: Row;
  usernames: Row[];
  counts: Record<string, number>;
  conversations: Row[];
  groups: Row[];
  channels: Row[];
  sessions: Row[];
  holds: Row[];
}
type CardTab = 'overview' | 'chats' | 'groups' | 'channels' | 'devices';

const s = (v: unknown): string => (v == null ? '' : String(v));

/** Runs [fn]; on «needs a fresh 2FA/password» shows the dialog and retries once. */
export function useStepUp() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const run = (fn: () => Promise<unknown>, onError: (e: unknown) => void) => {
    fn().catch((e: unknown) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
        setPending(() => () => void fn().catch(onError));
      } else onError(e);
    });
  };
  const dialog = (
    <StepUpDialog
      open={pending !== null}
      description="Выгрузка и заморозка данных человека. Подтвердите, что это вы."
      onCancel={() => setPending(null)}
      onDone={() => {
        const p = pending;
        setPending(null);
        p?.();
      }}
    />
  );
  return { run, dialog };
}

/**
 * Owner 2026-10-20: inside a government request — find the account, read its
 * card, tick what goes out, queue the archive, download it, freeze data.
 * Mobile-first: every block is one column at 360 px.
 */
export function LegalWorkspace({
  requestId,
  requestType,
  referenceNumber,
  agency,
  closed,
}: {
  requestId: string;
  requestType: string;
  referenceNumber: string;
  agency: string;
  closed: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const stepUp = useStepUp();
  const just = legalJustification(requestType, referenceNumber, agency);
  const [term, setTerm] = useState('');
  const [searched, setSearched] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<CardTab>('overview');
  const [sections, setSections] = useState<LegalSection[]>(['profile', 'devices', 'chats']);
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [holdDate, setHoldDate] = useState('');
  const [holdType, setHoldType] = useState<'user' | 'case' | 'conversation' | 'group'>('case');
  const [holdId, setHoldId] = useState('');
  const [custodyOf, setCustodyOf] = useState<string | null>(null);

  const hits = useQuery({
    queryKey: ['legal-lookup', requestId, searched],
    enabled: searched.length >= 3,
    queryFn: async () =>
      (
        await api.GET('/admin/data-requests/legal/lookup', {
          params: { query: { q: searched }, header: { 'X-Justification': just } },
        })
      ).data!.data,
  });
  const card = useQuery({
    queryKey: ['legal-card', requestId, userId],
    enabled: !!userId,
    queryFn: async () =>
      (
        await api.GET('/admin/data-requests/legal/users/{userId}', {
          params: { path: { userId: userId! }, header: { 'X-Justification': just } },
        })
      ).data!.data as unknown as Card360,
  });
  const exportsQ = useQuery({
    queryKey: ['legal-exports', requestId],
    queryFn: async () =>
      (await api.GET('/admin/data-requests/legal/requests/{requestId}/exports', { params: { path: { requestId } } })).data!.data,
    // The worker builds one archive a minute; the panel's polling policy
    // (lib/live.ts) is one refresh a minute.
    refetchInterval: livePoll(),
  });
  const holdsQ = useQuery({
    queryKey: ['legal-holds', requestId],
    queryFn: async () =>
      (await api.GET('/admin/data-requests/legal/requests/{requestId}/holds', { params: { path: { requestId } } })).data!.data,
  });

  const queue = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve, reject) =>
        stepUp.run(async () => {
          await api.POST('/admin/data-requests/legal/requests/{requestId}/exports', {
            params: { path: { requestId }, header: { 'X-Justification': just } },
            body: {
              userId: userId!,
              sections,
              ...(chatIds.length ? { conversationIds: chatIds } : {}),
              ...(groupIds.length ? { groupIds } : {}),
              ...(dayBound(from, false) ? { dateFrom: dayBound(from, false) } : {}),
              ...(dayBound(to, true) ? { dateTo: dayBound(to, true) } : {}),
            },
          });
          resolve();
        }, reject),
      ),
    onSuccess: () => {
      toast.success('Выгрузка поставлена в очередь');
      void qc.invalidateQueries({ queryKey: ['legal-exports', requestId] });
    },
    onError: (e) => toast.error(e),
  });
  const download = useMutation({
    mutationFn: (exportId: string) =>
      new Promise<string>((resolve, reject) =>
        stepUp.run(async () => {
          const r = await api.POST('/admin/data-requests/legal/exports/{exportId}/download', {
            params: { path: { exportId }, header: { 'X-Justification': just } },
          });
          resolve(r.data!.data.url);
        }, reject),
      ),
    onSuccess: (url) => window.location.assign(url),
    onError: (e) => toast.error(e),
  });
  const freeze = useMutation({
    mutationFn: (t: { targetType: 'user' | 'case' | 'conversation' | 'group'; targetId: string }) =>
      new Promise<void>((resolve, reject) =>
        stepUp.run(async () => {
          await api.POST('/admin/data-requests/legal/requests/{requestId}/holds', {
            params: { path: { requestId } },
            body: { ...t, ...(dayBound(holdDate, true) ? { expiresAt: dayBound(holdDate, true) } : {}) },
          });
          resolve();
        }, reject),
      ),
    onSuccess: () => {
      toast.success('Данные заморожены: автоочистка их не тронет');
      void qc.invalidateQueries({ queryKey: ['legal-holds', requestId] });
    },
    onError: (e) => toast.error(e),
  });
  const release = useMutation({
    mutationFn: (holdId: string) =>
      new Promise<void>((resolve, reject) =>
        stepUp.run(async () => {
          await api.DELETE('/admin/data-requests/legal/holds/{holdId}', { params: { path: { holdId } } });
          resolve();
        }, reject),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['legal-holds', requestId] }),
    onError: (e) => toast.error(e),
  });

  const custody = useQuery({
    queryKey: ['legal-custody', custodyOf],
    enabled: !!custodyOf,
    queryFn: async () =>
      (await api.GET('/admin/data-requests/legal/exports/{exportId}/custody', { params: { path: { exportId: custodyOf! } } })).data!.data,
  });
  const c = card.data;
  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section className="mt-6 space-y-4">
      {stepUp.dialog}
      <Card>
        <CardHeader>
          <CardTitle>Найти аккаунт</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              setSearched(term.trim());
            }}
          >
            <Input
              aria-label="Поиск аккаунта"
              placeholder="Телефон, e-mail, @юзернейм, имя или id"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <Button type="submit" loading={hits.isFetching} disabled={term.trim().length < 3}>
              Найти
            </Button>
          </form>
          {hits.error ? <p className="text-sm text-danger">{errorText(hits.error)}</p> : null}
          {hits.data?.length === 0 ? <p className="text-sm text-muted">Никого не нашли</p> : null}
          <ul className="space-y-2">
            {hits.data?.map((h) => (
              <li key={h.userId}>
                <button
                  type="button"
                  onClick={() => {
                    setUserId(h.userId);
                    setTab('overview');
                    setChatIds([]);
                    setGroupIds([]);
                  }}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left text-sm transition-colors hover:border-gold/60 ${userId === h.userId ? 'border-gold' : 'border-line'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{h.name ?? 'Без имени'}</span>
                    <Badge>{h.role ?? 'нет роли'}</Badge>
                    <Badge tone={h.status === 'active' ? 'success' : 'warning'}>{h.status}</Badge>
                    <span className="text-xs text-muted">{MATCHED_BY[h.matchedBy] ?? h.matchedBy}</span>
                  </div>
                  <div className="mt-1 break-all text-xs text-muted">
                    {[h.phone, h.email, h.username ? `@${h.username}` : null].filter(Boolean).join(' · ')}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {userId ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Карточка аккаунта{c ? `: ${s(c.profile.name) || s(c.profile.id)}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {card.error ? <p className="text-danger">{errorText(card.error)}</p> : null}
            {card.isPending ? <p className="text-muted">Загрузка…</p> : null}
            {c ? (
              <>
                <Tabs<CardTab>
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: 'overview', label: 'Обзор' },
                    { value: 'chats', label: 'Чаты', count: c.conversations.length },
                    { value: 'groups', label: 'Группы', count: c.groups.length },
                    { value: 'channels', label: 'Каналы', count: c.channels.length },
                    { value: 'devices', label: 'Входы', count: c.sessions.length },
                  ]}
                />
                {tab === 'overview' ? (
                  <div className="space-y-3">
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {(
                        [
                          ['Телефон', c.profile.phone],
                          ['E-mail', c.profile.email],
                          ['Роль', c.profile.role],
                          ['Статус', c.profile.status],
                          ['Регистрация', formatDateTime(s(c.profile.registeredAt))],
                          ['Последняя активность', formatDateTime(s(c.profile.lastActiveAt))],
                          ['Удаление запрошено', c.profile.deletionRequestedAt ? formatDateTime(s(c.profile.deletionRequestedAt)) : '—'],
                        ] as [string, unknown][]
                      ).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-line py-1">
                          <dt className="text-muted">{k}</dt>
                          <dd className="break-all text-right text-ink">{s(v) || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                    <div>
                      <div className="mb-1 text-[13px] font-medium text-ink">Юзернеймы (с историей)</div>
                      {c.usernames.length === 0 ? <p className="text-muted">Нет</p> : null}
                      <ul className="space-y-0.5">
                        {c.usernames.map((u, i) => (
                          <li key={i} className="text-xs text-muted">
                            @{s(u.username)} · {u.current ? 'сейчас' : `освобождён ${formatDateTime(s(u.releasedAt))}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="hold-date">Заморозить человека до (пусто — бессрочно)</Label>
                        <Input id="hold-date" type="date" value={holdDate} onChange={(e) => setHoldDate(e.target.value)} />
                      </div>
                      <Button
                        variant="outline"
                        loading={freeze.isPending}
                        disabled={closed}
                        onClick={() => freeze.mutate({ targetType: 'user', targetId: userId })}
                      >
                        Заморозить данные
                      </Button>
                    </div>
                  </div>
                ) : null}
                {tab === 'chats' ? (
                  <PickList
                    empty="Личных чатов нет"
                    hint="Ничего не отмечено — выгрузятся все чаты человека."
                    rows={c.conversations.map((r) => ({
                      id: s(r.id),
                      title: s(r.with) || s(r.withUserId),
                      sub: `${s(r.kind)} · ${r.lastMessageAt ? formatDateTime(s(r.lastMessageAt)) : 'без сообщений'}`,
                    }))}
                    picked={chatIds}
                    onToggle={(id) => toggle(chatIds, id, setChatIds)}
                    onFreeze={(id) => freeze.mutate({ targetType: 'conversation', targetId: id })}
                    freezeDisabled={closed}
                  />
                ) : null}
                {tab === 'groups' ? (
                  <PickList
                    empty="Групп нет"
                    hint="Ничего не отмечено — выгрузятся все группы человека."
                    rows={c.groups.map((r) => ({
                      id: s(r.id),
                      title: s(r.title),
                      sub: `${s(r.role)} · участников ${s(r.members)}${r.leftAt ? ' · вышел' : ''}${r.deletedAt ? ' · удалена' : ''}`,
                    }))}
                    picked={groupIds}
                    onToggle={(id) => toggle(groupIds, id, setGroupIds)}
                    onFreeze={(id) => freeze.mutate({ targetType: 'group', targetId: id })}
                    freezeDisabled={closed}
                  />
                ) : null}
                {tab === 'channels' ? (
                  <ul className="space-y-1">
                    {c.channels.length === 0 ? <li className="text-muted">Каналов нет</li> : null}
                    {c.channels.map((r) => (
                      <li key={s(r.id)} className="rounded-[var(--radius-md)] border border-line p-2">
                        <div className="text-ink">{s(r.title)} <span className="text-muted">@{s(r.username)}</span></div>
                        <div className="text-xs text-muted">{r.owner ? 'владелец' : 'админ'} · постов {s(r.posts)}{r.deletedAt ? ' · удалён' : ''}</div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === 'devices' ? (
                  <ul className="space-y-1">
                    {c.sessions.length === 0 ? <li className="text-muted">Сессий нет</li> : null}
                    {c.sessions.map((r) => (
                      <li key={s(r.id)} className="rounded-[var(--radius-md)] border border-line p-2 text-xs">
                        <div className="text-ink">{s(r.deviceName) || s(r.device_name) || s(r.platform) || 'устройство'} · {s(r.platform)} {s(r.app_version)}</div>
                        <div className="break-all text-muted">
                          IP {s(r.ip) || '—'} · вход {formatDateTime(s(r.created_at))}
                          {r.revoked_at ? ` · закрыта ${formatDateTime(s(r.revoked_at))}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="space-y-3 rounded-[var(--radius-md)] border border-line p-3">
                  <div className="text-[13px] font-medium text-ink">Что выгрузить</div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {LEGAL_SECTIONS.map((v) => {
                      const key = LEGAL_SECTION_COUNT[v];
                      return (
                        <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                          <input type="checkbox" checked={sections.includes(v)} onChange={() => toggle(sections, v, setSections)} />
                          {LEGAL_SECTION_LABEL[v]}
                          {key ? <span className="text-xs text-muted">({c.counts[key] ?? 0})</span> : null}
                        </label>
                      );
                    })}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="d-from">С даты</Label>
                      <Input id="d-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="d-to">По дату</Label>
                      <Input id="d-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted">
                    Чатов выбрано: {chatIds.length || 'все'} · групп: {groupIds.length || 'все'}. Телефоны и почты не скрываются.
                    Фото и видео идут ссылками на 7 дней.
                  </p>
                  <Button loading={queue.isPending} disabled={closed || sections.length === 0} onClick={() => queue.mutate()}>
                    Поставить выгрузку в очередь
                  </Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Выгрузки по запросу</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {hasActiveExport(exportsQ.data) ? <p className="text-xs text-muted">Сборка идёт в фоне, список обновляется раз в минуту.</p> : null}
          {exportsQ.data?.length === 0 ? <p className="text-muted">Выгрузок ещё не было</p> : null}
          {exportsQ.data?.map((x) => (
            <div key={x.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={x.status === 'ready' ? 'success' : x.status === 'failed' ? 'danger' : 'neutral'} dot>
                  {LEGAL_EXPORT_STATUS[x.status] ?? x.status}
                </Badge>
                <span className="text-xs text-muted">{formatDateTime(x.createdAt)}</span>
                <span className="text-xs text-muted">{formatBytes(x.sizeBytes)}</span>
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-muted">
                человек {x.subjectUserId}
                {x.sha256 ? ` · SHA-256 ${x.sha256}` : ''}
              </div>
              {x.manifestSha256 ? (
                <div className="mt-1 break-all font-mono text-[11px] text-muted">
                  Манифест SHA-256 {x.manifestSha256} · подпись ({x.signatureAlg === 'ed25519' ? 'ed25519, проверяется открытым ключом' : 'HMAC, только для LawBid'})
                </div>
              ) : null}
              <div className="text-xs text-muted">
                Скачано раз: {x.downloadCount}
                {x.lastDownloadedAt ? ` · последний ${formatDateTime(x.lastDownloadedAt)}` : ''}
              </div>
              <Button className="mt-1" size="sm" variant="ghost" onClick={() => setCustodyOf(custodyOf === x.id ? null : x.id)}>
                Кто и когда трогал
              </Button>
              {custodyOf === x.id ? (
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {custody.data?.map((e, i) => (
                    <li key={i} className="break-all">
                      {formatDateTime(e.at)} · {e.action} · админ {e.adminId}
                      {e.ip ? ` · IP ${e.ip}` : ''}
                    </li>
                  ))}
                  {custody.data?.length === 0 ? <li>Записей нет</li> : null}
                </ul>
              ) : null}
              {x.expiresAt && x.status === 'ready' ? <div className="text-xs text-muted">Файл удалится {formatDateTime(x.expiresAt)}</div> : null}
              {x.error ? <div className="text-xs text-danger">{x.error}</div> : null}
              {x.status === 'ready' ? (
                <Button className="mt-2" size="sm" loading={download.isPending && download.variables === x.id} onClick={() => download.mutate(x.id)}>
                  Скачать ZIP
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Заморозка данных</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted">Удалённое хранится 90 дней и потом очищается. Замороженное не очищается, пока ты не снимешь заморозку.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Что заморозить"
              className="h-10 rounded-[var(--radius-md)] border border-line bg-surface px-2 text-sm"
              value={holdType}
              onChange={(e) => setHoldType(e.target.value as typeof holdType)}
            >
              <option value="case">кейс</option>
              <option value="user">человек</option>
              <option value="conversation">чат</option>
              <option value="group">группа</option>
            </select>
            <Input aria-label="id для заморозки" placeholder="id (uuid)" value={holdId} onChange={(e) => setHoldId(e.target.value)} />
            <Button size="sm" disabled={closed || holdId.trim().length < 32} loading={freeze.isPending} onClick={() => freeze.mutate({ targetType: holdType, targetId: holdId.trim() })}>
              Заморозить
            </Button>
          </div>
          {holdsQ.data?.length === 0 ? <p className="text-muted">Заморозок нет</p> : null}
          {holdsQ.data?.map((h) => {
            const active = !h.releasedAt && (!h.expiresAt || new Date(h.expiresAt) > new Date());
            return (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line p-2">
                <div className="min-w-0 text-xs">
                  <div className="text-ink">
                    {LEGAL_HOLD_TARGET[h.targetType] ?? h.targetType} <span className="break-all font-mono">{h.targetId}</span>
                  </div>
                  <div className="text-muted">
                    {h.releasedAt ? `снята ${formatDateTime(h.releasedAt)}` : h.expiresAt ? `до ${formatDateTime(h.expiresAt)}` : 'бессрочно'}
                  </div>
                </div>
                {active ? (
                  <Button size="sm" variant="outline" loading={release.isPending && release.variables === h.id} onClick={() => release.mutate(h.id)}>
                    Снять
                  </Button>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

function PickList({
  rows,
  picked,
  onToggle,
  onFreeze,
  freezeDisabled,
  empty,
  hint,
}: {
  rows: { id: string; title: string; sub: string }[];
  picked: string[];
  onToggle: (id: string) => void;
  onFreeze: (id: string) => void;
  freezeDisabled: boolean;
  empty: string;
  hint: string;
}) {
  if (rows.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{hint}</p>
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line p-2">
            <input type="checkbox" aria-label={r.title} checked={picked.includes(r.id)} onChange={() => onToggle(r.id)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-ink">{r.title}</div>
              <div className="truncate text-xs text-muted">{r.sub}</div>
            </div>
            <Button size="sm" variant="ghost" disabled={freezeDisabled} onClick={() => onFreeze(r.id)}>
              Заморозить
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
