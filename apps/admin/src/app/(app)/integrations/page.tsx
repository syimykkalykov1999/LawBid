'use client';

import { ArrowsClockwise, Key, LockKey, Plugs, Warning } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { fieldHint, fieldLabel, providerDescription, providerLabel, providerWarning } from '@/lib/integration-labels';
import { formatDateTime } from '@/lib/utils';

type Integration = components['schemas']['IntegrationDto'];
type Version = components['schemas']['IntegrationVersionDto'];
type Confirm = ReturnType<typeof useConfirm>['confirm'];
type Ask = ReturnType<typeof useReason>['ask'];

/** Runs a key change; asks for a 2FA code when the server wants one. */
type Guarded = (
  fn: () => Promise<unknown>,
  opts: { success: string; onError?: (e: unknown) => boolean | Promise<boolean> },
) => void;

/** Russian service / field texts (keys stay as the server sends them). */
function localize(it: Integration): Integration {
  return {
    ...it,
    label: providerLabel(it.provider, it.label),
    description: providerDescription(it.provider, it.description),
    warning: providerWarning(it.provider, it.warning),
    fields: it.fields.map((f) => ({
      ...f,
      label: fieldLabel(it.provider, f.name, f.label),
      hint: fieldHint(f.hint) ?? f.hint,
    })),
  };
}

const VERSION_STATUS: Record<string, string> = { active: 'активна', pending: 'ждёт включения', archived: 'архив' };

/**
 * Owner 2026-10-01 — "Integrations & API keys": the owner adds, changes,
 * tests, activates, rolls back and removes the keys of Bunny, Stripe,
 * Twilio… Values are write-only (only ••••last4 is ever shown); every
 * change asks for a fresh 2FA code; a new key works at once, no release.
 */
export default function IntegrationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { ask, dialog: reasonDialog } = useReason();
  const [stepUp, setStepUp] = useState(false);
  const retry = useRef<(() => void) | null>(null);
  const q = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await api.GET('/admin/integrations')).data!.data,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['integrations'] });
    // Every provider's history (prefix match on the key).
    void qc.invalidateQueries({ queryKey: ['integration-versions'] });
  };

  const guarded: Guarded = (fn, opts) => {
    const run = () => {
      fn()
        .then(() => {
          toast.success(opts.success);
          refresh();
        })
        .catch(async (e: unknown) => {
          if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
            retry.current = run;
            setStepUp(true);
            return;
          }
          if (opts.onError && (await opts.onError(e))) return;
          toast.error(e);
          refresh();
        });
    };
    run();
  };

  const reencrypt = async () => {
    const ok = await confirm({
      title: 'Перешифровать ключи?',
      description:
        'Все ключи, сохранённые в админке, будут заново зашифрованы текущим мастер-ключом сервера (SECRETS_ACTIVE_KID). Значения ключей не меняются, приложение продолжит работать. Нужно после смены мастер-ключа, чтобы старый можно было убрать.',
      confirm: 'Перешифровать',
    });
    if (!ok) return;
    guarded(
      async () => {
        await api.POST('/admin/integrations/reencrypt');
      },
      { success: 'Ключи перешифрованы текущим мастер-ключом' },
    );
  };

  const data = q.data;
  const items = (data?.items ?? []).map(localize);
  return (
    <>
      {confirmDialog}
      {reasonDialog}
      <PageHeader
        eyebrow="Система"
        title="Ключи и сервисы"
        subtitle="Ключи сторонних сервисов. Новый ключ сначала проверяется, затем включается — приложение подхватывает его сразу, без релиза. Значения никому не показываются."
        actions={
          data?.storageEnabled ? (
            <Button variant="outline" onClick={() => void reencrypt()}>
              <ArrowsClockwise size={16} weight="light" />
              Перешифровать ключи
            </Button>
          ) : null
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {data && !data.storageEnabled ? (
        <FadeIn className="mb-4">
          <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm text-warning">
            <LockKey size={20} weight="light" className="mt-0.5 shrink-0" />
            <span>
              Хранение ключей в админке выключено: на сервере не задан мастер-ключ шифрования (SECRETS_MASTER_KEYS,
              SECRETS_ACTIVE_KID). Сейчас ключи берутся только из настроек сервера.
            </span>
          </div>
        </FadeIn>
      ) : null}
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : !q.error && items.length === 0 ? (
        <EmptyState icon={Plugs} title="Сервисов нет" text="Сервер не вернул ни одной интеграции." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((it, i) => (
            <FadeIn key={it.provider} i={i}>
              <IntegrationCard
                it={it}
                editable={data?.storageEnabled ?? false}
                guarded={guarded}
                confirm={confirm}
                ask={ask}
              />
            </FadeIn>
          ))}
        </div>
      )}
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
    return (
      <Badge tone="success" dot>
        Активен · версия {it.active.version}
      </Badge>
    );
  }
  if (it.source === 'env') return <Badge tone="gold">Из настроек сервера</Badge>;
  return <Badge tone="neutral">Не настроен</Badge>;
}

function IntegrationCard({
  it,
  editable,
  guarded,
  confirm,
  ask,
}: {
  it: Integration;
  editable: boolean;
  guarded: Guarded;
  confirm: Confirm;
  ask: Ask;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(false);
  const shown = it.active?.masked ?? it.envMasked ?? {};
  const pending = it.pending;
  const p = { params: { path: { provider: it.provider } } };

  const versions = useQuery({
    queryKey: ['integration-versions', it.provider],
    enabled: history,
    queryFn: async () => (await api.GET('/admin/integrations/{provider}/versions', p)).data!.data,
  });
  const test = useMutation({
    mutationFn: async (v: number) =>
      (
        await api.POST('/admin/integrations/{provider}/versions/{version}/test', {
          params: { path: { provider: it.provider, version: v } },
        })
      ).data?.data,
    onSuccess: (v) => {
      if (v?.lastTestOk === false) toast.error(`Проверка не прошла${v.lastTestError ? `: ${v.lastTestError}` : ''}`);
      else toast.success('Проверка пройдена — можно включать');
      void qc.invalidateQueries({ queryKey: ['integrations'] });
      void qc.invalidateQueries({ queryKey: ['integration-versions', it.provider] });
    },
    onError: (e) => toast.error(e),
  });

  const save = () =>
    guarded(
      async () => {
        await api.POST('/admin/integrations/{provider}/versions', { ...p, body: { values } });
        setEditing(false);
        setValues({});
      },
      { success: 'Сохранено как новая версия — проверьте и включите её' },
    );

  const activate = (version: number) => {
    const send = (force: boolean) =>
      guarded(
        () =>
          api.POST('/admin/integrations/{provider}/versions/{version}/activate', {
            params: { path: { provider: it.provider, version } },
            body: force ? { force: true } : {},
          }),
        {
          success: `${it.label}: версия ${version} включена`,
          onError: force
            ? undefined
            : async (e) => {
                if (!(e instanceof ApiError) || e.code !== 'INTEGRATION_CONFLICT') return false;
                const ok = await confirm({
                  title: 'Версия не прошла проверку',
                  description: `Сервер не включил версию ${version}: проверка подключения не пройдена или версию только что изменил другой администратор. Включить без проверки? Если ключи неверные, ${it.label} перестанет работать в приложении.`,
                  confirm: 'Активировать всё равно',
                  danger: true,
                });
                if (ok) send(true);
                return true;
              },
        },
      );
    send(false);
  };

  const rollback = async () => {
    const ok = await confirm({
      title: `Вернуть прошлую версию «${it.label}»?`,
      description: 'Текущие ключи уйдут в архив, приложение сразу начнёт использовать предыдущую версию.',
      confirm: 'Вернуть',
      danger: true,
    });
    if (!ok) return;
    guarded(() => api.POST('/admin/integrations/{provider}/rollback', p), { success: 'Прошлая версия снова активна' });
  };

  const remove = async () => {
    const r = await ask({
      title: `Удалить ключи «${it.label}»?`,
      description: `Ключи из админки перестанут использоваться (останутся только настройки сервера, если они есть). Введите «${it.provider}» для подтверждения.`,
      label: 'Код сервиса',
      min: it.provider.length,
      max: 100,
      confirm: 'Удалить',
      danger: true,
    });
    if (!r) return;
    if (r.text !== it.provider) {
      toast.error(`Нужно ввести «${it.provider}» — ключи не удалены`);
      return;
    }
    guarded(() => api.DELETE('/admin/integrations/{provider}', { ...p, body: { confirm: it.provider } }), {
      success: `Ключи «${it.label}» удалены`,
    });
  };

  return (
    <Card spotlight className="h-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-gold-600">
            <Key size={20} weight="light" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-semibold text-heading">{it.label}</h2>
            <p className="mt-0.5 text-sm text-muted">{it.description}</p>
          </div>
        </div>
        <SourceBadge it={it} />
      </div>

      {it.restartRequired ? <p className="mt-3 text-xs text-gold-600">Применяется после перезапуска сервера.</p> : null}
      {it.warning ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft p-2.5 text-xs text-warning">
          <Warning size={14} className="mt-px shrink-0" /> {it.warning}
        </p>
      ) : null}

      <dl className="mt-4 space-y-1.5 text-sm">
        {it.fields.map((f) => (
          <div key={f.name} className="flex justify-between gap-3">
            <dt className="text-muted">
              {f.label}
              {f.required ? '' : ' (необязательно)'}
            </dt>
            <dd className="truncate font-mono text-xs text-ink">{shown[f.name] ?? <span className="text-faint">—</span>}</dd>
          </div>
        ))}
      </dl>

      {pending ? (
        <div className="mt-4 rounded-xl border border-line bg-accent-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-heading">Новая версия {pending.version} ждёт включения</div>
            {pending.lastTestAt ? (
              <Badge tone={pending.lastTestOk ? 'success' : 'danger'} dot>
                {pending.lastTestOk ? 'проверка пройдена' : 'проверка не прошла'}
              </Badge>
            ) : null}
          </div>
          {pending.lastTestError ? <p className="mt-1 text-xs text-danger">{pending.lastTestError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {it.testable ? (
              <Button size="sm" variant="outline" loading={test.isPending} onClick={() => test.mutate(pending.version)}>
                Проверить подключение
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="gold"
              title={it.testable && !pending.lastTestOk ? 'Проверка ещё не пройдена — сервер попросит подтвердить' : undefined}
              onClick={() => activate(pending.version)}
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
                  f.secret ? (shown[f.name] ? 'оставьте пустым, чтобы не менять' : 'введите значение') : (shown[f.name] ?? '')
                }
                value={values[f.name] ?? ''}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            </label>
          ))}
          <p className="text-xs text-muted">
            Сохранится как новая версия. Работающее приложение продолжит использовать текущие ключи, пока вы не проверите и не
            включите новые.
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
              <Button size="sm" variant="outline" onClick={() => void rollback()}>
                Вернуть прошлую версию
              </Button>
              <Button size="sm" variant="danger-soft" onClick={() => void remove()}>
                Удалить
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setHistory((h) => !h)}>
            {history ? 'Скрыть историю' : 'История версий'}
          </Button>
        </div>
      )}

      {history ? (
        <FadeIn>
          <ul className="mt-3 space-y-1 text-xs">
            {versions.isPending ? <Skeleton className="h-8" /> : null}
            {versions.error ? <li className="text-danger">{errorText(versions.error)}</li> : null}
            {(versions.data ?? []).map((v: Version) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-1.5">
                <span className="text-ink">
                  v{v.version} · <span className="text-muted">{formatDateTime(v.createdAt)}</span>
                </span>
                <Badge tone={v.status === 'active' ? 'success' : v.status === 'pending' ? 'gold' : 'neutral'}>
                  {VERSION_STATUS[v.status] ?? v.status}
                </Badge>
              </li>
            ))}
            {versions.data?.length === 0 ? <li className="text-muted">Версий в админке ещё нет.</li> : null}
          </ul>
        </FadeIn>
      ) : null}
    </Card>
  );
}
