'use client';

import { Archive, ArrowsClockwise, PencilSimple, Plus, Stack, Trash, UsersThree, X } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { AppPricePreview, DiscountBadge, previewDiscount } from '@/components/billing/app-price-preview';
import { dollarsToCents, fadeUp, plural, useBillingRole } from '@/components/billing/shared';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, type Tone } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { usd } from '@/lib/labels';
import { cn } from '@/lib/utils';

type Plans = components['schemas']['AdminPlansDto'];
type Plan = components['schemas']['AdminPlanDto'];
type Def = components['schemas']['EntitlementDefDto'];
type LocalizedText = components['schemas']['LocalizedTextDto'];
type Audience = Plan['audience'];
type Interval = NonNullable<Plan['interval']>;
type Status = Plan['status'];

const QUERY_KEY = ['admin-plans'] as const;

const AUDIENCE: Record<Audience, string> = { attorney: 'Адвокаты', client: 'Клиенты' };
const AUDIENCE_ONE: Record<Audience, string> = { attorney: 'адвокат', client: 'клиент' };
const INTERVAL: Record<Interval, { label: string; per: string }> = {
  month: { label: 'месяц', per: '/мес' },
  year: { label: 'год', per: '/год' },
};
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  draft: { label: 'черновик', tone: 'neutral' },
  active: { label: 'активен', tone: 'success' },
  archived: { label: 'в архиве', tone: 'warning' },
};
const GROUP: Record<string, string> = {
  team: 'Команда',
  cases: 'Кейсы и отклики',
  visibility: 'Видимость',
  features: 'Функции',
  billing: 'Оплата',
};
const GROUP_ORDER = ['team', 'cases', 'visibility', 'features', 'billing'];
const MODE: Record<string, string> = {
  live: 'Stripe: боевой режим',
  test: 'Stripe: тестовый режим (Sandbox)',
  fake: 'Stripe не подключён (тестовые платежи)',
};

const CODE_RE = /^[a-z][a-z0-9_-]{1,63}$/;
const MIN_CENTS = 100;
const MAX_CENTS = 10_000_000;

const money = (cents: number) => usd(cents, cents % 100 ? 2 : 0);
const text = (t: LocalizedText | undefined, fallback = '—') => t?.ru?.trim() || t?.en?.trim() || fallback;
const planName = (p: Plan) => text(p.name, p.code);

/** Owner 2026-10-05: Деньги → Планы — the plan builder (admin-plans.controller). */
export default function PlansPage() {
  const { canWrite } = useBillingRole();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Audience>('attorney');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [archiving, setArchiving] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [applying, setApplying] = useState<Plan | null>(null);

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.GET('/admin/billing/plans')).data!.data,
  });
  const data = q.data;

  /** Every mutation returns the whole list; put it straight into the cache. */
  const accept = (res: Plans & { stripeError?: string | null }) => {
    qc.setQueryData(QUERY_KEY, res);
    if (res.stripeError) toast.error(`Stripe пока не принял цену: ${res.stripeError}. Она создастся при первой оплате.`);
  };

  const archive = useMutation({
    mutationFn: async (p: Plan) =>
      (await api.POST('/admin/billing/plans/{id}/archive', { params: { path: { id: p.id } } })).data!.data,
    onSuccess: (res, p) => {
      accept(res);
      toast.success(`«${planName(p)}» отправлен в архив`);
      setArchiving(null);
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: async (p: Plan) =>
      (await api.DELETE('/admin/billing/plans/{id}', { params: { path: { id: p.id } } })).data!.data,
    onSuccess: (res, p) => {
      accept(res);
      toast.success(`«${planName(p)}» удалён`);
      setDeleting(null);
    },
    onError: (e) => toast.error(e),
  });

  const byAudience = useMemo(() => {
    const out: Record<Audience, { baseline: Plan | null; paid: Plan[] }> = {
      attorney: { baseline: null, paid: [] },
      client: { baseline: null, paid: [] },
    };
    for (const p of data?.plans ?? []) {
      if (p.kind === 'baseline') out[p.audience].baseline = p;
      else out[p.audience].paid.push(p);
    }
    const rank: Record<Status, number> = { active: 0, draft: 1, archived: 2 };
    for (const a of Object.keys(out) as Audience[]) {
      out[a].paid.sort((x, y) => rank[x.status] - rank[y.status] || x.sort - y.sort || x.code.localeCompare(y.code));
    }
    return out;
  }, [data]);

  const current = byAudience[tab];
  const catalog = data?.catalog ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Планы подписок"
        subtitle="Что входит в каждый план и сколько он стоит. Включили или выключили возможность — она сразу меняется у всех на этом плане. Цена у действующих подписчиков не меняется, пока вы не нажмёте «Применить к подписчикам»."
        actions={
          <>
            {data ? (
              <Badge tone={data.mode === 'live' ? 'success' : 'warning'} dot>
                {MODE[data.mode] ?? data.mode}
              </Badge>
            ) : null}
            {canWrite && data ? (
              <Button variant="gold" onClick={() => setCreating(true)}>
                <Plus size={16} weight="bold" /> Создать план
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : !data ? (
        <EmptyState icon={Stack} title="Планы не загрузились" />
      ) : (
        <>
          <PostAttachmentsCard canWrite={canWrite} />
          <CustomFeaturesCard canWrite={canWrite} catalog={catalog} />

          <Tabs
            value={tab}
            onChange={setTab}
            items={(['attorney', 'client'] as Audience[]).map((a) => ({
              value: a,
              label: AUDIENCE[a],
              count: byAudience[a].paid.filter((p) => p.status === 'active').length,
            }))}
          />

          <SectionTitle>Платные планы</SectionTitle>
          {current.paid.length === 0 ? (
            <EmptyState
              icon={Stack}
              title={`Для аудитории «${AUDIENCE[tab]}» планов ещё нет`}
              text="Создайте первый план: цена, возможности и тексты для экрана выбора плана в приложении."
              action={
                canWrite ? (
                  <Button variant="gold" onClick={() => setCreating(true)}>
                    <Plus size={16} weight="bold" /> Создать план
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {current.paid.map((p, i) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  i={i}
                  catalog={catalog}
                  canWrite={canWrite}
                  onEdit={() => setEditing(p)}
                  onArchive={() => setArchiving(p)}
                  onDelete={() => setDeleting(p)}
                  onApply={() => setApplying(p)}
                />
              ))}
            </div>
          )}

          <SectionTitle>Без подписки</SectionTitle>
          {current.baseline ? (
            <BaselineCard plan={current.baseline} catalog={catalog} canWrite={canWrite} onEdit={() => setEditing(current.baseline!)} />
          ) : (
            <p className="text-sm text-muted">Базовый план для этой аудитории ещё не создан на сервере.</p>
          )}
        </>
      )}

      {creating && data ? (
        <PlanDialog mode="create" audience={tab} catalog={catalog} onClose={() => setCreating(false)} onSaved={accept} />
      ) : null}
      {editing ? (
        <PlanDialog mode="edit" plan={editing} audience={editing.audience} catalog={catalog} onClose={() => setEditing(null)} onSaved={accept} />
      ) : null}
      {archiving ? (
        <ConfirmDialog
          eyebrow="Архив"
          title={`Отправить «${planName(archiving)}» в архив?`}
          description="Новые покупки этого плана станут невозможны. Текущие подписчики сохранят свои условия до конца подписки и смогут продлевать её."
          confirm="В архив"
          loading={archive.isPending}
          onConfirm={() => archive.mutate(archiving)}
          onClose={() => setArchiving(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          eyebrow="Удаление"
          title={`Удалить «${planName(deleting)}»?`}
          description="План исчезнет без возможности восстановления. Удалить можно только план, который никто не покупал."
          confirm="Удалить"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      {applying ? <ApplyDialog plan={applying} onClose={() => setApplying(null)} /> : null}
    </>
  );
}

/* -------------------------------------------------- attachments in posts */

type AttachmentsMode = components['schemas']['PostAttachmentsModeDto']['mode'];

const ATTACHMENT_MODES: { value: AttachmentsMode; label: string; note: string }[] = [
  {
    value: 'by_subscription',
    label: 'По подписке',
    note: 'Клиентам нужна активная золотая галочка, адвокатам активная подписка и подтверждённая лицензия, и в плане должна стоять галочка «Вложения в постах и рилсах».',
  },
  { value: 'off_for_all', label: 'Выкл для всех', note: 'Никто не добавляет файлы, даже с подпиской. Посты без вложений, как в Instagram.' },
  { value: 'on_for_all', label: 'Вкл для всех', note: 'Все могут добавлять документы и лишние фото. Подписки не нужны.' },
];

/** Owner 2026-10-13: who may add documents and extra photos to a post or a reel. */
function PostAttachmentsCard({ canWrite }: { canWrite: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['admin-post-attachments'] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await api.GET('/admin/billing/post-attachments')).data!.data,
  });
  const save = useMutation({
    mutationFn: async (body: { mode: AttachmentsMode; keepAfterCancel?: boolean }) =>
      (await api.PUT('/admin/billing/post-attachments', { body })).data!.data,
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      toast.success('Сохранено');
    },
    onError: (e) => toast.error(e),
  });
  const mode = q.data?.mode ?? 'by_subscription';
  const keep = q.data?.keepAfterCancel ?? true;
  const current = ATTACHMENT_MODES.find((m) => m.value === mode)!;
  return (
    <Card className="mb-5">
      <h3 className="font-medium">Вложения в постах и рилсах</h3>
      <p className="mt-1 text-sm text-muted">
        Файлы, документы и лишние фото в посте или рилсе. Смотреть вложения и открывать внутреннюю карточку может любой пользователь, добавлять только те, у кого есть право.
        Без вложений тап по посту ничего не открывает, а в Reels нет полоски Watch.
      </p>
      <div className="mt-3">
        <Tabs
          value={mode}
          onChange={(v) => canWrite && save.mutate({ mode: v, keepAfterCancel: keep })}
          items={ATTACHMENT_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
      </div>
      <p className="mt-2 text-xs text-muted">{current.note}</p>
      {mode === 'by_subscription' && (
        <div className="mt-3">
          <Switch
            checked={keep}
            onChange={(v) => canWrite && save.mutate({ mode, keepAfterCancel: v })}
            label="Оставлять вложения после отмены подписки"
          />
          <p className="mt-1 text-xs text-muted">
            Включено: файлы, уже добавленные в пост или рилс, остаются у всех. Выключено: после отмены подписки автора они скрываются.
          </p>
        </div>
      )}
    </Card>
  );
}


/** Owner 2026-10-14: «Новая функция» — a plan feature is data, no release. */
function CustomFeaturesCard({ canWrite, catalog }: { canWrite: boolean; catalog: Def[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [ru, setRu] = useState('');
  const [en, setEn] = useState('');
  const [about, setAbout] = useState('');
  const [aud, setAud] = useState<Audience[]>(['attorney', 'client']);
  const [type, setType] = useState<'boolean' | 'number'>('boolean');
  const custom = catalog.filter((d) => d.custom);
  const done = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    setOpen(false);
    setKey('');
    setRu('');
    setEn('');
    setAbout('');
  };
  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/billing/entitlements', {
          body: {
            key,
            type,
            audiences: aud,
            group: 'features',
            label: { en: en || ru, ru: ru || en },
            description: { en: about || ru, ru: about || ru },
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Функция создана — она появилась в редакторе каждого плана');
      done();
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: async (k: string) =>
      (await api.DELETE('/admin/billing/entitlements/{key}', { params: { path: { key: k } } })).data!.data,
    onSuccess: () => {
      toast.success('Функция удалена');
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e) => toast.error(e),
  });
  const valid = /^[a-z][a-z0-9_]{2,39}$/.test(key) && (ru.trim() || en.trim()) && aud.length > 0;
  return (
    <Card className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Свои функции планов</h3>
          <p className="mt-1 text-sm text-muted">
            Добавьте функцию, и её можно включать в любом плане без выпуска версии. Приложение видит её значение у пользователя; проверка в коде идёт по ключу.
          </p>
        </div>
        {canWrite ? (
          <Button variant="gold" onClick={() => setOpen(true)}>
            <Plus size={16} weight="bold" /> Новая функция
          </Button>
        ) : null}
      </div>
      {custom.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {custom.map((d) => (
            <li key={d.key} className="flex items-center justify-between rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm">
              <span>
                <b>{text(d.label, d.key)}</b> <span className="text-muted">· {d.key} · {d.type === 'boolean' ? 'вкл/выкл' : 'лимит'}</span>
              </span>
              {canWrite ? (
                <Button variant="ghost" onClick={() => remove.mutate(d.key)}>
                  <Trash size={16} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <Dialog open title="Новая функция плана" onClose={() => setOpen(false)}>
          <div className="grid gap-3">
            <Field label="Ключ (латиницей, например vip_support)">
              <Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} />
            </Field>
            <Field label="Название по-русски">
              <Input value={ru} onChange={(e) => setRu(e.target.value)} />
            </Field>
            <Field label="Название по-английски">
              <Input value={en} onChange={(e) => setEn(e.target.value)} />
            </Field>
            <Field label="Описание">
              <Textarea value={about} onChange={(e) => setAbout(e.target.value)} />
            </Field>
            <Field label="Тип">
              <Select value={type} onChange={(e) => setType(e.target.value as 'boolean' | 'number')}>
                <option value="boolean">Включена или нет</option>
                <option value="number">Число (лимит)</option>
              </Select>
            </Field>
            <Field label="Для кого">
              <Select
                value={aud.length === 2 ? 'both' : aud[0]}
                onChange={(e) => setAud(e.target.value === 'both' ? ['attorney', 'client'] : [e.target.value as Audience])}
              >
                <option value="both">Адвокаты и клиенты</option>
                <option value="attorney">Только адвокаты</option>
                <option value="client">Только клиенты</option>
              </Select>
            </Field>
            <Button variant="gold" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
              Создать
            </Button>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- cards */

/** Chips of what a plan gives, in catalog order, using the ru labels. */
function entitlementChips(plan: Plan, catalog: Def[]): string[] {
  const out: string[] = [];
  const ent = plan.entitlements as Record<string, boolean | number | null | undefined>;
  for (const def of catalog) {
    if (!def.audiences.includes(plan.audience)) continue;
    const v = ent[def.key];
    const label = text(def.label, def.key);
    if (def.type === 'boolean') {
      if (v === true) out.push(label);
    } else if (def.type === 'number') {
      if (typeof v !== 'number') continue;
      if (v === 0 && def.zeroIsUnlimited) out.push(`${label}: без ограничения`);
      else if (v > 0) out.push(`${label}: ${v}`);
    } else if (typeof v === 'number' && v > 0) {
      out.push(`${label}: ${money(v)}`);
    }
  }
  return out;
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <div className="text-xs text-faint">{empty}</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span key={c} className="max-w-full truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted" title={c}>
          {c}
        </span>
      ))}
    </div>
  );
}

function Subscribers({ n }: { n: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted" title="Подписчиков сейчас на этом плане">
      <UsersThree size={14} /> {n}
    </span>
  );
}

function PlanCard({
  plan: p,
  i,
  catalog,
  canWrite,
  onEdit,
  onArchive,
  onDelete,
  onApply,
}: {
  plan: Plan;
  i: number;
  catalog: Def[];
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onApply: () => void;
}) {
  const st = STATUS[p.status];
  const canArchive = p.status !== 'archived';
  const canDelete = p.status !== 'active' && p.subscribers === 0;
  return (
    <motion.div {...fadeUp(i)}>
      <Card spotlight className={cn('flex h-full flex-col p-5', p.status === 'archived' && 'opacity-70')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-heading" title={planName(p)}>
              {planName(p)}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-faint" title={p.code}>
              {p.code}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {p.isDefault ? <Badge tone="gold">по умолчанию</Badge> : null}
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-[30px] leading-none font-semibold tracking-tight text-gold-gradient">
            {p.amountCents != null ? money(p.amountCents) : '—'}
          </span>
          <span className="text-sm text-muted">{p.interval ? INTERVAL[p.interval].per : ''}</span>
          {p.discount ? (
            <span className="ml-1 inline-flex items-center gap-1.5 self-center text-sm">
              <span className="text-muted line-through">{money(p.discount.compareAtCents)}</span>
              <DiscountBadge percent={p.discount.percent} />
            </span>
          ) : null}
          {p.extraSeatCents ? <span className="ml-auto truncate text-xs text-muted">+ {money(p.extraSeatCents)}/мес за помощника</span> : null}
        </div>
        {text(p.tagline, '') ? (
          <div className="mt-1.5 truncate text-xs text-muted" title={text(p.tagline, '')}>
            {text(p.tagline, '')}
          </div>
        ) : null}
        <div className="mt-4">
          <Chips items={entitlementChips(p, catalog)} empty="Ничего сверх базового" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-5">
          <Subscribers n={p.subscribers} />
          {canWrite ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={onEdit}>
                <PencilSimple size={14} /> Изменить
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Применить к подписчикам" aria-label="Применить к подписчикам" onClick={onApply} disabled={p.subscribers === 0}>
                <ArrowsClockwise size={15} />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="В архив" aria-label="В архив" onClick={onArchive} disabled={!canArchive}>
                <Archive size={15} />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" title={canDelete ? 'Удалить' : 'Удалить можно только неактивный план без подписчиков'} aria-label="Удалить" onClick={onDelete} disabled={!canDelete}>
                <Trash size={15} />
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </motion.div>
  );
}

function BaselineCard({ plan: p, catalog, canWrite, onEdit }: { plan: Plan; catalog: Def[]; canWrite: boolean; onEdit: () => void }) {
  return (
    <motion.div {...fadeUp(0)}>
      <Card className="border-dashed bg-surface/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-heading" title={planName(p)}>
              {planName(p)}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              Что получает {AUDIENCE_ONE[p.audience]} без подписки. Цены нет; план нельзя архивировать или удалить — только изменить возможности.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Subscribers n={p.subscribers} />
            {canWrite ? (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <PencilSimple size={14} /> Изменить
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <Chips items={entitlementChips(p, catalog)} empty="Никаких возможностей — всё только по подписке" />
        </div>
      </Card>
    </motion.div>
  );
}

/* --------------------------------------------------------------- dialogs */

function ConfirmDialog({
  eyebrow,
  title,
  description,
  confirm,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} eyebrow={eyebrow} title={title} description={description}>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" variant={danger ? 'danger' : 'gold'} loading={loading} disabled={loading} onClick={onConfirm}>
          {confirm}
        </Button>
      </div>
    </Dialog>
  );
}

function ApplyDialog({ plan: p, onClose }: { plan: Plan; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 10;
  const apply = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/billing/plans/{id}/apply-to-subscribers', {
          params: { path: { id: p.id } },
          body: { reason: reason.trim() },
        })
      ).data!.data,
    onSuccess: (res) => {
      toast.success(`Обновлено ${res.updated} ${plural(res.updated, 'подписка', 'подписки', 'подписок')}`);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="Подписчики"
      title={`Применить «${planName(p)}» к подписчикам`}
      description="Все, кто сейчас на этом плане, получат его текущие возможности и цену. Новая цена начнёт списываться с их следующего продления, без доплат сейчас."
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) apply.mutate();
        }}
      >
        <div className="flex items-center justify-between rounded-[var(--radius)] border border-line bg-surface-2 px-4 py-3 text-sm">
          <span className="text-muted">Подписчиков на плане</span>
          <span className="font-semibold tabular-nums text-heading">{p.subscribers}</span>
        </div>
        <Field label="Причина (обязательно)" htmlFor="apply-reason" hint={!ok ? 'не меньше 10 символов' : 'попадёт в журнал аудита'}>
          <Textarea id="apply-reason" autoFocus rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: добавили видеозвонки всем подписчикам Pro" />
        </Field>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={apply.isPending} disabled={!ok || apply.isPending}>
            Применить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------- plan dialog */

interface Draft {
  code: string;
  audience: Audience;
  interval: Interval;
  amount: string;
  /** Owner 2026-10-07: the strikethrough old price and its switch. */
  old: string;
  showDisc: boolean;
  name: LocalizedText;
  tagline: LocalizedText;
  description: LocalizedText;
  highlights: LocalizedText[];
  /** boolean defs → boolean; number/price defs → the text in the input. */
  ent: Record<string, boolean | string>;
  status: Status;
  sort: string;
  isDefault: boolean;
  note: string;
  /** Push changed entitlements to current subscribers at once (default). */
  applyNow: boolean;
}

function draftFrom(plan: Plan | undefined, audience: Audience, catalog: Def[]): Draft {
  const ent: Record<string, boolean | string> = {};
  const values = (plan?.entitlements ?? {}) as Record<string, boolean | number | null | undefined>;
  for (const def of catalog) {
    if (!def.audiences.includes(audience)) continue;
    const v = values[def.key];
    if (def.type === 'boolean') ent[def.key] = v === true;
    else if (def.type === 'number') ent[def.key] = typeof v === 'number' ? String(v) : '';
    else ent[def.key] = typeof v === 'number' ? String(v / 100) : '';
  }
  return {
    code: plan?.code ?? '',
    audience,
    interval: plan?.interval ?? 'month',
    amount: plan?.amountCents != null ? String(plan.amountCents / 100) : '',
    old: plan?.compareAtCents != null ? String(plan.compareAtCents / 100) : '',
    showDisc: plan?.showDiscount ?? false,
    name: { en: plan?.name?.en ?? '', ru: plan?.name?.ru ?? '' },
    tagline: { en: plan?.tagline?.en ?? '', ru: plan?.tagline?.ru ?? '' },
    description: { en: plan?.description?.en ?? '', ru: plan?.description?.ru ?? '' },
    highlights: (plan?.highlights ?? []).map((h) => ({ en: h.en ?? '', ru: h.ru ?? '' })),
    ent,
    status: plan?.status ?? 'draft',
    sort: String(plan?.sort ?? 100),
    isDefault: plan?.isDefault ?? false,
    note: '',
    applyNow: true,
  };
}

/** Integer in [min, max] or null when the text is not one. */
function parseInt_(s: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return n >= min && n <= max ? n : null;
}

function localized(t: LocalizedText): { en?: string; ru?: string } | undefined {
  const en = t.en?.trim();
  const ru = t.ru?.trim();
  if (!en && !ru) return undefined;
  return { en: en || undefined, ru: ru || undefined };
}

function PlanDialog({
  mode,
  plan,
  audience: initialAudience,
  catalog,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  plan?: Plan;
  audience: Audience;
  catalog: Def[];
  onClose: () => void;
  onSaved: (res: components['schemas']['AdminPlanResultDto']) => void;
}) {
  const toast = useToast();
  const isBaseline = plan?.kind === 'baseline';
  const [d, setD] = useState<Draft>(() => draftFrom(plan, initialAudience, catalog));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const defs = useMemo(
    () =>
      catalog
        .filter((c) => c.audiences.includes(d.audience))
        .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)),
    [catalog, d.audience],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Def[]>();
    for (const def of defs) m.set(def.group, [...(m.get(def.group) ?? []), def]);
    return [...m.entries()];
  }, [defs]);

  // Switching the audience in "create" rebuilds the entitlement draft.
  const changeAudience = (a: Audience) => setD((x) => ({ ...draftFrom(undefined, a, catalog), ...pickTexts(x), audience: a }));

  // ---- validation
  const codeOk = mode === 'edit' || CODE_RE.test(d.code);
  const cents = dollarsToCents(d.amount);
  const amountOk = isBaseline || (cents != null && cents >= MIN_CENTS && cents <= MAX_CENTS);
  const nameOk = !!(d.name.en?.trim() || d.name.ru?.trim());
  const sortOk = isBaseline || parseInt_(d.sort, 0, 1000) != null;

  const entErrors: Record<string, string> = {};
  const entValues: Record<string, boolean | number | null> = {};
  for (const def of defs) {
    const raw = d.ent[def.key];
    if (def.type === 'boolean') {
      entValues[def.key] = raw === true;
      continue;
    }
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (def.type === 'number') {
      if (s === '') continue;
      const n = parseInt_(s, def.min ?? 0, def.max ?? Number.MAX_SAFE_INTEGER);
      if (n == null) entErrors[def.key] = `целое число от ${def.min ?? 0} до ${def.max ?? '∞'}`;
      else entValues[def.key] = n;
    } else {
      if (s === '') {
        entValues[def.key] = null;
        continue;
      }
      const c = dollarsToCents(s);
      if (c == null || (def.min != null && c < def.min) || (def.max != null && c > def.max)) {
        entErrors[def.key] = `от ${money(def.min ?? MIN_CENTS)} до ${money(def.max ?? MAX_CENTS)}`;
      } else entValues[def.key] = c;
    }
  }
  // Clamp max_seats ≥ included_seats (the API does the same).
  const seatsClamped =
    typeof entValues.max_seats === 'number' && typeof entValues.included_seats === 'number' && entValues.max_seats < entValues.included_seats;
  if (seatsClamped) entValues.max_seats = entValues.included_seats;

  const oldCents = d.old.trim() === '' ? null : dollarsToCents(d.old);
  const oldOk = d.old.trim() === '' || (oldCents != null && oldCents >= MIN_CENTS && oldCents <= MAX_CENTS);
  const disc = amountOk && oldOk ? previewDiscount(cents, oldCents, d.showDisc) : null;
  const ok = codeOk && amountOk && oldOk && nameOk && sortOk && Object.keys(entErrors).length === 0;

  const save = useMutation({
    mutationFn: async () => {
      const fields: components['schemas']['PlanFieldsDto'] = {
        name: localized(d.name),
        tagline: localized(d.tagline),
        description: localized(d.description),
        highlights: d.highlights.map(localized).filter((h): h is { en?: string; ru?: string } => !!h),
        entitlements: entValues,
        note: d.note.trim() || undefined,
      };
      if (mode === 'edit' && !isBaseline) fields.applyNow = d.applyNow;
      if (!isBaseline) {
        fields.status = d.status;
        fields.sort = parseInt_(d.sort, 0, 1000) ?? undefined;
        fields.isDefault = d.isDefault;
        // The price goes through PUT only when it changed: each change makes a new Stripe price.
        if (mode === 'create' || cents !== plan?.amountCents) fields.amountCents = cents!;
        if (mode === 'create' || oldCents !== (plan?.compareAtCents ?? null) || d.showDisc !== (plan?.showDiscount ?? false)) {
          fields.compareAtCents = oldCents;
          fields.showDiscount = d.showDisc;
        }
      }
      if (mode === 'create') {
        return (
          await api.POST('/admin/billing/plans', {
            body: { ...fields, code: d.code.trim(), audience: d.audience, interval: d.interval, amountCents: cents! },
          })
        ).data!.data;
      }
      return (await api.PUT('/admin/billing/plans/{id}', { params: { path: { id: plan!.id } }, body: fields })).data!.data;
    },
    onSuccess: (res) => {
      onSaved(res);
      toast.success(mode === 'create' ? `План «${text(d.name, d.code)}» создан` : `План «${text(d.name, d.code)}» сохранён`);
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const title = mode === 'create' ? 'Создать план' : isBaseline ? `Без подписки · ${AUDIENCE[d.audience]}` : `Изменить «${plan ? planName(plan) : ''}»`;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      eyebrow={mode === 'create' ? 'Новый план' : 'План'}
      title={title}
      description={
        mode === 'create'
          ? 'Код, аудиторию и период нельзя поменять после создания. Всё остальное — можно.'
          : isBaseline
            ? 'Эти возможности получает каждый без подписки. Изменения действуют сразу.'
            : 'Возможности по умолчанию меняются сразу у всех на этом плане (переключатель ниже). Цена у действующих подписчиков не меняется, пока вы не нажмёте «Применить к подписчикам» на карточке плана.'
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) save.mutate();
        }}
      >
        {/* identity */}
        {!isBaseline ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
            <Field label="Код" htmlFor="plan-code" hint={mode === 'create' ? (codeOk || !d.code ? 'латиница, цифры, _ и -, с буквы' : 'только a-z, 0-9, _ и -, начинается с буквы, 2–64 символа') : 'нельзя изменить'}>
              <Input
                id="plan-code"
                autoFocus={mode === 'create'}
                className="font-mono"
                value={d.code}
                readOnly={mode === 'edit'}
                disabled={mode === 'edit'}
                placeholder="attorney_pro"
                onChange={(e) => set('code', e.target.value.toLowerCase())}
              />
            </Field>
            <Field label="Аудитория" htmlFor="plan-audience" hint={mode === 'edit' ? 'нельзя изменить' : undefined}>
              <Select id="plan-audience" className="w-40" value={d.audience} disabled={mode === 'edit'} onChange={(e) => changeAudience(e.target.value as Audience)}>
                <option value="attorney">Адвокаты</option>
                <option value="client">Клиенты</option>
              </Select>
            </Field>
            <Field label="Период" htmlFor="plan-interval" hint={mode === 'edit' ? 'нельзя изменить' : undefined}>
              <Select id="plan-interval" className="w-32" value={d.interval} disabled={mode === 'edit'} onChange={(e) => set('interval', e.target.value as Interval)}>
                <option value="month">Месяц</option>
                <option value="year">Год</option>
              </Select>
            </Field>
          </div>
        ) : null}

        {!isBaseline ? (
          <Field
            label={`Цена, $ ${INTERVAL[d.interval].per}`}
            htmlFor="plan-amount"
            hint={!amountOk && d.amount ? 'от $1 до $100 000' : mode === 'edit' && cents !== plan?.amountCents && cents != null ? `было ${plan?.amountCents != null ? money(plan.amountCents) : '—'} — новая цена для всех новых оплат` : 'в долларах, можно с центами'}
          >
            <Input id="plan-amount" inputMode="decimal" className="w-40 text-lg" value={d.amount} onChange={(e) => set('amount', e.target.value)} placeholder="399" />
          </Field>
        ) : null}

        {!isBaseline ? (
          <div className="space-y-3 rounded-[var(--radius)] border border-line px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm">
                <div className="font-medium text-heading">Показывать скидку</div>
                <div className="mt-0.5 text-xs text-muted">Старая цена зачёркивается, процент считается сам. Если старая цена не больше цены, скидка не показывается.</div>
              </div>
              <Switch checked={d.showDisc} onChange={(v) => set('showDisc', v)} label="Показывать скидку" />
            </div>
            <Field
              label="Старая цена, $ (необязательно)"
              htmlFor="plan-old"
              hint={!oldOk ? 'от $1 до $100 000' : d.showDisc && amountOk && oldCents != null && !disc ? 'должна быть больше цены, иначе скидка не покажется' : 'пусто = без скидки'}
            >
              <Input id="plan-old" inputMode="decimal" className="w-40" value={d.old} onChange={(e) => set('old', e.target.value)} placeholder="например 149" />
            </Field>
          </div>
        ) : null}

        {!isBaseline && amountOk ? (
          <AppPricePreview
            title={text(d.name, d.code || 'План')}
            amountCents={cents!}
            yearly={d.interval === 'year'}
            discount={disc}
            lines={d.highlights.map((h) => h.ru?.trim() || h.en?.trim() || '').filter(Boolean)}
            linesNote={d.highlights.length === 0 ? 'Строки возможностей приложение возьмёт из каталога.' : undefined}
          />
        ) : null}

        {/* texts */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Тексты</h3>
          <TextPair label="Название" id="plan-name" value={d.name} onChange={(v) => set('name', v)} hint={!nameOk ? 'нужно хотя бы на одном языке' : undefined} />
          <TextPair label="Подзаголовок" id="plan-tagline" value={d.tagline} onChange={(v) => set('tagline', v)} />
          <TextPair label="Описание" id="plan-description" value={d.description} onChange={(v) => set('description', v)} multiline />
        </section>

        {/* highlights */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Преимущества на экране выбора</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={d.highlights.length >= 20}
              onClick={() => set('highlights', [...d.highlights, { en: '', ru: '' }])}
            >
              <Plus size={14} /> Добавить
            </Button>
          </div>
          {d.highlights.length === 0 ? <p className="text-xs text-muted">Пока пусто — приложение покажет список возможностей из каталога.</p> : null}
          {d.highlights.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input aria-label={`Преимущество ${i + 1}, по-русски`} placeholder="По-русски" maxLength={300} value={h.ru ?? ''} onChange={(e) => set('highlights', d.highlights.map((x, j) => (j === i ? { ...x, ru: e.target.value } : x)))} />
              <Input aria-label={`Преимущество ${i + 1}, по-английски`} placeholder="In English" maxLength={300} value={h.en ?? ''} onChange={(e) => set('highlights', d.highlights.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))} />
              <Button type="button" size="icon" variant="ghost" aria-label="Убрать" onClick={() => set('highlights', d.highlights.filter((_, j) => j !== i))}>
                <X size={14} />
              </Button>
            </div>
          ))}
        </section>

        {/* entitlements */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Возможности</h3>
          {groups.map(([group, items]) => (
            <div key={group} className="rounded-[var(--radius)] border border-line">
              <div className="border-b border-line bg-surface-2/60 px-4 py-2 text-xs font-medium text-muted">{GROUP[group] ?? group}</div>
              <div className="divide-y divide-line">
                {items.map((def) => (
                  <EntitlementRow
                    key={def.key}
                    def={def}
                    value={d.ent[def.key]}
                    error={entErrors[def.key]}
                    warning={def.key === 'max_seats' && seatsClamped ? `не меньше включённых — сохранится ${entValues.included_seats}` : undefined}
                    onChange={(v) => set('ent', { ...d.ent, [def.key]: v })}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* publishing */}
        {!isBaseline ? (
          <section className="grid gap-4 sm:grid-cols-[auto_auto_1fr]">
            <Field label="Статус" htmlFor="plan-status">
              <Select id="plan-status" className="w-40" value={d.status} onChange={(e) => set('status', e.target.value as Status)}>
                <option value="draft">Черновик</option>
                <option value="active">Активен</option>
                <option value="archived">В архиве</option>
              </Select>
            </Field>
            <Field label="Порядок" htmlFor="plan-sort" hint={!sortOk ? '0–1000' : undefined}>
              <Input id="plan-sort" inputMode="numeric" className="w-24" value={d.sort} onChange={(e) => set('sort', e.target.value)} />
            </Field>
            <div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-line px-4 py-3">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-heading">План по умолчанию</div>
                <div className="mt-0.5 text-xs text-muted">Его покупают старые версии приложения для этой аудитории и периода.</div>
              </div>
              <Switch checked={d.isDefault} onChange={(v) => set('isDefault', v)} label="План по умолчанию" />
            </div>
          </section>
        ) : null}

        {mode === 'edit' && !isBaseline ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-3">
            <div className="min-w-0 text-sm">
              <div className="font-medium text-heading">Применить к действующим подписчикам сразу</div>
              <div className="mt-0.5 text-xs text-muted">Выключите, чтобы новые возможности получали только новые покупатели, а у текущих всё осталось как было.</div>
            </div>
            <Switch checked={d.applyNow} onChange={(v) => set('applyNow', v)} label="Применить сразу" />
          </div>
        ) : null}

        <Field label="Заметка" htmlFor="plan-note" hint="попадёт в журнал аудита">
          <Textarea id="plan-note" rows={2} maxLength={300} value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="Например: запуск Pro для адвокатов" />
        </Field>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={save.isPending} disabled={!ok || save.isPending}>
            {mode === 'create' ? 'Создать' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function pickTexts(d: Draft): Pick<Draft, 'code' | 'interval' | 'amount' | 'name' | 'tagline' | 'description' | 'highlights' | 'status' | 'sort' | 'isDefault' | 'note'> {
  const { code, interval, amount, name, tagline, description, highlights, status, sort, isDefault, note } = d;
  return { code, interval, amount, name, tagline, description, highlights, status, sort, isDefault, note };
}

function TextPair({
  label,
  id,
  value,
  onChange,
  hint,
  multiline,
}: {
  label: string;
  id: string;
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  hint?: string;
  multiline?: boolean;
}) {
  const max = multiline ? 1000 : 300;
  const C = multiline ? Textarea : Input;
  return (
    <Field label={label} htmlFor={`${id}-ru`} hint={hint}>
      <div className="grid gap-2 sm:grid-cols-2">
        <C id={`${id}-ru`} rows={multiline ? 3 : undefined} maxLength={max} placeholder="По-русски" value={value.ru ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, ru: e.target.value })} />
        <C id={`${id}-en`} rows={multiline ? 3 : undefined} maxLength={max} placeholder="In English" value={value.en ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, en: e.target.value })} />
      </div>
    </Field>
  );
}

function EntitlementRow({
  def,
  value,
  error,
  warning,
  onChange,
}: {
  def: Def;
  value: boolean | string | undefined;
  error?: string;
  warning?: string;
  onChange: (v: boolean | string) => void;
}) {
  const id = `ent-${def.key}`;
  const range =
    def.type === 'number'
      ? `${def.min ?? 0}–${def.max ?? '∞'}${def.zeroIsUnlimited ? ' · 0 = без ограничения' : ''}`
      : def.type === 'price'
        ? `${money(def.min ?? MIN_CENTS)}–${money(def.max ?? MAX_CENTS)} · пусто = общая цена (Цены)`
        : null;
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block truncate text-sm font-medium text-heading" title={text(def.label, def.key)}>
          {text(def.label, def.key)}
        </label>
        <div className="mt-0.5 text-xs text-muted">{text(def.description, '')}</div>
        {error ? <div className="mt-1 text-xs text-danger">{error}</div> : warning ? <div className="mt-1 text-xs text-warning">{warning}</div> : range ? <div className="mt-1 text-xs text-faint">{range}</div> : null}
      </div>
      <div className="w-32 shrink-0">
        {def.type === 'boolean' ? (
          <div className="flex h-10 items-center justify-end">
            <Switch checked={value === true} onChange={onChange} label={text(def.label, def.key)} />
          </div>
        ) : def.type === 'number' ? (
          <Input id={id} inputMode="numeric" className={cn('text-right tabular-nums', error && 'border-danger')} value={typeof value === 'string' ? value : ''} placeholder={def.zeroIsUnlimited ? '0' : '—'} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-faint">$</span>
            <Input id={id} inputMode="decimal" className={cn('pl-7 text-right tabular-nums', error && 'border-danger')} value={typeof value === 'string' ? value : ''} placeholder="общая" onChange={(e) => onChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}
