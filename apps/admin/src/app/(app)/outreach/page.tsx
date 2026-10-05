'use client';

import {
  AddressBook,
  DownloadSimple,
  EnvelopeSimple,
  Phone,
  Plus,
  UploadSimple,
  UserPlus,
  UsersThree,
} from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { fadeUp, LoadMore, TonePill } from '@/components/billing/shared';
import {
  downloadLeadsCsv,
  formatPhone,
  importLeadsCsv,
  LEAD_STATUSES,
  LEAD_TONE,
  leadName,
  partnerName,
  type ImportReport,
  type LeadKind,
  type LeadStatus,
  type OutreachContext,
  type OutreachSettings,
  type OutreachTemplate,
} from '@/components/outreach/shared';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { LEAD_KIND, LEAD_SOURCE, LEAD_STATUS, TEMPLATE_KIND, usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Tab = 'leads' | 'team' | 'templates' | 'settings';
type StatusTab = 'all' | 'due' | LeadStatus;

/**
 * Outreach: a base of attorneys and clients to call and email, handed out
 * to employees (admins who are partners), each with their own partner
 * link; the owner sees who works and what it brought.
 */
export default function OutreachPage() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>('leads');
  const ctx = useQuery({
    queryKey: ['outreach-context'],
    queryFn: async () => (await api.GET('/admin/outreach/context')).data!.data,
  });
  const manager = ctx.data?.manager ?? false;
  const isSuper = me?.role === 'super_admin';

  return (
    <>
      <PageHeader
        eyebrow="Связь"
        title="Привлечение"
        subtitle={
          ctx.data?.scope
            ? `Ваши контакты и ваша ссылка (код ${ctx.data.scope.code}). Звоните, пишите, отмечайте результат: кто зарегистрируется по вашей ссылке — ваш.`
            : 'База адвокатов и клиентов для холодных звонков и писем. Раздайте контакты сотрудникам: каждый пишет со своей партнёрской ссылкой, и вы видите, кто работает и что это принесло.'
        }
      />

      {manager ? (
        <motion.div {...fadeUp(0)}>
          <Card className="mb-6 p-5">
            <h3 className="font-medium text-heading">Как это работает</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
              <li>Загрузите контакты: CSV-файл (любой экспорт с колонками email/телефон) или бесплатный открытый реестр адвокатов штата Нью-Йорк. Платные базы не нужны.</li>
              <li>
                Сотрудник — это администратор, которого вы сделали партнёром (<Link href="/partners" className="text-gold-600 underline-offset-2 hover:underline">Деньги → Партнёры</Link>) и которому включили область «Привлечение». Назначьте ему контакты — он видит только свои.
              </li>
              <li>Сотрудник звонит и отмечает результат, или отправляет письмо по шаблону: в письме его партнёрская ссылка и обязательная ссылка «отписаться». Лимит писем в день — в настройках.</li>
              <li>Кто зарегистрировался по ссылке — становится «зарегистрировался» сам; купил подписку или нанял адвоката — «оплатил», и партнёру начисляется комиссия.</li>
              <li>Во вкладке «Сотрудники» — звонки, письма, ответы, регистрации и оплаты по каждому за период.</li>
            </ol>
          </Card>
        </motion.div>
      ) : null}

      <ErrorNote text={ctx.error ? errorText(ctx.error) : null} />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'leads' as Tab, label: 'Контакты' },
            { value: 'team' as Tab, label: manager ? 'Сотрудники' : 'Мои результаты' },
            ...(manager ? [{ value: 'templates' as Tab, label: 'Шаблоны писем' }] : []),
            ...(isSuper ? [{ value: 'settings' as Tab, label: 'Настройки' }] : []),
          ]}
        />
      </div>

      {ctx.isPending ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : ctx.data ? (
        <>
          {tab === 'leads' ? <Leads ctx={ctx.data} /> : null}
          {tab === 'team' ? <Team manager={manager} /> : null}
          {tab === 'templates' && manager ? <Templates /> : null}
          {tab === 'settings' && isSuper ? <SettingsForm key={JSON.stringify(ctx.data.settings)} initial={ctx.data.settings} /> : null}
        </>
      ) : null}
    </>
  );
}

// ---- leads ------------------------------------------------------------------

function Leads({ ctx }: { ctx: OutreachContext }) {
  const manager = ctx.manager;
  const toast = useToast();
  const [status, setStatus] = useState<StatusTab>('all');
  const [kind, setKind] = useState<'' | LeadKind>('');
  const [partnerId, setPartnerId] = useState('');
  const [state, setState] = useState('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'csv' | 'registry' | 'manual'>(null);

  const filters = {
    status: status === 'all' || status === 'due' ? undefined : status,
    due: status === 'due' ? ('true' as const) : undefined,
    kind: kind || undefined,
    partnerId: partnerId && partnerId !== 'none' ? partnerId : undefined,
    assigned: partnerId === 'none' ? ('none' as const) : undefined,
    state: state.trim().toUpperCase() || undefined,
    q: q || undefined,
  };
  const list = useInfiniteQuery({
    queryKey: ['outreach-leads', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/outreach/leads', { params: { query: { ...filters, cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const cols = manager ? 7 : 6;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all' as StatusTab, label: 'Все' },
            { value: 'due' as StatusTab, label: 'Пора связаться' },
            ...LEAD_STATUSES.map((s) => ({ value: s as StatusTab, label: LEAD_STATUS[s] })),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as '' | LeadKind)} className="w-36" aria-label="Кто">
            <option value="">Все: адвокаты и клиенты</option>
            <option value="attorney">Адвокаты</option>
            <option value="client">Клиенты</option>
          </Select>
          {manager ? (
            <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-44" aria-label="Сотрудник">
              <option value="">Все сотрудники</option>
              <option value="none">Не назначены</option>
              {ctx.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {partnerName(p)}
                </option>
              ))}
            </Select>
          ) : null}
          <Input placeholder="Штат" value={state} onChange={(e) => setState(e.target.value)} className="w-20" maxLength={2} aria-label="Штат" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(draft.trim());
            }}
          >
            <Input placeholder="Имя, фирма, email, телефон" value={draft} onChange={(e) => setDraft(e.target.value)} className="w-60" />
          </form>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadLeadsCsv(filters as Record<string, string | undefined>)
                .then((n) => toast.success(`Скачан ${n}`))
                .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Ошибка выгрузки'))
            }
          >
            <DownloadSimple size={14} /> CSV
          </Button>
          {manager ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog('csv')}>
                <UploadSimple size={14} /> Импорт CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('registry')}>
                <AddressBook size={14} /> Реестр NY
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={() => setDialog('manual')}>
            <Plus size={14} /> Контакт
          </Button>
        </div>
      </div>

      {manager && selected.size > 0 ? <AssignBar ctx={ctx} ids={[...selected]} onDone={() => setSelected(new Set())} /> : null}

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState
          icon={AddressBook}
          title="Контактов пока нет"
          text={manager ? 'Загрузите CSV или возьмите адвокатов из открытого реестра Нью-Йорка.' : 'Вам ещё не назначили контакты. Можно добавить свой.'}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              {manager ? (
                <Th className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </Th>
              ) : null}
              <Th>Контакт</Th>
              <Th>Связь</Th>
              <Th>Где</Th>
              <Th>Статус</Th>
              <Th>Сотрудник</Th>
              <Th>Активность</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((l) => (
                <tr key={l.id} className={l.unsubscribed ? 'opacity-60' : undefined}>
                  {manager ? (
                    <Td>
                      <input type="checkbox" aria-label="Выбрать" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    </Td>
                  ) : null}
                  <Td>
                    <Link href={`/outreach/${l.id}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {leadName(l)}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {LEAD_KIND[l.kind]}
                      {l.company && (l.firstName || l.lastName) ? ` · ${l.company}` : ''}
                      {l.practice ? ` · ${l.practice}` : ''}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted">
                    {l.phone ? <div className="text-ink">{formatPhone(l.phone)}</div> : null}
                    {l.email ? <div className={l.unsubscribed ? 'line-through' : ''}>{l.email}</div> : null}
                    {l.unsubscribed ? <div className="text-faint">отписался от писем</div> : null}
                  </Td>
                  <Td className="text-xs text-muted">
                    {[l.city, l.stateCode].filter(Boolean).join(', ') || '—'}
                    <div className="text-faint">{LEAD_SOURCE[l.source]}</div>
                  </Td>
                  <Td>
                    <TonePill map={LEAD_STATUS} tones={LEAD_TONE} value={l.status} />
                    {l.nextActionAt ? (
                      <div className={`mt-1 text-xs ${new Date(l.nextActionAt) <= new Date() ? 'text-warning' : 'text-faint'}`}>
                        связаться {formatDateTime(l.nextActionAt)}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="text-xs text-muted">{partnerName(l.partner)}</Td>
                  <Td className="text-xs text-faint">{l.lastActivityAt ? formatDateTime(l.lastActivityAt) : 'не было'}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      <ImportCsvDialog ctx={ctx} open={dialog === 'csv'} onClose={() => setDialog(null)} />
      <RegistryDialog ctx={ctx} open={dialog === 'registry'} onClose={() => setDialog(null)} />
      <ManualLeadDialog ctx={ctx} open={dialog === 'manual'} onClose={() => setDialog(null)} />
    </>
  );
}

function AssignBar({ ctx, ids, onDone }: { ctx: OutreachContext; ids: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [partnerId, setPartnerId] = useState('');
  const assign = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/outreach/leads/assign', { body: { leadIds: ids, partnerId: partnerId || null } })).data!.data,
    onSuccess: (r) => {
      toast.success(partnerId ? `Назначено: ${r.updated}` : `Снято назначение: ${r.updated}`);
      void qc.invalidateQueries({ queryKey: ['outreach-leads'] });
      onDone();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
      <span className="text-sm text-muted">Выбрано: {ids.length}</span>
      <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-56" aria-label="Кому">
        <option value="">Снять назначение</option>
        {ctx.partners.map((p) => (
          <option key={p.id} value={p.id}>
            {partnerName(p)}
          </option>
        ))}
      </Select>
      <Button size="sm" loading={assign.isPending} onClick={() => assign.mutate()}>
        <UserPlus size={14} /> {partnerId ? 'Назначить' : 'Снять'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Отмена
      </Button>
    </Card>
  );
}

function PartnerSelect({ ctx, value, onChange, id }: { ctx: OutreachContext; value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Не назначать (раздам позже)</option>
      {ctx.partners.map((p) => (
        <option key={p.id} value={p.id}>
          {partnerName(p)}
        </option>
      ))}
    </Select>
  );
}

function ReportCard({ r }: { r: ImportReport }) {
  return (
    <Card className="bg-surface-2 p-4 text-sm">
      <div className="font-medium text-heading">{r.mode === 'dry-run' ? 'Проверка файла' : 'Импорт выполнен'}</div>
      <ul className="mt-2 space-y-1 text-muted">
        <li>Строк с контактами: {r.rows}</li>
        <li>
          {r.mode === 'dry-run' ? 'Будет добавлено' : 'Добавлено'}: <span className="text-ink">{r.created}</span>
        </li>
        <li>Уже есть в базе (email или телефон): {r.duplicates}</li>
        <li>Без email и телефона (пропущено): {r.skipped}</li>
      </ul>
      {r.columns.length ? <div className="mt-2 text-xs text-faint">Колонки: {r.columns.join(', ')}</div> : null}
      {r.problems.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-warning">
          {r.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function ImportCsvDialog({ ctx, open, onClose }: { ctx: OutreachContext; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<LeadKind>('attorney');
  const [partnerId, setPartnerId] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const run = useMutation({
    mutationFn: (mode: 'dry-run' | 'apply') => importLeadsCsv(file!, { mode, kind, partnerId: partnerId || undefined }),
    onSuccess: (r) => {
      setReport(r);
      if (r.mode === 'apply') {
        toast.success(`Добавлено контактов: ${r.created}`);
        void qc.invalidateQueries({ queryKey: ['outreach-leads'] });
      }
    },
    onError: (e) => toast.error(e),
  });
  const close = () => {
    setFile(null);
    setReport(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      eyebrow="Импорт"
      title="Контакты из CSV"
      description="Любая таблица с колонкой email и/или телефон; имя, фамилия, фирма, штат, город, практика — если есть. Заголовки на английском или русском. До 5000 строк. Сначала проверка, потом импорт."
    >
      <div className="space-y-4">
        <Field label="Файл CSV" htmlFor="oc-file">
          <Input
            id="oc-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Кто в файле" htmlFor="oc-kind">
            <Select id="oc-kind" value={kind} onChange={(e) => setKind(e.target.value as LeadKind)}>
              <option value="attorney">Адвокаты</option>
              <option value="client">Клиенты</option>
            </Select>
          </Field>
          <Field label="Назначить сотруднику" htmlFor="oc-partner">
            <PartnerSelect id="oc-partner" ctx={ctx} value={partnerId} onChange={setPartnerId} />
          </Field>
        </div>
        {report ? <ReportCard r={report} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Закрыть
          </Button>
          {report?.mode === 'dry-run' && report.created > 0 ? (
            <Button variant="gold" loading={run.isPending} onClick={() => run.mutate('apply')}>
              Импортировать {report.created}
            </Button>
          ) : report?.mode === 'apply' ? null : (
            <Button disabled={!file} loading={run.isPending} onClick={() => run.mutate('dry-run')}>
              Проверить файл
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function RegistryDialog({ ctx, open, onClose }: { ctx: OutreachContext; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [county, setCounty] = useState('');
  const [city, setCity] = useState('');
  const [admittedFrom, setAdmittedFrom] = useState('');
  const [limit, setLimit] = useState('200');
  const [offset, setOffset] = useState('0');
  const [partnerId, setPartnerId] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const body = (mode: 'dry-run' | 'apply') => ({
    state: 'NY' as const,
    county: county.trim() || null,
    city: city.trim() || null,
    admittedFrom: /^\d{4}$/.test(admittedFrom) ? Number(admittedFrom) : undefined,
    limit: Math.min(500, Math.max(1, Number(limit) || 200)),
    offset: Math.max(0, Number(offset) || 0),
    mode,
    partnerId: partnerId || null,
  });
  const run = useMutation({
    mutationFn: async (mode: 'dry-run' | 'apply') =>
      (await api.POST('/admin/outreach/leads/import-registry', { body: body(mode) })).data!.data,
    onSuccess: (r) => {
      setReport(r);
      if (r.mode === 'apply') {
        toast.success(`Добавлено контактов: ${r.created}`);
        void qc.invalidateQueries({ queryKey: ['outreach-leads'] });
      }
    },
    onError: (e) => toast.error(e),
  });
  const close = () => {
    setReport(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      eyebrow="Открытые данные"
      title="Адвокаты из реестра штата Нью-Йорк"
      description="Бесплатный открытый реестр зарегистрированных адвокатов (data.ny.gov): имя, фирма, город и телефон. Email реестр не публикует — это контакты для звонков. Берём порциями до 500; для следующей порции увеличьте «пропустить»."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Округ (county)" htmlFor="or-county" hint="например NEW YORK, KINGS, QUEENS">
            <Input id="or-county" value={county} onChange={(e) => setCounty(e.target.value)} />
          </Field>
          <Field label="Город" htmlFor="or-city">
            <Input id="or-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Допущен к практике с года" htmlFor="or-year" hint="молодые адвокаты чаще отвечают">
            <Input id="or-year" inputMode="numeric" placeholder="2015" value={admittedFrom} onChange={(e) => setAdmittedFrom(e.target.value)} />
          </Field>
          <Field label="Назначить сотруднику" htmlFor="or-partner">
            <PartnerSelect id="or-partner" ctx={ctx} value={partnerId} onChange={setPartnerId} />
          </Field>
          <Field label="Сколько взять" htmlFor="or-limit" hint="до 500">
            <Input id="or-limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
          <Field label="Пропустить" htmlFor="or-offset" hint="для следующей порции">
            <Input id="or-offset" inputMode="numeric" value={offset} onChange={(e) => setOffset(e.target.value)} />
          </Field>
        </div>
        {report ? <ReportCard r={report} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Закрыть
          </Button>
          {report?.mode === 'dry-run' && report.created > 0 ? (
            <Button variant="gold" loading={run.isPending} onClick={() => run.mutate('apply')}>
              Добавить {report.created}
            </Button>
          ) : report?.mode === 'apply' ? null : (
            <Button loading={run.isPending} onClick={() => run.mutate('dry-run')}>
              Посмотреть, что найдётся
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

const EMPTY_LEAD = { firstName: '', lastName: '', company: '', stateCode: '', city: '', practice: '', phone: '', email: '', note: '' };

function ManualLeadDialog({ ctx, open, onClose }: { ctx: OutreachContext; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<LeadKind>('attorney');
  const [f, setF] = useState(EMPTY_LEAD);
  const [partnerId, setPartnerId] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/outreach/leads', {
          body: {
            kind,
            firstName: f.firstName || null,
            lastName: f.lastName || null,
            company: f.company || null,
            stateCode: f.stateCode || null,
            city: f.city || null,
            practice: f.practice || null,
            phone: f.phone || null,
            email: f.email || null,
            note: f.note || null,
            ...(ctx.manager ? { partnerId: partnerId || null } : {}),
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Контакт добавлен');
      void qc.invalidateQueries({ queryKey: ['outreach-leads'] });
      setF(EMPTY_LEAD);
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const valid = f.phone.trim() || f.email.trim();
  return (
    <Dialog open={open} onClose={onClose} eyebrow="Вручную" title="Новый контакт" description="Нужен телефон или email — иначе связаться не с кем.">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Кто" htmlFor="ol-kind">
            <Select id="ol-kind" value={kind} onChange={(e) => setKind(e.target.value as LeadKind)}>
              <option value="attorney">Адвокат</option>
              <option value="client">Клиент</option>
            </Select>
          </Field>
          {ctx.manager ? (
            <Field label="Сотрудник" htmlFor="ol-partner">
              <PartnerSelect id="ol-partner" ctx={ctx} value={partnerId} onChange={setPartnerId} />
            </Field>
          ) : null}
          <Field label="Имя" htmlFor="ol-first">
            <Input id="ol-first" value={f.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Фамилия" htmlFor="ol-last">
            <Input id="ol-last" value={f.lastName} onChange={set('lastName')} />
          </Field>
          <Field label="Фирма" htmlFor="ol-company">
            <Input id="ol-company" value={f.company} onChange={set('company')} />
          </Field>
          <Field label="Практика" htmlFor="ol-practice">
            <Input id="ol-practice" value={f.practice} onChange={set('practice')} placeholder="family, immigration…" />
          </Field>
          <Field label="Телефон" htmlFor="ol-phone">
            <Input id="ol-phone" value={f.phone} onChange={set('phone')} placeholder="+1 212 555 0100" />
          </Field>
          <Field label="Email" htmlFor="ol-email">
            <Input id="ol-email" type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Штат" htmlFor="ol-state">
            <Input id="ol-state" value={f.stateCode} onChange={set('stateCode')} placeholder="NY" maxLength={2} />
          </Field>
          <Field label="Город" htmlFor="ol-city">
            <Input id="ol-city" value={f.city} onChange={set('city')} />
          </Field>
        </div>
        <Field label="Заметка" htmlFor="ol-note">
          <Textarea id="ol-note" rows={2} value={f.note} onChange={set('note')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            Добавить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- team ------------------------------------------------------------------

function periodStart(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function Team({ manager }: { manager: boolean }) {
  const [from, setFrom] = useState(periodStart(30));
  const [to, setTo] = useState('');
  const query = useMemo(
    () => ({
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    }),
    [from, to],
  );
  const stats = useQuery({
    queryKey: ['outreach-stats', query],
    queryFn: async () => (await api.GET('/admin/outreach/stats', { params: { query } })).data!.data,
  });
  const t = stats.data?.totals;
  const funnel = stats.data?.byStatus ?? {};
  const total = Object.values(funnel).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">Период</span>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="С" />
        <span className="text-muted">—</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="По" />
        <Button size="sm" variant="ghost" onClick={() => setFrom(periodStart(7))}>
          7 дней
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setFrom(periodStart(30))}>
          30 дней
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setFrom(periodStart(90))}>
          90 дней
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isPending || !t ? (
          <KpiSkeletons n={4} />
        ) : (
          <>
            <Kpi i={0} icon={Phone} title="Звонков" value={t.calls} hint={`ответили / заинтересованы: ${t.replied}`} />
            <Kpi i={1} icon={EnvelopeSimple} title="Писем" value={t.emails} />
            <Kpi i={2} icon={UsersThree} title="Зарегистрировались" value={t.registered} hint={`оплатили: ${t.paid}`} gold />
            <Kpi i={3} icon={AddressBook} title="Комиссии за период" value={t.commissionCents} format={(n) => usd(n)} hint={`контактов в базе: ${total}`} />
          </>
        )}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <SectionTitle>{manager ? 'Кто сколько сделал' : 'Ваши результаты'}</SectionTitle>
      <Table>
        <thead>
          <tr>
            <Th>Сотрудник</Th>
            <Th>Контактов</Th>
            <Th>Звонков</Th>
            <Th>Писем</Th>
            <Th>Ответили</Th>
            <Th>Регистраций</Th>
            <Th>Оплат</Th>
            <Th>Комиссии</Th>
            <Th>Последняя активность</Th>
          </tr>
        </thead>
        <tbody>
          {stats.isPending ? (
            <TableEmpty colSpan={9} loading />
          ) : !stats.data || stats.data.partners.length === 0 ? (
            <TableEmpty colSpan={9}>За период активности не было.</TableEmpty>
          ) : (
            <>
              {stats.data.partners.map((p) => {
                const idle = p.calls + p.emails === 0 && p.leads > 0 && !!p.partner;
                return (
                  <tr key={p.partner?.id ?? 'none'} className={idle ? 'bg-danger-soft/30' : undefined}>
                    <Td className="font-medium text-ink">
                      {p.partner ? (
                        <Link href={`/partners/${p.partner.id}`} className="underline-offset-2 hover:text-gold-600 hover:underline">
                          {partnerName(p.partner)}
                        </Link>
                      ) : (
                        <span className="text-muted">не назначены</span>
                      )}
                      {idle ? <div className="text-xs text-danger">не работал за период</div> : null}
                    </Td>
                    <Td>{p.leads}</Td>
                    <Td>{p.calls}</Td>
                    <Td>{p.emails}</Td>
                    <Td>{p.replied}</Td>
                    <Td>{p.registered}</Td>
                    <Td className="text-ink">{p.paid}</Td>
                    <Td>{usd(p.commissionCents)}</Td>
                    <Td className="text-xs text-faint">{p.lastActivityAt ? formatDateTime(p.lastActivityAt) : '—'}</Td>
                  </tr>
                );
              })}
              {manager && t ? (
                <tr className="font-medium">
                  <Td className="text-ink">Итого</Td>
                  <Td>{t.leads}</Td>
                  <Td>{t.calls}</Td>
                  <Td>{t.emails}</Td>
                  <Td>{t.replied}</Td>
                  <Td>{t.registered}</Td>
                  <Td className="text-ink">{t.paid}</Td>
                  <Td>{usd(t.commissionCents)}</Td>
                  <Td />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </Table>

      <SectionTitle>Воронка: контакты по статусам</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {LEAD_STATUSES.map((s) => (
          <Card key={s} className="min-w-[9rem] p-3">
            <TonePill map={LEAD_STATUS} tones={LEAD_TONE} value={s} />
            <div className="mt-2 text-2xl font-semibold text-heading">{funnel[s] ?? 0}</div>
          </Card>
        ))}
      </div>
    </>
  );
}

// ---- templates ---------------------------------------------------------------

const VARS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{sender_name}}', '{{link}}'];

function Templates() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: ['outreach-templates'],
    queryFn: async () => (await api.GET('/admin/outreach/templates')).data!.data,
  });
  const [editing, setEditing] = useState<OutreachTemplate | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: async (t: OutreachTemplate) =>
      (
        await api.PUT('/admin/outreach/templates/{id}', {
          params: { path: { id: t.id } },
          body: { name: t.name, kind: t.kind, subject: t.subject, body: t.body, active: !t.active },
        })
      ).data!.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['outreach-templates'] }),
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Письмо — обычный текст; подстановки: {VARS.join(' ')}. Ссылка {'{{link}}'} — партнёрская ссылка того, кто отправляет. Подпись с адресом и ссылкой «отписаться» добавляется сама.
        </p>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus size={14} /> Шаблон
        </Button>
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && list.data?.length === 0 ? (
        <EmptyState icon={EnvelopeSimple} title="Шаблонов нет" text="Добавьте первое письмо адвокатам: кто вы, что даёт LawBid и ссылка." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Название</Th>
              <Th>Кому</Th>
              <Th>Тема</Th>
              <Th>Включён</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={5} loading />
            ) : (
              list.data?.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium text-ink">{t.name}</Td>
                  <Td className="text-xs text-muted">{TEMPLATE_KIND[t.kind]}</Td>
                  <Td className="text-xs text-muted">{t.subject}</Td>
                  <Td>
                    <Switch checked={t.active} onChange={() => toggle.mutate(t)} label={t.active ? 'да' : 'нет'} />
                  </Td>
                  <Td>
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      Изменить
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {editing ? <TemplateDialog t={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function TemplateDialog({ t, onClose }: { t: OutreachTemplate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(t?.name ?? '');
  const [kind, setKind] = useState<OutreachTemplate['kind']>(t?.kind ?? 'attorney');
  const [subject, setSubject] = useState(t?.subject ?? 'Клиенты ищут адвоката рядом с вами');
  const [body, setBody] = useState(
    t?.body ??
      'Здравствуйте, {{first_name}}!\n\nЯ из LawBid — приложения, где клиенты публикуют дела, а адвокаты откликаются. Первые месяцы — бесплатно по моей ссылке:\n{{link}}\n\nБуду рад ответить на вопросы.\n{{sender_name}}',
  );
  const [active, setActive] = useState(t?.active ?? true);
  const save = useMutation({
    mutationFn: async () => {
      const payload = { name, kind, subject, body, active };
      return t
        ? (await api.PUT('/admin/outreach/templates/{id}', { params: { path: { id: t.id } }, body: payload })).data!.data
        : (await api.POST('/admin/outreach/templates', { body: payload })).data!.data;
    },
    onSuccess: () => {
      toast.success('Шаблон сохранён');
      void qc.invalidateQueries({ queryKey: ['outreach-templates'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const hasLink = body.includes('{{link}}');
  const valid = name.trim().length >= 2 && subject.trim().length >= 2 && body.trim().length >= 10 && hasLink;
  return (
    <Dialog open onClose={onClose} eyebrow="Шаблон письма" title={t ? t.name : 'Новый шаблон'} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Название" htmlFor="ot-name">
            <Input id="ot-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Кому подходит" htmlFor="ot-kind">
            <Select id="ot-kind" value={kind} onChange={(e) => setKind(e.target.value as OutreachTemplate['kind'])}>
              <option value="attorney">Адвокатам</option>
              <option value="client">Клиентам</option>
              <option value="any">Всем</option>
            </Select>
          </Field>
        </div>
        <Field label="Тема" htmlFor="ot-subject">
          <Input id="ot-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Текст" htmlFor="ot-body" hint={hasLink ? `Подстановки: ${VARS.join(' ')}` : 'Добавьте {{link}} — без партнёрской ссылки письмо не считается.'}>
          <Textarea id="ot-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Switch checked={active} onChange={setActive} label="Включён (можно отправлять)" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- settings -----------------------------------------------------------------

function SettingsForm({ initial }: { initial: OutreachSettings }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [limit, setLimit] = useState(String(initial.dailyEmailLimit));
  const [fromName, setFromName] = useState(initial.fromName);
  const [address, setAddress] = useState(initial.footerAddress);
  const [url, setUrl] = useState(initial.apiPublicUrl);
  const limitN = /^\d+$/.test(limit) ? Number(limit) : null;
  const valid = limitN !== null && limitN <= 1000 && fromName.trim().length >= 2 && address.trim().length >= 10 && /^https:\/\/[^\s/]+/.test(url.trim());
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PUT('/admin/outreach/settings', {
          body: { dailyEmailLimit: limitN ?? 50, fromName: fromName.trim(), footerAddress: address.trim(), apiPublicUrl: url.trim().replace(/\/+$/, '') },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Настройки сохранены');
      void qc.invalidateQueries({ queryKey: ['outreach-context'] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="p-5">
      <h3 className="font-medium text-heading">Письма</h3>
      <p className="mt-1 text-sm text-muted">
        Закон CAN-SPAM требует в каждом коммерческом письме почтовый адрес отправителя и работающую ссылку «отписаться». Пока адрес и публичный адрес API не заполнены, письма не отправляются. Письма уходят через подключённый почтовый сервис (SES) — отдельный ключ не нужен.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Лимит писем в день на сотрудника" htmlFor="os-limit" hint="0 — письма выключены; до 1000. Небольшие порции не портят репутацию домена.">
          <Input id="os-limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label="Имя отправителя" htmlFor="os-from" hint="в подписи письма">
          <Input id="os-from" value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Почтовый адрес компании" htmlFor="os-address" hint="обязательная строка в подписи (CAN-SPAM)">
          <Input id="os-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1106 N Plum Grove Rd, Schaumburg, IL 60173" maxLength={300} />
        </Field>
        <Field label="Публичный адрес API" htmlFor="os-url" hint="для ссылки «отписаться», например https://api.lawbid.dev">
          <Input id="os-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.lawbid.dev" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </Card>
  );
}
