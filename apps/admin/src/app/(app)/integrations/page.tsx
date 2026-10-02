'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { formatDateTime } from '@/lib/utils';

type Integration = components['schemas']['IntegrationDto'];
type Version = components['schemas']['IntegrationVersionDto'];

/**
 * Owner 2026-10-01 — "Integrations & API keys": the owner adds, changes,
 * tests, activates, rolls back and removes the keys of Bunny, Stripe,
 * Twilio… Values are write-only (only ••••last4 is ever shown); every
 * change asks for a fresh 2FA code; a new key works at once, no release.
 */
export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const retry = useRef<(() => void) | null>(null);
  const q = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await api.GET('/admin/integrations')).data!.data,
  });

  /** Runs [fn]; on "2FA needed" asks for a code and runs it again. */
  const guarded = (fn: () => Promise<unknown>) => {
    const run = () => {
      setError(null);
      fn()
        .then(() => qc.invalidateQueries({ queryKey: ['integrations'] }))
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
            retry.current = run;
            setStepUp(true);
            return;
          }
          setError(errorText(e));
        });
    };
    run();
  };

  const data = q.data;
  return (
    <>
      <PageHeader
        title="Интеграции и ключи"
        subtitle="Ключи сторонних сервисов. Новый ключ сначала проверяется, затем включается — приложение подхватывает его сразу, без релиза. Значения никому не показываются."
      />
      <ErrorNote text={error ?? (q.error ? errorText(q.error) : null)} />
      {data && !data.storageEnabled ? (
        <div className="mb-4 rounded-lg border border-gold/30 bg-accent-soft p-4 text-sm text-gold-600">
          Хранение ключей в админке выключено: на сервере не задан мастер-ключ
          шифрования (SECRETS_MASTER_KEYS, SECRETS_ACTIVE_KID). Сейчас ключи
          берутся только из настроек сервера.
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.items ?? []).map((it) => (
          <IntegrationCard
            key={it.provider}
            it={it}
            editable={data?.storageEnabled ?? false}
            guarded={guarded}
          />
        ))}
      </div>
      <StepUpDialog
        open={stepUp}
        onCancel={() => setStepUp(false)}
        onDone={() => {
          setStepUp(false);
          retry.current?.();
        }}
      />
    </>
  );
}

function SourceBadge({ it }: { it: Integration }) {
  if (it.source === 'db' && it.active) {
    return <Badge tone="success">Активен · версия {it.active.version}</Badge>;
  }
  if (it.source === 'env') return <Badge tone="gold">Из настроек сервера</Badge>;
  return <Badge tone="neutral">Не настроен</Badge>;
}

function IntegrationCard({
  it,
  editable,
  guarded,
}: {
  it: Integration;
  editable: boolean;
  guarded: (fn: () => Promise<unknown>) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(false);
  const shown = it.active?.masked ?? it.envMasked ?? {};
  const pending = it.pending;
  const p = { params: { path: { provider: it.provider } } };

  const versions = useQuery({
    queryKey: ['integration-versions', it.provider],
    enabled: history,
    queryFn: async () =>
      (await api.GET('/admin/integrations/{provider}/versions', p)).data!.data,
  });
  const test = useMutation({
    mutationFn: (v: number) =>
      api.POST('/admin/integrations/{provider}/versions/{version}/test', {
        params: { path: { provider: it.provider, version: v } },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const save = () =>
    guarded(async () => {
      await api.POST('/admin/integrations/{provider}/versions', {
        ...p,
        body: { values },
      });
      setEditing(false);
      setValues({});
    });

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy">{it.label}</h2>
          <p className="mt-0.5 text-sm text-muted">{it.description}</p>
        </div>
        <SourceBadge it={it} />
      </div>

      {it.restartRequired ? (
        <p className="mt-3 text-xs text-gold-600">
          Применяется после перезапуска сервера.
        </p>
      ) : null}
      {it.warning ? (
        <p className="mt-3 rounded-md bg-accent-soft p-2 text-xs text-gold-600">
          ⚠︎ {it.warning}
        </p>
      ) : null}

      <dl className="mt-4 space-y-1.5 text-sm">
        {it.fields.map((f) => (
          <div key={f.name} className="flex justify-between gap-3">
            <dt className="text-muted">
              {f.label}
              {f.required ? '' : ' (необязательно)'}
            </dt>
            <dd className="truncate font-mono text-xs text-ink">
              {shown[f.name] ?? <span className="text-muted">—</span>}
            </dd>
          </div>
        ))}
      </dl>

      {pending ? (
        <div className="mt-4 rounded-lg border border-gold/30 bg-accent-soft p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-navy">
              Новая версия {pending.version} ждёт включения
            </div>
            {pending.lastTestAt ? (
              <Badge tone={pending.lastTestOk ? 'success' : 'danger'}>
                {pending.lastTestOk ? 'проверка пройдена' : 'проверка не прошла'}
              </Badge>
            ) : null}
          </div>
          {pending.lastTestError ? (
            <p className="mt-1 text-xs text-danger">{pending.lastTestError}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {it.testable ? (
              <Button
                size="sm"
                variant="outline"
                disabled={test.isPending}
                onClick={() => test.mutate(pending.version)}
              >
                {test.isPending ? 'Проверяю…' : 'Проверить подключение'}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="gold"
              disabled={it.testable && !pending.lastTestOk}
              title={
                it.testable && !pending.lastTestOk
                  ? 'Сначала пройдите проверку'
                  : undefined
              }
              onClick={() =>
                guarded(() =>
                  api.POST(
                    '/admin/integrations/{provider}/versions/{version}/activate',
                    {
                      params: {
                        path: { provider: it.provider, version: pending.version },
                      },
                      body: {},
                    },
                  ),
                )
              }
            >
              Включить
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {it.fields.map((f) => (
            <label key={f.name} className="block text-sm">
              <span className="text-muted">
                {f.label}
                {f.hint ? ` — ${f.hint}` : ''}
              </span>
              <Input
                className="mt-1 font-mono text-xs"
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={
                  f.secret
                    ? shown[f.name]
                      ? 'оставьте пустым, чтобы не менять'
                      : 'введите значение'
                    : (shown[f.name] ?? '')
                }
                value={values[f.name] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
              />
            </label>
          ))}
          <p className="text-xs text-muted">
            Сохранится как новая версия. Работающее приложение продолжит
            использовать текущие ключи, пока вы не проверите и не включите
            новые.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValues({});
              }}
            >
              Отмена
            </Button>
            <Button type="submit">Сохранить</Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            size="sm"
            disabled={!editable}
            title={editable ? undefined : 'Хранение ключей выключено'}
            onClick={() => setEditing(true)}
          >
            {it.configured ? 'Изменить ключи' : 'Добавить ключи'}
          </Button>
          {it.source === 'db' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  guarded(() =>
                    api.POST('/admin/integrations/{provider}/rollback', p),
                  )
                }
              >
                Вернуть прошлую версию
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  const typed = prompt(
                    `Ключи «${it.label}» из админки перестанут использоваться. Введите «${it.provider}» для подтверждения.`,
                  );
                  if (typed !== it.provider) return;
                  guarded(() =>
                    api.DELETE('/admin/integrations/{provider}', {
                      ...p,
                      body: { confirm: it.provider },
                    }),
                  );
                }}
              >
                Удалить
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistory((h) => !h)}
          >
            {history ? 'Скрыть историю' : 'История версий'}
          </Button>
        </div>
      )}

      {history ? (
        <ul className="mt-3 space-y-1 text-xs">
          {(versions.data ?? []).map((v: Version) => (
            <li
              key={v.id}
              className="flex items-center justify-between rounded-md bg-canvas px-2 py-1.5"
            >
              <span>
                v{v.version} · {formatDateTime(v.createdAt)}
              </span>
              <Badge
                tone={
                  v.status === 'active'
                    ? 'success'
                    : v.status === 'pending'
                      ? 'gold'
                      : 'neutral'
                }
              >
                {v.status === 'active'
                  ? 'активна'
                  : v.status === 'pending'
                    ? 'ждёт'
                    : 'архив'}
              </Badge>
            </li>
          ))}
          {versions.data?.length === 0 ? (
            <li className="text-muted">Версий в админке ещё нет.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
