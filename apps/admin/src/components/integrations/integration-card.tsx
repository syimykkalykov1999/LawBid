'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowSquareOut,
  CaretDown,
  Copy,
  Eye,
  EyeSlash,
  FileArrowUp,
  Key,
  Plus,
  Question,
  Sparkle,
  Warning,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { useConfirm } from '@/components/legacy/confirm';
import { FadeIn } from '@/components/legacy/fade-in';
import type { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { generated, guideFor, rejectText, webhookUrl, type ProviderGuide } from '@/lib/integration-guides';
import { formatDateTime } from '@/lib/utils';
import { TranslateZones } from './translate-zones';

export type Integration = components['schemas']['IntegrationDto'];
type Slot = components['schemas']['IntegrationSlotDto'];
type Version = components['schemas']['IntegrationVersionDto'];
type Confirm = ReturnType<typeof useConfirm>['confirm'];
type Ask = ReturnType<typeof useReason>['ask'];

/** Runs a key change; asks for a 2FA code when the server wants one. */
export type Guarded = (
  fn: () => Promise<unknown>,
  opts: { success: string; onError?: (e: unknown) => boolean | Promise<boolean> },
) => void;

const VERSION_STATUS: Record<string, string> = { active: 'активна', pending: 'ждёт включения', archived: 'архив' };
const MAIN = 'main';

export function slotName(s: { slot: string; label?: string | null }): string {
  return s.label || (s.slot === MAIN ? 'Основной ключ' : `Ключ ${s.slot}`);
}

/** A fresh key-set id: short, unique enough, matches the API pattern. */
export function newSlotId(): string {
  return `k${Date.now().toString(36)}`;
}

/** Moves [slot] one place up (-1) or down (+1) in [order]. */
export function moved(order: string[], slot: string, dir: -1 | 1): string[] {
  const i = order.indexOf(slot);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * One service: its key sets in the order the API tries them (owner
 * 2026-10-05: "2, 3 keys and the app works with all of them"). The first
 * enabled working set is used; when a call with it fails the API moves to
 * the next one. Values stay write-only (only ••••last4 is shown).
 */
export function IntegrationCard({
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
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const p = { params: { path: { provider: it.provider } } };
  const order = it.slots.map((s) => s.slot);

  const reorder = (slot: string, dir: -1 | 1) =>
    guarded(() => api.PUT('/admin/integrations/{provider}/order', { ...p, body: { slots: moved(order, slot, dir) } }), {
      success: 'Порядок ключей сохранён',
    });

  const removeService = async () => {
    const r = await ask({
      title: `Удалить сервис «${it.label}»?`,
      description: `Сервис и все его ключи будут удалены из админки. Введите «${it.provider}» для подтверждения.`,
      label: 'Код сервиса',
      min: it.provider.length,
      max: 100,
      confirm: 'Удалить',
      danger: true,
    });
    if (!r || r.text !== it.provider) return;
    guarded(() => api.DELETE('/admin/integrations/custom/{provider}', { ...p, body: { confirm: it.provider } }), {
      success: `Сервис «${it.label}» удалён`,
    });
  };

  const inUse = it.slots.find((s) => s.slot === it.inUse);

  return (
    <Card spotlight className="h-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-gold-600">
            <Key size={20} weight="light" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold text-heading">
              {it.label} {it.custom ? <Badge tone="neutral">свой</Badge> : null}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{it.description}</p>
          </div>
        </div>
        {inUse ? (
          <Badge tone="success" dot>
            В работе: {slotName(inUse)}
          </Badge>
        ) : it.source === 'env' ? (
          <Badge tone="gold">Из настроек сервера</Badge>
        ) : (
          <Badge tone="neutral">Не настроен</Badge>
        )}
      </div>

      {it.restartRequired ? <p className="mt-3 text-xs text-gold-600">Применяется после перезапуска сервера.</p> : null}
      {it.warning ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft p-2.5 text-xs text-warning">
          <Warning size={14} className="mt-px shrink-0" /> {it.warning}
        </p>
      ) : null}

      <Guide it={it} />

      {it.provider === 'google_translate' ? <TranslateZones configured={!!inUse || it.source === 'env'} /> : null}

      {it.source === 'env' && it.envMasked ? (
        <dl className="mt-4 space-y-1.5 text-sm">
          {it.fields.map((f) => (
            <div key={f.name} className="flex justify-between gap-3">
              <dt className="text-muted">{f.label}</dt>
              <dd className="truncate font-mono text-xs text-ink">{it.envMasked?.[f.name] ?? '—'}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-4 space-y-3">
        {it.slots.map((s, i) => (
          <SlotBox
            key={s.slot}
            it={it}
            slot={s}
            index={i}
            total={it.slots.length}
            inUse={it.inUse === s.slot}
            editable={editable}
            guarded={guarded}
            confirm={confirm}
            ask={ask}
            onMove={(dir) => reorder(s.slot, dir)}
          />
        ))}
      </div>

      {adding ? (
        <KeyForm
          it={it}
          slot={it.slots.length === 0 ? MAIN : newSlotId()}
          isNew
          guarded={guarded}
          onClose={() => setAdding(false)}
        />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            size="sm"
            disabled={!editable}
            title={editable ? undefined : 'Хранение ключей выключено: не заданы SECRETS_MASTER_KEYS и SECRETS_ACTIVE_KID на сервере'}
            onClick={() => setAdding(true)}
          >
            <Plus size={14} /> {it.slots.length === 0 ? 'Добавить ключи' : 'Добавить запасной ключ'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHistory((h) => !h)}>
            {history ? 'Скрыть историю' : 'История версий'}
          </Button>
          {it.custom ? (
            <Button size="sm" variant="danger-soft" onClick={() => void removeService()}>
              Удалить сервис
            </Button>
          ) : null}
        </div>
      )}
      {it.slots.length > 1 ? (
        <p className="mt-2 text-xs text-faint">
          Приложение берёт первый включённый рабочий ключ; если он отказал, на 5 минут переходит на следующий.
        </p>
      ) : null}
      {history ? <History it={it} /> : null}
    </Card>
  );
}

function SlotBox({
  it,
  slot,
  index,
  total,
  inUse,
  editable,
  guarded,
  confirm,
  ask,
  onMove,
}: {
  it: Integration;
  slot: Slot;
  index: number;
  total: number;
  inUse: boolean;
  editable: boolean;
  guarded: Guarded;
  confirm: Confirm;
  ask: Ask;
  onMove: (dir: -1 | 1) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const shown = slot.active?.masked ?? {};
  const pending = slot.pending;
  const p = { params: { path: { provider: it.provider } } };
  const slotPath = { params: { path: { provider: it.provider, slot: slot.slot } } };
  const name = slotName(slot);
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null);

  // Owner 2026-10-06: the eye shows the saved keys in full (fresh 2FA /
  // password, written to the audit log); they hide again after a minute.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(null), 60_000);
    return () => clearTimeout(t);
  }, [revealed]);
  const reveal = (version: number) =>
    guarded(
      async () => {
        const r = await api.POST('/admin/integrations/{provider}/versions/{version}/reveal', {
          params: { path: { provider: it.provider, version } },
        });
        setRevealed(r.data?.data.values ?? {});
      },
      { success: 'Ключи показаны на 1 минуту. Это записано в журнал.' },
    );

  const test = useMutation({
    mutationFn: async (v: number) =>
      (
        await api.POST('/admin/integrations/{provider}/versions/{version}/test', {
          params: { path: { provider: it.provider, version: v } },
        })
      ).data?.data,
    onSuccess: (v) => {
      if (v?.lastTestOk === false) toast.error(`Проверка не прошла${v.lastTestError ? `: ${v.lastTestError}` : ''}`);
      else toast.success('Проверка пройдена');
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (e) => toast.error(e),
  });

  const activate = (version: number) => {
    const send = (force: boolean) =>
      guarded(
        () =>
          api.POST('/admin/integrations/{provider}/versions/{version}/activate', {
            params: { path: { provider: it.provider, version } },
            body: force ? { force: true } : {},
          }),
        {
          success: `${it.label} · ${name}: версия ${version} включена`,
          onError: force
            ? undefined
            : async (e) => {
                if (!(e instanceof ApiError) || e.code !== 'INTEGRATION_CONFLICT') return false;
                const ok = await confirm({
                  title: 'Версия не прошла проверку',
                  description: `Сервер не включил версию ${version}: проверка подключения не пройдена или версию только что изменил другой администратор. Включить без проверки?`,
                  confirm: 'Включить всё равно',
                  danger: true,
                });
                if (ok) send(true);
                return true;
              },
        },
      );
    send(false);
  };

  const setEnabled = (enabled: boolean) =>
    guarded(() => api.PATCH('/admin/integrations/{provider}/slots/{slot}', { ...slotPath, body: { enabled } }), {
      success: enabled ? `«${name}» включён` : `«${name}» выключен — приложение его пропускает`,
    });

  const rename = async () => {
    const r = await ask({
      title: 'Название ключа',
      description: 'Например «Бесплатный аккаунт» или «Запасной Stripe». Видно только в админке.',
      label: 'Название',
      min: 1,
      max: 60,
      confirm: 'Сохранить',
    });
    if (!r) return;
    guarded(() => api.PATCH('/admin/integrations/{provider}/slots/{slot}', { ...slotPath, body: { label: r.text } }), {
      success: 'Название сохранено',
    });
  };

  const rollback = async () => {
    const ok = await confirm({
      title: `Вернуть прошлую версию «${name}»?`,
      description: 'Текущие ключи этого набора уйдут в архив, приложение сразу начнёт использовать предыдущую версию.',
      confirm: 'Вернуть',
      danger: true,
    });
    if (!ok) return;
    guarded(() => api.POST('/admin/integrations/{provider}/rollback', { ...p, body: { slot: slot.slot } }), {
      success: 'Прошлая версия снова активна',
    });
  };

  const remove = async () => {
    const r = await ask({
      title: `Удалить «${name}»?`,
      description: `Этот ключ перестанет использоваться, остальные продолжат работать. Введите «${it.provider}» для подтверждения.`,
      label: 'Код сервиса',
      min: it.provider.length,
      max: 100,
      confirm: 'Удалить',
      danger: true,
    });
    if (!r) return;
    if (r.text !== it.provider) {
      toast.error(`Нужно ввести «${it.provider}» — ключ не удалён`);
      return;
    }
    guarded(() => api.DELETE('/admin/integrations/{provider}', { ...p, body: { confirm: it.provider, slot: slot.slot } }), {
      success: `«${name}» удалён`,
    });
  };

  return (
    <div className={`rounded-xl border p-3 ${inUse ? 'border-success/50' : 'border-line'} ${slot.enabled ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs tabular-nums text-muted">
            {index + 1}
          </span>
          <button
            type="button"
            title="Переименовать"
            className="truncate text-sm font-medium text-heading hover:underline"
            onClick={() => void rename()}
          >
            {name}
          </button>
          {inUse ? <Badge tone="success">в работе</Badge> : null}
          {slot.active ? <Badge tone="neutral">v{slot.active.version}</Badge> : null}
          {!slot.enabled ? <Badge tone="warning">выключен</Badge> : null}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={14} />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Ниже" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown size={14} />
          </Button>
          <Switch checked={slot.enabled} onChange={setEnabled} label="Ключ включён" />
        </div>
      </div>

      {slot.active ? (
        <dl className="mt-2 space-y-1 text-sm">
          {it.fields.map((f) => (
            <div key={f.name} className="flex justify-between gap-3">
              <dt className="text-muted">
                {f.label}
                {f.required ? '' : ' (необязательно)'}
              </dt>
              <dd className="truncate font-mono text-xs text-ink">{shown[f.name] ?? <span className="text-faint">—</span>}</dd>
            </div>
          ))}
          <div className="flex justify-end">
            {revealed ? (
              <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                <EyeSlash size={14} /> Скрыть ключи
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => reveal(slot.active!.version)}>
                <Eye size={14} /> Показать ключи целиком
              </Button>
            )}
          </div>
          <div className="flex justify-between gap-3 text-xs text-faint">
            <dt>Отпечаток для сверки</dt>
            <dd className="font-mono">{slot.active.fingerprint}</dd>
          </div>
        </dl>
      ) : null}

      {revealed ? <Revealed it={it} values={revealed} /> : null}

      {pending ? (
        <div className="mt-3 rounded-xl border border-line bg-accent-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-heading">Версия {pending.version} ждёт включения</div>
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
                Проверить
              </Button>
            ) : null}
            <Button size="sm" variant="gold" onClick={() => activate(pending.version)}>
              Включить
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <KeyForm it={it} slot={slot.slot} masked={shown} guarded={guarded} onClose={() => setEditing(false)} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => setEditing(true)}>
            Изменить ключи
          </Button>
          {it.testable && slot.active ? (
            <Button size="sm" variant="ghost" loading={test.isPending} onClick={() => test.mutate(slot.active!.version)}>
              Проверить
            </Button>
          ) : null}
          {slot.active ? (
            <Button size="sm" variant="ghost" onClick={() => void rollback()}>
              Вернуть прошлую
            </Button>
          ) : null}
          <Button size="sm" variant="danger-soft" onClick={() => void remove()}>
            Удалить
          </Button>
        </div>
      )}
    </div>
  );
}

function KeyForm({
  it,
  slot,
  isNew,
  masked = {},
  guarded,
  onClose,
}: {
  it: Integration;
  slot: string;
  isNew?: boolean;
  masked?: Record<string, string>;
  guarded: Guarded;
  onClose: () => void;
}) {
  const toast = useToast();
  const guide = guideFor(it.provider);
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const file = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const set = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  /** Owner 2026-10-06: the rejected field says what is wrong, in Russian. */
  const fieldError = (e: unknown): boolean => {
    if (!(e instanceof ApiError) || e.code !== 'VALIDATION_ERROR') return false;
    const name = e.details?.field;
    const f = it.fields.find((x) => x.name === name);
    if (!f) return false;
    const text = rejectText(f.label, e.details?.reason, guide?.fields[f.name]?.example ?? f.hint);
    setErrors({ [f.name]: text });
    toast.error(text);
    return true;
  };

  /** Fills the fields from a downloaded key file (Firebase service account). Read in the browser only. */
  const loadJson = async (picked: File | undefined) => {
    if (!picked || !guide?.jsonFile) return;
    try {
      const json = JSON.parse(await picked.text()) as Record<string, unknown>;
      const filled: Record<string, string> = {};
      for (const [key, field] of Object.entries(guide.jsonFile.map)) {
        if (typeof json[key] === 'string') filled[field] = json[key];
      }
      if (Object.keys(filled).length === 0) {
        toast.error('В этом файле нет нужных строк. Скачайте файл заново: Project settings → Service accounts → Generate new private key.');
        return;
      }
      setValues((prev) => ({ ...prev, ...filled }));
      setErrors({});
      toast.success('Поля заполнены из файла. Нажмите «Сохранить».');
    } catch {
      toast.error('Это не файл .json от Firebase. Выберите скачанный файл ключа.');
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const save = () =>
    guarded(
      async () => {
        await api.POST('/admin/integrations/{provider}/versions', {
          params: { path: { provider: it.provider } },
          body: { values, slot, ...(isNew && label.trim() ? { label: label.trim() } : {}) },
        });
        onClose();
      },
      { success: 'Сохранено как новая версия — проверьте и включите её', onError: fieldError },
    );
  return (
    <form
      className="mt-3 space-y-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {guide?.jsonFile ? (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void loadJson(e.target.files?.[0])}
          />
          <Button type="button" size="sm" variant="gold" onClick={() => file.current?.click()}>
            <FileArrowUp size={14} /> {guide.jsonFile.button}
          </Button>
          <p className="mt-2 break-words text-xs text-muted">Самый простой способ: выберите скачанный файл — поля заполнятся сами.</p>
        </div>
      ) : null}
      {isNew && slot !== MAIN ? (
        <label className="block text-sm">
          <span className="text-muted">Название (видно только в админке)</span>
          <Input
            className="mt-1"
            maxLength={60}
            placeholder="Например «Запасной аккаунт»"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      ) : null}
      {it.fields.map((f) => {
        const g = guide?.fields[f.name];
        const err = errors[f.name];
        const placeholder = f.secret
          ? masked[f.name]
            ? 'оставьте пустым, чтобы не менять'
            : (g?.example ?? 'вставьте значение')
          : (masked[f.name] ?? g?.example ?? '');
        const common = {
          className: `mt-1 font-mono text-xs ${err ? 'border-danger' : ''}`,
          autoComplete: 'off',
          spellCheck: false,
          placeholder,
          'aria-invalid': err ? true : undefined,
          value: values[f.name] ?? '',
        };
        return (
          <div key={f.name} className="text-sm">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label htmlFor={`${it.provider}-${f.name}`} className="min-w-0 break-words text-muted">
                {f.label}
                {f.required ? '' : ' (необязательно)'}
              </label>
              <span className="flex flex-wrap gap-1">
                {f.secret && !g?.multiline ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={!!visible[f.name]}
                    onClick={() => setVisible((v) => ({ ...v, [f.name]: !v[f.name] }))}
                  >
                    {visible[f.name] ? <EyeSlash size={14} /> : <Eye size={14} />} {visible[f.name] ? 'Скрыть' : 'Показать'}
                  </Button>
                ) : null}
                {g?.generate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      set(f.name, generated(g.generate!));
                      setVisible((v) => ({ ...v, [f.name]: true }));
                    }}
                  >
                    <Sparkle size={14} /> {g.generate === 'whsec' ? 'Сгенерировать временный' : 'Сгенерировать'}
                  </Button>
                ) : null}
              </span>
            </div>
            {g?.multiline ? (
              <Textarea
                id={`${it.provider}-${f.name}`}
                {...common}
                rows={4}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : (
              <Input
                id={`${it.provider}-${f.name}`}
                {...common}
                type={f.secret && !visible[f.name] ? 'password' : 'text'}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {values[f.name] ? <Edges value={values[f.name]} /> : null}
            {err ? (
              <p className="mt-1 break-words text-xs text-danger">{err}</p>
            ) : g ? (
              <p className="mt-1 break-words text-xs text-faint">{g.how}</p>
            ) : f.hint ? (
              <p className="mt-1 break-words text-xs text-faint">Формат: {f.hint}</p>
            ) : null}
          </div>
        );
      })}
      {guide?.webhookPath ? <WebhookBox guide={guide} values={values} /> : null}
      <p className="text-xs text-muted">
        Сохранится как новая версия. Приложение продолжит работать на текущих ключах, пока вы не проверите и не включите новые.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit">Сохранить</Button>
      </div>
    </form>
  );
}

/**
 * Owner 2026-10-06: «откуда начинается и где заканчивается ключ» — under
 * a typed value: its first and last characters and its length, so a
 * half-copied key is visible before saving.
 */
function Edges({ value }: { value: string }) {
  const v = value.trim();
  if (v.length < 12) return null;
  const head = v.slice(0, 12).replace(/\n/g, '⏎');
  const tail = v.slice(-8).replace(/\n/g, '⏎');
  return (
    <p className="mt-1 break-all text-xs text-muted">
      Начало: <code className="text-ink">{head}…</code> · конец: <code className="text-ink">…{tail}</code> · символов: {v.length}
    </p>
  );
}

/** Saved keys in full (owner's eye): each value with a copy button. */
function Revealed({ it, values }: { it: Integration; values: Record<string, string> }) {
  const toast = useToast();
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-gold/40 bg-surface-2 p-3">
      <p className="text-xs text-muted">Видно только вам. Скроется само через минуту.</p>
      {it.fields.map((f) =>
        values[f.name] ? (
          <div key={f.name} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-muted">{f.label}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Скопировать: ${f.label}`}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(values[f.name])
                    .then(() => toast.success('Скопировано целиком'))
                    .catch(() => toast.error('Не удалось скопировать — выделите текст и скопируйте вручную'))
                }
              >
                <Copy size={14} />
              </Button>
            </div>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface p-2 font-mono text-[11px] text-ink">
              {values[f.name]}
            </pre>
          </div>
        ) : null,
      )}
    </div>
  );
}

/** The address to paste at the vendor (Stripe / Bunny webhooks), with a copy button. */
function WebhookBox({ guide, values }: { guide: ProviderGuide; values: Record<string, string> }) {
  const toast = useToast();
  const url = webhookUrl(guide.webhookPath!, values);
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-xs">
      <div className="text-muted">Адрес вебхука (вставить на сайте сервиса после переезда на AWS):</div>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all text-ink">{url}</code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Скопировать адрес"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(url)
              .then(() => toast.success('Адрес скопирован'))
              .catch(() => toast.error('Не удалось скопировать — выделите адрес и скопируйте вручную'))
          }
        >
          <Copy size={14} />
        </Button>
      </div>
    </div>
  );
}

/**
 * Owner 2026-10-06: «Где взять ключи?» — the step-by-step for this service,
 * so the owner adds keys alone. Collapsed by default; opens itself while
 * the service has no keys yet.
 */
function Guide({ it }: { it: Integration }) {
  const guide = guideFor(it.provider);
  const [open, setOpen] = useState(it.slots.length === 0 && it.source !== 'env');
  if (!guide) return null;
  return (
    <div className="mt-3 rounded-xl border border-line">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-heading"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Question size={16} className="shrink-0 text-gold-600" />
          <span className="break-words">Где взять ключи? Пошагово</span>
        </span>
        <CaretDown size={14} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-line px-3 py-3 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5 text-ink">
            {guide.steps.map((step) => (
              <li key={step} className="break-words">
                {step}
              </li>
            ))}
          </ol>
          {guide.note ? <p className="break-words rounded-lg bg-accent-soft p-2 text-xs text-ink">{guide.note}</p> : null}
          {guide.webhookPath ? (
            <p className="break-all text-xs text-muted">
              Адрес вебхука: <code className="text-ink">{webhookUrl(guide.webhookPath, {})}</code>
            </p>
          ) : null}
          {guide.links.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {guide.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-gold-600 hover:underline"
                >
                  {l.label} <ArrowSquareOut size={12} />
                </a>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-faint">Затем нажмите «Добавить ключи» ниже: под каждым полем написано, что именно туда вставить.</p>
        </div>
      ) : null}
    </div>
  );
}

function History({ it }: { it: Integration }) {
  const versions = useQuery({
    queryKey: ['integration-versions', it.provider],
    queryFn: async () =>
      (await api.GET('/admin/integrations/{provider}/versions', { params: { path: { provider: it.provider } } })).data!.data,
  });
  return (
    <FadeIn>
      <ul className="mt-3 space-y-1 text-xs">
        {versions.isPending ? <Skeleton className="h-8" /> : null}
        {versions.error ? <li className="text-danger">{errorText(versions.error)}</li> : null}
        {(versions.data ?? []).map((v: Version) => (
          <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
            <span className="truncate text-ink">
              v{v.version} · {slotName(v)} · <span className="text-muted">{formatDateTime(v.createdAt)}</span>
            </span>
            <Badge tone={v.status === 'active' ? 'success' : v.status === 'pending' ? 'gold' : 'neutral'}>
              {VERSION_STATUS[v.status] ?? v.status}
            </Badge>
          </li>
        ))}
        {versions.data?.length === 0 ? <li className="text-muted">Версий в админке ещё нет.</li> : null}
      </ul>
    </FadeIn>
  );
}
