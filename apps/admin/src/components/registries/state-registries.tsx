'use client';

import { CheckCircle, Copy, Gavel, MagnifyingGlass } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { StatesPicker } from '@/components/states-picker';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ADAPTER_RU, FIELD_RU, REASON_RU, RESULT_RU } from '@/lib/registry-labels';
import { US_STATES } from '@/lib/us-states';
import { formatDateTime } from '@/lib/utils';

type Registry = components['schemas']['StateRegistryDto'];
type Adapter = components['schemas']['RegistryAdapterDescriptorDto'];
type TestResult = components['schemas']['RegistryTestResultDto'];

const adapterLabel = (type: string) => ADAPTER_RU[type]?.label ?? type;
/** Every state the copy can target (the server skips the source). */
const ALL_STATES = US_STATES.map((s) => s.code);

/**
 * Owner 2026-10-05 — "Реестры адвокатов по штатам": per state, how the bar
 * registry is checked and with which key. Switching a state on with a key
 * makes the app look up every new self-attested license of that state;
 * a difference only flags the license for an admin (Проверка → Сверка с
 * реестром), nobody is rejected automatically.
 */
export function StateRegistries() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Registry | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const retry = useRef<(() => void) | null>(null);
  const q = useQuery({
    queryKey: ['state-registries'],
    queryFn: async () => (await api.GET('/admin/verification/registries')).data!.data,
  });

  /** Runs a change; asks for a 2FA code when the server wants one. */
  const guarded = (fn: () => Promise<unknown>, success: string, after?: () => void) => {
    const run = () => {
      fn()
        .then(() => {
          toast.success(success);
          void qc.invalidateQueries({ queryKey: ['state-registries'] });
          after?.();
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
            retry.current = run;
            setStepUp(true);
            return;
          }
          toast.error(e);
        });
    };
    run();
  };

  const items = q.data?.items ?? [];
  const on = items.filter((i) => i.enabled);
  const possible = items.filter((i) => i.support === 'automatic').map((i) => i.stateCode);
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-heading">
            <Gavel size={22} weight="light" className="text-gold-600" />
            Реестры адвокатов по штатам
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Новая лицензия остаётся «на проверке» (серая галочка), пока её не подтвердит реестр штата (зелёная) или
            проверяющий вручную по фото карточки адвоката. В штатах без публичного API проверка ручная, ссылка на
            официальный поиск штата есть у каждого. Выберите способ проверки и введите ключ API — приложение сразу начнёт
            сверять номер и имя. Не совпало — красная отметка и очередь «Проверка → Сверка с реестром». Раз в месяц все
            лицензии включённых штатов проверяются заново (кроме штатов, где читается сайт: там — только новая лицензия
            и ваша перепроверка).
          </p>
          {possible.length ? (
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Автоматически можно проверять {possible.length} штатов: {possible.join(', ')}. Для них есть способ «Готовый:
              официальный сайт штата» — выберите его и включите штат. Остальные — вручную, причина в колонке «Можно
              автоматически». Подробно: <Link href="/guides/state-bar-registries" className="text-gold-600 hover:underline">
                инструкция
              </Link>.
            </p>
          ) : null}
        </div>
        <Badge tone={on.length ? 'success' : 'neutral'} dot>
          {on.length ? `Автопроверка: ${on.map((i) => i.stateCode).join(', ')}` : 'Автопроверка нигде не включена'}
        </Badge>
      </div>
      {q.error ? <p className="text-sm text-danger">{errorText(q.error)}</p> : null}
      {q.isPending ? (
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <thead>
              <tr>
                <Th>Штат</Th>
                <Th>Поиск штата</Th>
                <Th>Можно автоматически</Th>
                <Th>Способ</Th>
                <Th>Ключ</Th>
                <Th>Последняя проверка</Th>
                <Th>Статус</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const last = it.lastTestResult as { result?: string } | null;
                return (
                  <tr key={it.stateCode}>
                    <Td>
                      <span className="font-mono text-xs text-muted">{it.stateCode}</span>{' '}
                      <span className="text-ink">{it.stateName}</span>
                    </Td>
                    <Td className="text-xs">
                      {it.lookupUrl ? (
                        <a href={it.lookupUrl} target="_blank" rel="noopener noreferrer" className="text-gold-600 hover:underline">
                          Открыть
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>
                    <Td className="max-w-xs text-xs">
                      {it.support === 'automatic' ? (
                        <Badge tone="success" title={it.supportNote}>
                          {it.presetAvailable ? 'Да — готовый' : 'Да'}
                        </Badge>
                      ) : (
                        <span className="text-muted" title={it.supportNote}>
                          Нет — {it.supportNote}
                        </span>
                      )}
                    </Td>
                    <Td className="text-sm">{adapterLabel(it.adapter)}</Td>
                    <Td className="font-mono text-xs">{it.secretMasked ?? <span className="text-faint">—</span>}</Td>
                    <Td className="text-xs">
                      {it.lastTestAt && last?.result ? (
                        <Badge tone={RESULT_RU[last.result]?.tone ?? 'neutral'}>
                          {RESULT_RU[last.result]?.text ?? last.result} · {formatDateTime(it.lastTestAt)}
                        </Badge>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>
                    <Td>
                      {it.enabled && it.pausedUntil ? (
                        <Badge tone="warning" dot title="Сайт штата отвечал ошибками — запросы на паузе, лицензии уходят проверяющему">
                          Пауза до {formatDateTime(it.pausedUntil)}
                        </Badge>
                      ) : it.enabled ? (
                        <Badge tone="success" dot>
                          Включена
                        </Badge>
                      ) : it.adapter === 'manual' ? (
                        <Badge tone="neutral">Вручную</Badge>
                      ) : (
                        <Badge tone="warning">Выключена</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(it)}>
                        Настроить
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      {(q.data?.formatMisses?.length ?? 0) > 0 ? (
        <Card className="mt-4 p-4">
          <h3 className="font-serif text-base font-semibold text-heading">Номера не по формату штата (отклонены)</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Форма номера, которую правило штата не узнало: 9 — цифра, A — буква. Самих номеров здесь нет. Такой номер
            отклоняется как попытка; если адвокат уверен в номере, он отправляет его на ручную проверку с фото карточки.
            Если форма настоящая, расширьте правило штата в настройке «verification.bar_formats» — без релиза.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {q.data!.formatMisses.map((m) => (
              <Badge key={`${m.stateCode}-${m.shape}`} tone="warning">
                {m.stateCode} · {m.shape} · {m.hits}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
      {editing && q.data ? (
        <RegistryDialog
          key={editing.stateCode}
          registry={items.find((i) => i.stateCode === editing.stateCode) ?? editing}
          adapters={q.data.adapterTypes}
          secretsEnabled={q.data.secretsEnabled}
          guarded={guarded}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <StepUpDialog
        open={stepUp}
        onCancel={() => setStepUp(false)}
        onDone={() => {
          setStepUp(false);
          retry.current?.();
        }}
      />
    </section>
  );
}

function RegistryDialog({
  registry,
  adapters,
  secretsEnabled,
  guarded,
  onClose,
}: {
  registry: Registry;
  adapters: Adapter[];
  secretsEnabled: boolean;
  guarded: (fn: () => Promise<unknown>, success: string, after?: () => void) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [adapter, setAdapter] = useState<string>(registry.adapter);
  const [enabled, setEnabled] = useState(registry.enabled || registry.adapter === 'manual');
  const [config, setConfig] = useState<Record<string, string>>(registry.config);
  const [secret, setSecret] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [bar, setBar] = useState(registry.testBarNumber ?? '');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [copyMode, setCopyMode] = useState<'all' | 'pick'>('pick');
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const desc = adapters.find((a) => a.type === adapter);
  const path = { params: { path: { stateCode: registry.stateCode } } };

  const save = () =>
    guarded(
      () =>
        api.PUT('/admin/verification/registries/{stateCode}', {
          ...path,
          body: {
            adapter: adapter as Registry['adapter'],
            enabled: adapter !== 'manual' && enabled,
            config,
            ...(secret ? { secret } : {}),
            ...(clearSecret ? { clearSecret: true } : {}),
            ...(bar ? { testBarNumber: bar } : {}),
          },
        }),
      adapter === 'manual'
        ? `${registry.stateName}: проверка вручную`
        : enabled
          ? `${registry.stateName}: автопроверка включена`
          : `${registry.stateName}: сохранено, автопроверка выключена`,
      () => setSecret(''),
    );

  const test = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/verification/registries/{stateCode}/test', {
          ...path,
          body: { barNumber: bar, ...(first ? { firstName: first } : {}), ...(last ? { lastName: last } : {}) },
        })
      ).data!.data,
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['state-registries'] });
    },
    onError: (e) => toast.error(e),
  });

  const copy = () =>
    guarded(
      () =>
        api.POST('/admin/verification/registries/{stateCode}/copy', {
          ...path,
          body: { states: copyMode === 'all' ? ALL_STATES : copyTo },
        }),
      'Настройки и ключ скопированы',
      () => setCopyTo([]),
    );

  const savedDiffers = adapter !== registry.adapter;
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      eyebrow="Реестр адвокатов"
      title={`${registry.stateName} (${registry.stateCode})`}
      description={ADAPTER_RU[adapter]?.description ?? desc?.description}
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="text-muted">Способ проверки</span>
          <select
            className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink"
            value={adapter}
            onChange={(e) => {
              setAdapter(e.target.value);
              setResult(null);
            }}
          >
            {adapters.map((a) => (
              <option key={a.type} value={a.type}>
                {adapterLabel(a.type)}
              </option>
            ))}
          </select>
        </label>

        {registry.support === 'manual' ? (
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            Автоматическая проверка этого штата невозможна: {registry.supportNote} Проверяющий открывает реестр по ссылке.
          </p>
        ) : registry.presetAvailable && adapter !== 'state_preset' ? (
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            Для штата есть готовый способ «{adapterLabel('state_preset')}»: {registry.supportNote}
          </p>
        ) : adapter === 'state_preset' ? (
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">{registry.supportNote}</p>
        ) : null}

        {desc?.fields.map((f) => {
          const ru = FIELD_RU[f.name];
          return (
            <label key={f.name} className="block text-sm">
              <span className="text-muted">
                {ru?.label ?? f.label}
                {f.required ? ' *' : ''}
              </span>
              {f.options ? (
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-surface px-3 font-mono text-xs text-ink"
                  value={config[f.name] ?? f.options[0]}
                  onChange={(e) => setConfig({ ...config, [f.name]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  className="mt-1 font-mono text-xs"
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={config[f.name] ?? ''}
                  onChange={(e) => setConfig({ ...config, [f.name]: e.target.value })}
                />
              )}
              {ru?.help || f.help ? <span className="mt-1 block text-xs text-faint">{ru?.help ?? f.help}</span> : null}
            </label>
          );
        })}

        {desc && desc.secret !== 'none' ? (
          <label className="block text-sm">
            <span className="text-muted">
              {desc.secretLabel ?? 'Ключ API'}
              {registry.secretMasked ? ` — сейчас ${registry.secretMasked}` : ''}
            </span>
            <Input
              className="mt-1 font-mono text-xs"
              type="password"
              autoComplete="off"
              disabled={!secretsEnabled}
              placeholder={
                !secretsEnabled
                  ? 'хранение ключей выключено на сервере (SECRETS_MASTER_KEYS)'
                  : registry.hasSecret
                    ? 'оставьте пустым, чтобы не менять'
                    : 'вставьте ключ'
              }
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            {registry.hasSecret ? (
              <span className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={clearSecret} onChange={(e) => setClearSecret(e.target.checked)} />
                Удалить сохранённый ключ
              </span>
            ) : null}
          </label>
        ) : null}

        {adapter !== 'manual' ? (
          <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm">
            <span>
              <b className="block text-heading">Автопроверка новых адвокатов {registry.stateCode}</b>
              <span className="text-xs text-muted">Выключите, чтобы сохранить настройки, но пока не проверять.</span>
            </span>
            <Switch checked={enabled} onChange={setEnabled} label="Автопроверка" />
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button onClick={save}>Сохранить</Button>
        </div>

        {adapter !== 'manual' ? (
          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-heading">
              <MagnifyingGlass size={16} /> Проверить на номере
            </h3>
            {savedDiffers ? (
              <p className="text-xs text-warning">Сначала сохраните — проверка идёт с сохранёнными настройками.</p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Номер лицензии" value={bar} onChange={(e) => setBar(e.target.value)} />
              <Input placeholder="Имя (необязательно)" value={first} onChange={(e) => setFirst(e.target.value)} />
              <Input placeholder="Фамилия (необязательно)" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!bar || savedDiffers}
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              Проверить
            </Button>
            {result ? <TestOutcome r={result} /> : null}
          </div>
        ) : null}

        {registry.adapter !== 'manual' && !savedDiffers ? (
          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-heading">
              <Copy size={16} /> Те же настройки и ключ для других штатов
            </h3>
            <p className="text-xs text-muted">
              Удобно для платного сервиса, который проверяет много штатов одним ключом. Штаты из списка получат такой же
              способ, ключ и вкл/выкл, как сохранено у {registry.stateCode}.
            </p>
            <StatesPicker mode={copyMode} onMode={setCopyMode} value={copyTo} onChange={setCopyTo} />
            <Button size="sm" variant="outline" disabled={copyMode === 'pick' && copyTo.length === 0} onClick={copy}>
              Скопировать
            </Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function TestOutcome({ r }: { r: TestResult }) {
  const d = r.details as Record<string, string | boolean | null | undefined>;
  const meta = RESULT_RU[r.result];
  return (
    <div className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs">
      <Badge tone={meta?.tone ?? 'neutral'} dot>
        {r.result === 'pass' ? <CheckCircle size={12} /> : null} {meta?.text ?? r.result}
        {typeof d.reason === 'string' ? ` — ${REASON_RU[d.reason] ?? d.reason}` : ''}
      </Badge>
      {r.error ? <p className="text-danger">{r.error}</p> : null}
      {d.name ? <p>Имя в реестре: {String(d.name)}</p> : null}
      {d.registryStatus ? <p>Статус в реестре: {String(d.registryStatus)}</p> : null}
      {d.admittedAt ? <p>Допуск: {String(d.admittedAt)}</p> : null}
      {d.raw ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-faint">{String(d.raw)}</pre> : null}
    </div>
  );
}
