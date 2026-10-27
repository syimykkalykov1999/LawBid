'use client';

import { ArrowSquareOut, Check } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import {
  CHANNELS,
  CHECKLIST_PREFIX,
  ORDER_STEPS,
  progressText,
  statusLines,
  switchInfo,
  type SwitchInfo,
} from '@/lib/promotion';
import { can } from '@/lib/rbac';
import { cn } from '@/lib/utils';

type Overview = components['schemas']['PromotionOverviewDto'];
/** `value` is free-form JSON in the contract (generated as an empty record). */
type Setting = Omit<components['schemas']['PromotionSettingDto'], 'value' | 'defaultValue'> & { value: unknown; defaultValue: unknown };
type DryRun = components['schemas']['PromotionDryRunResultDto'];

/**
 * Owner 2026-10-27: «Продвижение: SEO и сторы». The tumblers are the source
 * of truth for the page generator (GitHub reads them from the API; a
 * repository variable only applies while a tumbler was never touched). The
 * status comes from the published seo-manifest.json; the checklist is what
 * the owner does by hand in Google / Bing / the stores, ticked here.
 */
export default function PromotionPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canManage = me.data ? can(me.data, 'promotion', 'manage') : false;
  const [dry, setDry] = useState<DryRun | null>(null);

  const q = useQuery({
    queryKey: ['promotion'],
    queryFn: async () => (await api.GET('/admin/promotion')).data!.data as Overview,
  });

  const save = useMutation({
    mutationFn: async (v: { key: string; value: boolean | number | string; say: string }) => {
      const res = await api.PUT('/admin/promotion/settings/{key}', {
        params: { path: { key: v.key } },
        body: { value: v.value } as unknown as { value: Record<string, never> },
      });
      if (res.error) throw res.error;
      return v;
    },
    onSuccess: (v) => {
      toast.success(v.say);
      void qc.invalidateQueries({ queryKey: ['promotion'] });
    },
    onError: (e) => toast.error(e),
  });

  const run = useMutation({
    mutationFn: async () => {
      const res = await api.POST('/admin/promotion/dry-run');
      if (res.error) throw res.error;
      return res.data!.data as DryRun;
    },
    onSuccess: (r) => {
      setDry(r);
      if (r.started) toast.success('Пробный запуск начался');
    },
    onError: (e) => toast.error(e),
  });

  const o = q.data;
  const switches = [...(o?.switches ?? [])].sort(
    (a, b) => (switchInfo(a.key)?.step ?? 99) - (switchInfo(b.key)?.step ?? 99),
  );
  const done = o?.checklist.filter((c) => c.done).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Контент и модерация"
        title="Продвижение: SEO и сторы"
        subtitle="Здесь вы включаете публичные страницы для поисковиков (Google, Bing, ИИ-поиск), видите, сколько их опубликовано, и отмечаете, что уже сделали руками в Google, Bing и магазинах приложений. Всё выключено, пока вы не нажмёте. Любое действие записывается в журнал."
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />

      <SectionTitle
        action={
          canManage ? (
            <Button size="sm" variant="outline" loading={run.isPending} onClick={() => run.mutate()}>
              Пробный запуск (dry run)
            </Button>
          ) : null
        }
      >
        Тумблеры
      </SectionTitle>

      <Card className="mb-4 p-5">
        <h3 className="font-medium text-heading">В каком порядке включать</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
          {ORDER_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {dry ? <DryRunNote r={dry} /> : null}
        {!dry && o ? (
          <p className="mt-3 text-xs text-faint">
            Пробный запуск ничего не публикует. {o.dryRun.canStart ? 'Кнопка сама запускает его в GitHub.' : 'Кнопка покажет команду, которую нужно выполнить вручную.'}
          </p>
        ) : null}
      </Card>

      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {switches.map((s) => (
            <SwitchCard
              key={s.key}
              s={s}
              disabled={!canManage || save.isPending}
              onSave={(value, say) => save.mutate({ key: s.key, value, say })}
            />
          ))}
        </div>
      )}

      <SectionTitle>Состояние</SectionTitle>
      <Card className="p-5" data-testid="promotion-status">
        {q.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : o?.status.manifest ? (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {statusLines(o.status.manifest).map((l) => (
              <div key={l.label}>
                <dt className="text-xs text-faint">{l.label}</dt>
                <dd className="mt-0.5 text-lg font-medium text-heading">{l.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">{o?.status.error ?? 'Данных о сборке пока нет.'}</p>
        )}
        {o ? (
          <p className="mt-3 text-xs text-faint">
            Цифры читаются из файла <span className="break-all">{o.status.manifestUrl}</span> и обновляются раз в 10 минут.
          </p>
        ) : null}
      </Card>

      <SectionTitle action={o ? <Badge tone={done === o.checklist.length ? 'success' : 'neutral'}>{progressText(done, o.checklist.length)}</Badge> : null}>
        Чек-лист каналов
      </SectionTitle>
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Что система делает сама и что нужно нажать вам. Названия кнопок и разделов даны так, как они написаны на английском на сайтах Google, Apple и остальных. Галочка «Сделано» только ваша отметка, проверки нет.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {CHANNELS.map((c) => {
          const item = o?.checklist.find((x) => x.id === c.id);
          return (
            <Card key={c.id} className="p-5" data-testid={`channel-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-heading">{c.name}</h3>
                  {c.href ? (
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-gold-600 underline-offset-2 hover:underline"
                    >
                      Открыть сайт <ArrowSquareOut size={12} />
                    </a>
                  ) : null}
                </div>
                <label className={cn('flex shrink-0 items-center gap-2 text-sm', !canManage && 'opacity-60')}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item?.done ?? false}
                    aria-label={`${c.name}: сделано`}
                    disabled={!item || !canManage || save.isPending}
                    onClick={() =>
                      save.mutate({
                        key: `${CHECKLIST_PREFIX}${c.id}`,
                        value: !(item?.done ?? false),
                        say: `${c.name}: ${item?.done ? 'снято' : 'отмечено как сделанное'}`,
                      })
                    }
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:opacity-45',
                      item?.done ? 'border-transparent bg-success text-white' : 'border-line-strong bg-surface',
                    )}
                  >
                    {item?.done ? <Check size={14} weight="bold" /> : null}
                  </button>
                  Сделано
                </label>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                <span className="font-medium text-ink">Система: </span>
                {c.system}
              </p>
              <div className="mt-2 text-sm leading-relaxed text-muted">
                <span className="font-medium text-ink">Вы нажимаете:</span>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {c.owner.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
              {c.note ? <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">{c.note}</p> : null}
            </Card>
          );
        })}
      </div>

      <SectionTitle>Коротко</SectionTitle>
      <Card className="p-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>Тумблер здесь главнее, чем переменная в GitHub: пока вы не нажали, действует переменная (если её нет, выключено).</li>
          <li>Изменение подхватывается при следующей сборке страниц (каждую ночь) или при ручном запуске workflow «SEO pages» в GitHub.</li>
          <li>Сначала пробный запуск, потом включайте по одному в указанном порядке и смотрите цифры в «Состоянии».</li>
          <li>Сломать приложение или сайт эти тумблеры не могут: они меняют только публичные страницы для поисковиков.</li>
          <li>
            Подробная инструкция: <Link href="/guides/seo-promotion" className="text-gold-600 underline-offset-2 hover:underline">«Продвижение: страницы для поиска»</Link> в разделе «Инструкции».
          </li>
        </ul>
      </Card>
    </>
  );
}

function DryRunNote({ r }: { r: DryRun }) {
  return (
    <div className="mt-3 rounded-xl bg-surface-2 px-3.5 py-3 text-sm text-ink" role="status">
      {r.message ? <p>{r.message}</p> : null}
      {!r.started ? (
        <p className="mt-1.5">
          Команда: <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{r.command}</code>
        </p>
      ) : null}
      {r.runsUrl ? (
        <a href={r.runsUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-gold-600 underline-offset-2 hover:underline">
          Открыть запуски в GitHub <ArrowSquareOut size={13} />
        </a>
      ) : null}
    </div>
  );
}

function SwitchCard({ s, disabled, onSave }: { s: Setting; disabled: boolean; onSave: (v: boolean | number | string, say: string) => void }) {
  const info: SwitchInfo | undefined = switchInfo(s.key);
  const title = info?.title ?? s.key;
  const kind = info?.kind ?? (s.type === 'boolean' ? 'bool' : s.type === 'integer' ? 'int' : 'choice');
  return (
    <Card spotlight className="h-full p-5" data-testid={`switch-${s.key}`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-heading">{title}</h3>
            {info ? <Badge tone="neutral">шаг {info.step}</Badge> : null}
            {!s.stored ? <Badge tone="neutral">не трогали</Badge> : null}
          </div>
          <p className="mt-1.5 break-words text-sm leading-relaxed text-muted">{info?.what ?? s.key}</p>
          {info?.warn ? <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">{info.warn}</p> : null}
          {!s.stored ? (
            <p className="mt-2 text-xs text-faint">Пока вы не нажали, действует переменная GitHub с таким же именем; если её нет, выключено.</p>
          ) : null}
        </div>
        {kind === 'bool' ? (
          <Switch
            checked={s.value === true}
            disabled={disabled}
            label={title}
            onChange={(v) => onSave(v, `${title}: ${v ? 'включено' : 'выключено'}`)}
          />
        ) : null}
      </div>
      {kind === 'int' ? <IntControl s={s} info={info} disabled={disabled} title={title} onSave={onSave} /> : null}
      {kind === 'choice' ? <ChoiceControl s={s} info={info} disabled={disabled} title={title} onSave={onSave} /> : null}
    </Card>
  );
}

function IntControl({
  s,
  info,
  disabled,
  title,
  onSave,
}: {
  s: Setting;
  info?: SwitchInfo;
  disabled: boolean;
  title: string;
  onSave: (v: number, say: string) => void;
}) {
  const current = typeof s.value === 'number' ? s.value : 0;
  const [text, setText] = useState(String(current));
  useEffect(() => setText(String(current)), [current]);
  const n = Number(text);
  const valid = text.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 5000;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Input
        type="number"
        min={0}
        max={5000}
        value={text}
        disabled={disabled}
        aria-label={title}
        onChange={(e) => setText(e.target.value)}
        className="w-28"
      />
      <Button size="sm" variant="soft" disabled={disabled || !valid || n === current} onClick={() => onSave(n, `${title}: ${n === 0 ? 'без ограничения' : `${n} в сутки`}`)}>
        Сохранить
      </Button>
      {info?.intZeroText ? <span className="text-xs text-faint">{info.intZeroText}{info.intSuggest ? `; для начала ${info.intSuggest}` : ''}</span> : null}
    </div>
  );
}

function ChoiceControl({
  s,
  info,
  disabled,
  title,
  onSave,
}: {
  s: Setting;
  info?: SwitchInfo;
  disabled: boolean;
  title: string;
  onSave: (v: string, say: string) => void;
}) {
  const current = typeof s.value === 'string' ? s.value : '';
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={title}>
      {(info?.choices ?? []).map((c) => (
        <Button
          key={c.value}
          size="sm"
          variant={c.value === current ? 'gold' : 'outline'}
          aria-pressed={c.value === current}
          disabled={disabled}
          onClick={() => c.value !== current && onSave(c.value, `${title}: ${c.label}`)}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}
