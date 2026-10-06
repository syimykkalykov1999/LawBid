'use client';

import { Scales } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { LoadMore } from '@/components/billing/shared';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, type Tone } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { label, STATUS_LABEL, TARGET_TYPE } from '@/lib/labels';
import { can, canOpen } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type LegalSettings = components['schemas']['LegalSettingsDto'];
type LegalTexts = components['schemas']['LegalTextsDto'];
type DmcaStatus = components['schemas']['DmcaStatus'];
type DmcaDecision = components['schemas']['DmcaDecision'];
type Tab = 'dmca' | 'texts';
type StatusTab = 'all' | DmcaStatus;

const DMCA_STATUSES: readonly DmcaStatus[] = ['new', 'removed', 'rejected', 'counter_received', 'restored'];
const DMCA_STATUS: Record<string, string> = {
  new: 'новое',
  removed: 'контент удалён',
  rejected: 'отклонено',
  counter_received: 'контруведомление',
  restored: 'восстановлено',
};
const DMCA_TONE: Record<string, Tone> = {
  new: 'warning',
  removed: 'danger',
  rejected: 'neutral',
  counter_received: 'info',
  restored: 'success',
};

/** Text limits mirror LEGAL_TEXT_LIMITS / DMCA_AGENT_LIMITS in the API. */
const TEXT_FIELDS: { key: keyof LegalTexts; label: string; hint: string; max: number; rows: number }[] = [
  { key: 'caseCreate', label: 'При создании кейса', hint: 'под полем описания: LawBid не юрфирма, адвокаты независимы, не писать конфиденциальное', max: 600, rows: 3 },
  { key: 'attorneyUnverified', label: 'Адвокат без проверки', hint: 'для уровня доверия 0 перед принятием ставки и на экране ставки', max: 600, rows: 3 },
  { key: 'supportNote', label: 'Поддержка', hint: 'на экране нового обращения: поддержка не даёт юридических советов', max: 300, rows: 2 },
  { key: 'partnerDisclosure', label: 'Партнёр: раскрытие', hint: 'на экране партнёра и перед подключением: «#ad» / «партнёрская ссылка» (FTC)', max: 600, rows: 3 },
  { key: 'partnerTerms', label: 'Партнёр: правила', hint: 'обычный текст без markdown, нумерованные правила; партнёр принимает их при подключении', max: 6000, rows: 12 },
];

/**
 * Owner 2026-10-05 (legal): Система → Право и жалобы. DMCA notices with
 * the take-down / counter-notice flow, and the legal texts the app shows
 * (disclaimers, partner rules) plus the DMCA agent and incident contact.
 */
export default function LegalSettingsPage() {
  const { data: me } = useMe();
  const canEdit = can(me, 'legal', 'manage');
  const [tab, setTab] = useState<Tab>('dmca');
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Право и жалобы"
        subtitle="Уведомления о нарушении авторских прав (DMCA), дисклеймеры в приложении, агент по DMCA и контакт при инцидентах."
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'dmca' as Tab, label: 'Жалобы DMCA' },
            { value: 'texts' as Tab, label: 'Тексты и контакты' },
          ]}
        />
      </div>
      {tab === 'dmca' ? <DmcaList canEdit={canEdit} /> : <TextsTab canEdit={canEdit} />}
    </>
  );
}

// ---- DMCA notices -------------------------------------------------------------

function DmcaList({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<StatusTab>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['dmca-notices', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/legal/dmca', { params: { query: { status: status === 'all' ? undefined : status, cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4">
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[{ value: 'all' as StatusTab, label: 'Все' }, ...DMCA_STATUSES.map((s) => ({ value: s as StatusTab, label: DMCA_STATUS[s] }))]}
        />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Scales} title="Уведомлений нет" text="Пользователи подают их через «Пожаловаться → нарушение авторских прав» или форму DMCA в разделе «О приложении»." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Получено</Th>
              <Th>Заявитель</Th>
              <Th>Объект</Th>
              <Th>Произведение</Th>
              <Th>Статус</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((n) => (
                <tr key={n.id}>
                  <Td className="text-xs text-muted">{formatDateTime(n.createdAt)}</Td>
                  <Td>
                    <div className="text-ink">{n.complainantName}</div>
                    <div className="text-xs text-muted">{n.complainantEmail}</div>
                  </Td>
                  <Td className="text-xs text-muted">
                    {n.targetType ? label(TARGET_TYPE, n.targetType) : 'ссылка'}
                    {n.infringingUrl ? <div className="max-w-[16rem] truncate text-faint">{n.infringingUrl}</div> : null}
                  </Td>
                  <Td className="max-w-[20rem] truncate text-xs text-muted">{n.workDescription}</Td>
                  <Td>
                    <Badge tone={DMCA_TONE[n.status] ?? 'neutral'} dot>
                      {DMCA_STATUS[n.status] ?? n.status}
                    </Badge>
                    {n.decidedAt ? <div className="mt-1 text-xs text-faint">{formatDateTime(n.decidedAt)}</div> : null}
                  </Td>
                  <Td>
                    <Button size="sm" variant="outline" onClick={() => setOpenId(n.id)}>
                      Открыть
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
      {openId ? <DmcaDetail id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <span className="text-muted">{k}</span>
      <span className="min-w-0 break-words text-ink">{v ?? '—'}</span>
    </div>
  );
}

function DmcaDetail({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const { confirm, dialog } = useConfirm();
  const [note, setNote] = useState('');
  const q = useQuery({
    queryKey: ['dmca-notice', id],
    queryFn: async () => (await api.GET('/admin/legal/dmca/{id}', { params: { path: { id } } })).data!.data,
  });
  const decide = useMutation({
    mutationFn: async (action: DmcaDecision) => {
      const texts: Record<DmcaDecision, { title: string; description: string; confirm: string; danger?: boolean }> = {
        remove: {
          title: 'Удалить контент по уведомлению DMCA?',
          description: 'Объект снимается с публикации, автору начисляется страйк и уходит уведомление. При достижении порога страйков аккаунт приостанавливается.',
          confirm: 'Удалить контент',
          danger: true,
        },
        reject: {
          title: 'Отклонить уведомление?',
          description: 'Контент остаётся. Отклоняйте неполные уведомления (нет произведения, подписи или заверений) и явно необоснованные.',
          confirm: 'Отклонить',
        },
        restore: {
          title: 'Восстановить контент?',
          description: 'Объект снова публикуется, страйк автора снимается. По закону контент восстанавливают через 10–14 рабочих дней после контруведомления, если заявитель не сообщил о подаче иска.',
          confirm: 'Восстановить',
        },
      };
      const ok = await confirm(texts[action]);
      if (!ok) return null;
      return (await api.POST('/admin/legal/dmca/{id}/decide', { params: { path: { id } }, body: { action, note: note.trim() || null } })).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(`Статус: ${DMCA_STATUS[r.status] ?? r.status}`);
      void qc.invalidateQueries({ queryKey: ['dmca-notices'] });
      void qc.invalidateQueries({ queryKey: ['dmca-notice', id] });
    },
    onError: (e) => toast.error(e),
  });
  const d = q.data;
  const n = d?.notice;
  const t = d?.target;
  const author = t?.author ?? null;
  const canSeeUsers = canOpen(me, '/users');
  const userLink = (uid: string | null | undefined) =>
    uid ? (
      canSeeUsers ? (
        <Link href={`/users/${uid}`} className="font-mono text-xs text-gold-600 underline-offset-2 hover:underline">
          {uid.slice(0, 8)}
        </Link>
      ) : (
        <span className="font-mono text-xs">{uid.slice(0, 8)}</span>
      )
    ) : (
      '—'
    );

  return (
    <Dialog open onClose={onClose} eyebrow="DMCA" title={n ? `Уведомление от ${n.complainantName}` : 'Уведомление'} wide>
      {dialog}
      {q.isPending ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : q.error || !n || !d ? (
        <ErrorNote text={q.error ? errorText(q.error) : 'Уведомление не найдено.'} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={DMCA_TONE[n.status] ?? 'neutral'} dot>
              {DMCA_STATUS[n.status] ?? n.status}
            </Badge>
            <span className="text-xs text-muted">получено {formatDateTime(n.createdAt)}</span>
            {n.decidedAt ? <span className="text-xs text-muted">· решение {formatDateTime(n.decidedAt)}</span> : null}
            {n.reportId ? <span className="text-xs text-faint">· жалоба в очереди модерации</span> : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="space-y-2 p-4">
              <h4 className="text-sm font-medium text-heading">Заявитель</h4>
              <Row k="Имя" v={n.complainantName} />
              <Row k="Email" v={n.complainantEmail} />
              <Row k="Адрес" v={n.complainantAddress} />
              <Row k="Телефон" v={n.complainantPhone} />
              <Row k="Подпись" v={n.signature} />
              <Row k="Заверения" v={n.goodFaith && n.accuracySworn ? 'добросовестность и точность под страхом лжесвидетельства — да' : 'неполные'} />
              <Row k="Подал из аккаунта" v={userLink(n.submittedByUserId)} />
            </Card>
            <Card className="space-y-2 p-4">
              <h4 className="text-sm font-medium text-heading">Объект</h4>
              {t ? (
                <>
                  <Row
                    k="Тип"
                    v={
                      <Link href={`/moderation/${t.targetType}/${t.targetId}`} className="text-gold-600 underline-offset-2 hover:underline">
                        {label(TARGET_TYPE, t.targetType)}
                      </Link>
                    }
                  />
                  <Row k="Статус объекта" v={t.status ?? '—'} />
                  <Row
                    k="Автор"
                    v={
                      author ? (
                        <>
                          {[author.firstName, author.lastName].filter(Boolean).join(' ') || author.username || author.id.slice(0, 8)}{' '}
                          <span className="text-xs text-muted">· {label(STATUS_LABEL, author.status)}</span>{' '}
                          {userLink(author.id)}
                        </>
                      ) : (
                        userLink(n.authorUserId)
                      )
                    }
                  />
                  <Row
                    k="Страйки автора"
                    v={
                      d.authorStrikes == null
                        ? '—'
                        : `${d.authorStrikes}${d.strikesToSuspend > 0 ? ` из ${d.strikesToSuspend} до приостановки` : ' (автоприостановка выключена)'}`
                    }
                  />
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm text-ink">{t.text ?? 'Без текста'}</pre>
                </>
              ) : (
                <>
                  <Row k="Ссылка" v={n.infringingUrl} />
                  <p className="text-xs text-muted">
                    {n.targetType ? 'Объект уже не найден в приложении.' : 'Уведомление по ссылке: объекта в LawBid нет, удалять нечего — ответьте заявителю по email.'}
                  </p>
                  <Row k="Страйки автора" v={d.authorStrikes == null ? '—' : String(d.authorStrikes)} />
                </>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <h4 className="text-sm font-medium text-heading">Произведение и нарушение</h4>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm text-ink">{n.workDescription}</pre>
          </Card>

          {n.counter ? (
            <Card className="space-y-2 p-4">
              <h4 className="text-sm font-medium text-heading">Контруведомление автора · {formatDateTime(n.counter.submittedAt)}</h4>
              <Row k="Имя" v={n.counter.name} />
              <Row k="Адрес" v={n.counter.address} />
              <Row k="Email" v={n.counter.email} />
              <Row k="Телефон" v={n.counter.phone} />
              <Row k="Подпись" v={n.counter.signature} />
              <Row k="Заверения" v={n.counter.consentJurisdiction && n.counter.sworn ? 'согласие на юрисдикцию и присяга — да' : 'неполные'} />
              <p className="text-xs text-muted">
                Перешлите контруведомление заявителю. По закону контент восстанавливают через 10–14 рабочих дней после контруведомления, если заявитель не сообщил о подаче иска.
              </p>
            </Card>
          ) : null}

          {n.decisionNote ? <Row k="Заметка к решению" v={n.decisionNote} /> : null}

          {canEdit ? (
            <div className="space-y-3">
              <Field label="Заметка к решению" htmlFor="dmca-note" hint="необязательно, до 1000 символов; видна только в админке">
                <Textarea id="dmca-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Закрыть
                </Button>
                {n.status === 'new' ? (
                  <>
                    <Button variant="outline" loading={decide.isPending} onClick={() => decide.mutate('reject')}>
                      Отклонить
                    </Button>
                    <Button variant="danger" loading={decide.isPending} disabled={!t} title={t ? undefined : 'Объекта в приложении нет — удалять нечего'} onClick={() => decide.mutate('remove')}>
                      Удалить контент
                    </Button>
                  </>
                ) : null}
                {n.status === 'removed' || n.status === 'counter_received' ? (
                  <Button variant="gold" loading={decide.isPending} onClick={() => decide.mutate('restore')}>
                    Восстановить
                  </Button>
                ) : null}
              </div>
              {n.status === 'removed' || n.status === 'counter_received' ? (
                <p className="text-right text-xs text-faint">По закону контент восстанавливают через 10–14 рабочих дней после контруведомления, если заявитель не сообщил о подаче иска.</p>
              ) : null}
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---- texts and contacts ------------------------------------------------------

function TextsTab({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ['legal-settings'],
    queryFn: async () => (await api.GET('/admin/legal/settings')).data!.data,
  });
  if (q.isPending) return <Skeleton className="h-96 rounded-[var(--radius-lg)]" />;
  if (q.error || !q.data) return <ErrorNote text={q.error ? errorText(q.error) : 'Не удалось загрузить настройки'} />;
  return <TextsForm key={JSON.stringify(q.data)} initial={q.data} canEdit={canEdit} />;
}

function TextsForm({ initial, canEdit }: { initial: LegalSettings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [agent, setAgent] = useState(initial.dmcaAgent);
  const [incident, setIncident] = useState(initial.incidentContact);
  const [strikes, setStrikes] = useState(String(initial.dmcaStrikesToSuspend));
  const [texts, setTexts] = useState(initial.texts);
  const valid = TEXT_FIELDS.every((f) => texts.en[f.key].length <= f.max && texts.ru[f.key].length <= f.max);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PUT('/admin/legal/settings', {
          body: {
            dmcaAgent: { name: agent.name.trim(), email: agent.email.trim(), address: agent.address.trim() },
            incidentContact: { email: incident.email.trim(), phone: incident.phone.trim() },
            dmcaStrikesToSuspend: Number(strikes),
            texts,
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Настройки сохранены');
      void qc.invalidateQueries({ queryKey: ['legal-settings'] });
    },
    onError: (e) => toast.error(e),
  });
  const setText = (lang: 'en' | 'ru', key: keyof LegalTexts, value: string) => setTexts((t) => ({ ...t, [lang]: { ...t[lang], [key]: value } }));

  return (
    <>
      <Card className="p-5">
        <h3 className="font-medium text-heading">Агент по DMCA</h3>
        <p className="mt-1 text-sm text-muted">
          Зарегистрируйте агента в Copyright Office: dmca.copyright.gov — ~$6, 15 минут; пока поле пустое, в приложении показывается заглушка. Без зарегистрированного агента нет защиты «безопасной гавани» (§512).
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Имя / должность агента" htmlFor="la-name">
            <Input id="la-name" value={agent.name} disabled={!canEdit} maxLength={120} onChange={(e) => setAgent({ ...agent, name: e.target.value })} placeholder="DMCA Agent, LawBid LLC" />
          </Field>
          <Field label="Email агента" htmlFor="la-email">
            <Input id="la-email" type="email" value={agent.email} disabled={!canEdit} maxLength={254} onChange={(e) => setAgent({ ...agent, email: e.target.value })} placeholder="dmca@lawbid.dev" />
          </Field>
          <Field label="Почтовый адрес агента" htmlFor="la-address">
            <Input id="la-address" value={agent.address} disabled={!canEdit} maxLength={300} onChange={(e) => setAgent({ ...agent, address: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Email при инцидентах" htmlFor="la-inc-email" hint="утечки данных, запросы госорганов, жалобы на безопасность">
            <Input id="la-inc-email" type="email" value={incident.email} disabled={!canEdit} maxLength={254} onChange={(e) => setIncident({ ...incident, email: e.target.value })} placeholder="security@lawbid.dev" />
          </Field>
          <Field label="Телефон при инцидентах" htmlFor="la-inc-phone">
            <Input id="la-inc-phone" value={incident.phone} disabled={!canEdit} maxLength={40} onChange={(e) => setIncident({ ...incident, phone: e.target.value })} placeholder="+1 312 555 0100" />
          </Field>
          <Field label="Страйков DMCA до приостановки" htmlFor="la-strikes" hint="политика повторных нарушителей (§512(i)); 0 — не приостанавливать автоматически">
            <Select id="la-strikes" value={strikes} disabled={!canEdit} onChange={(e) => setStrikes(e.target.value)}>
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={String(i)}>
                  {i === 0 ? '0 — никогда' : i}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <SectionTitle>Тексты в приложении</SectionTitle>
      <Card className="p-5">
        <p className="text-sm text-muted">Пользователь видит текст на своём языке интерфейса: русский — RU, остальные — EN. Пустой текст не показывается.</p>
        <div className="mt-4 space-y-6">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key}>
              <h4 className="text-sm font-medium text-heading">{f.label}</h4>
              <p className="mb-2 text-xs text-muted">{f.hint}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {(['ru', 'en'] as const).map((lang) => (
                  <Field key={lang} label={lang.toUpperCase()} htmlFor={`lt-${lang}-${f.key}`} hint={`${texts[lang][f.key].length} / ${f.max}`}>
                    <Textarea id={`lt-${lang}-${f.key}`} rows={f.rows} value={texts[lang][f.key]} disabled={!canEdit} maxLength={f.max} onChange={(e) => setText(lang, f.key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="mt-4 flex justify-end">
            <Button disabled={!valid || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>
              Сохранить
            </Button>
          </div>
        ) : null}
      </Card>
    </>
  );
}
