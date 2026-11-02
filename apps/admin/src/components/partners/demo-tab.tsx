"use client";

import {
  ArrowsClockwise,
  Check,
  Copy,
  Flask,
  Key,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useConfirm } from "@/components/legacy/confirm";
import { ErrorNote, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { errorText } from "@/lib/api/client";
import {
  DEMO_ROLES,
  demoApi,
  type AdminDemoAccountDto,
  type DemoRole,
  type DemoSettingsDto,
  type DemoStatusDto,
} from "@/lib/api/demo";
import { ROLE_TEXT, label as labelOf } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

const PAGE = 20;

/** Деньги → Партнёры → «Демо-доступ» (docs/ops/demo-world.md). */
export function DemoTab({
  canWrite,
  isSuper,
}: {
  /** super_admin / finance: settings, accounts, codes. */
  canWrite: boolean;
  /** super_admin only: «Сбросить демо-мир». */
  isSuper: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<ShownCode | null>(null);

  const status = useQuery({ queryKey: ["demo-status"], queryFn: demoApi.status });
  const settings = useQuery({ queryKey: ["demo-settings"], queryFn: demoApi.settings });
  const accounts = useQuery({
    queryKey: ["demo-accounts", q, page],
    queryFn: () => demoApi.accounts({ q: q || undefined, page, limit: PAGE }),
  });
  const refreshAccounts = () => {
    void qc.invalidateQueries({ queryKey: ["demo-accounts"] });
    void qc.invalidateQueries({ queryKey: ["demo-status"] });
  };

  const reset = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: "Сбросить демо-мир?",
        description:
          "Демо-база будет очищена и заполнена заново. Все демо-аккаунты партнёров и блогеров удалятся, их коды перестанут работать. Настоящие данные не затрагиваются.",
        confirm: "Сбросить",
        danger: true,
      });
      if (!ok) return false;
      await demoApi.reset();
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success("Демо-мир сбрасывается — это займёт около минуты");
      refreshAccounts();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const newInvite = useMutation({
    mutationFn: async (a: AdminDemoAccountDto) => ({
      a,
      r: await demoApi.newInvite(a.id),
    }),
    onSuccess: ({ a, r }) => {
      setShown({ code: r.inviteCode, expiresAt: r.inviteExpiresAt, name: a.displayName });
      refreshAccounts();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const remove = useMutation({
    mutationFn: async (a: AdminDemoAccountDto) => {
      const ok = await confirm({
        title: `Удалить демо-аккаунт «${a.displayName}»?`,
        description: "Демо-пользователь и все его данные удалятся, код для входа перестанет работать.",
        confirm: "Удалить",
        danger: true,
      });
      if (!ok) return false;
      await demoApi.deleteAccount(a.id);
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success("Демо-аккаунт удалён");
      refreshAccounts();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const rows = accounts.data?.items ?? [];
  const total = accounts.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cols = canWrite ? 8 : 7;

  return (
    <>
      {confirmDialog}
      {shown ? <CodeDialog shown={shown} onClose={() => setShown(null)} /> : null}
      {creating ? (
        <CreateDemoDialog
          onClose={() => setCreating(false)}
          onCreated={(code, name) => {
            setCreating(false);
            refreshAccounts();
            if (code) setShown({ code, expiresAt: null, name });
            else toast.success(`Демо-аккаунт «${name}» создан`);
          }}
        />
      ) : null}

      <Card className="mb-6 p-5">
        <h3 className="font-medium text-heading">Что это</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Партнёр с демо-доступом создаёт в приложении до нескольких демо-аккаунтов (клиент,
          адвокат, помощник) и показывает LawBid подписчикам, не трогая настоящие данные: демо
          живёт в отдельной базе. Блогеру без аккаунта вы создаёте демо-аккаунт здесь и выдаёте
          8-значный код — он вводит его на экране входа. Неактивные демо-аккаунты удаляются сами.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <StatusCard
            s={status.data}
            pending={status.isPending}
            error={status.error}
            isSuper={isSuper}
            resetting={reset.isPending}
            onReset={() => reset.mutate()}
          />
        </div>
        <div className="lg:col-span-3">
          {settings.isPending ? (
            <Skeleton className="h-80 rounded-[var(--radius-lg)]" />
          ) : settings.data ? (
            <SettingsCard
              key={JSON.stringify(settings.data)}
              initial={settings.data}
              canEdit={canWrite}
            />
          ) : (
            <ErrorNote text={settings.error ? errorText(settings.error) : "Не удалось загрузить настройки"} />
          )}
        </div>
      </div>

      <SectionTitle
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Демо-аккаунт для блогера
            </Button>
          ) : null
        }
      >
        Демо-аккаунты{total ? ` (${total})` : ""}
      </SectionTitle>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(draft.trim());
          }}
        >
          <Input
            placeholder="Имя, метка или кто создал"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-64"
          />
        </form>
        {pages > 1 ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Назад
            </Button>
            <span>
              {page} / {pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Вперёд
            </Button>
          </div>
        ) : null}
      </div>
      <ErrorNote text={accounts.error ? errorText(accounts.error) : null} />
      {!accounts.isPending && !accounts.error && rows.length === 0 ? (
        <EmptyState
          icon={Flask}
          title={q ? "Ничего не найдено" : "Демо-аккаунтов пока нет"}
          text={
            q
              ? "Попробуйте другой запрос."
              : "Их создают партнёры с демо-доступом из приложения — или вы, для блогера без аккаунта."
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Роль</Th>
              <Th>Имя</Th>
              <Th>Кто создал</Th>
              <Th>Метка</Th>
              <Th>Активность</Th>
              <Th>Удалится</Th>
              <Th>Код</Th>
              {canWrite ? <Th className="text-right">Действия</Th> : null}
            </tr>
          </thead>
          <tbody>
            {accounts.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((a) => (
                <tr key={a.id}>
                  <Td className="text-xs text-muted">{labelOf(ROLE_TEXT, a.role)}</Td>
                  <Td>
                    <div className="font-medium text-ink">{a.displayName}</div>
                    <div className="text-xs text-faint">создан {formatDateTime(a.createdAt)}</div>
                  </Td>
                  <Td className="text-xs text-muted">
                    <div className="max-w-[200px] truncate text-ink" title={a.createdBy.name}>
                      {a.createdBy.name}
                    </div>
                    <div className="text-faint">{a.createdBy.kind === "admin" ? "админ" : "партнёр"}</div>
                  </Td>
                  <Td className="max-w-[220px] truncate text-xs text-muted" title={a.label ?? undefined}>
                    {a.label || "—"}
                  </Td>
                  <Td className="text-xs text-muted">
                    {a.lastSeenAt ? formatDateTime(a.lastSeenAt) : "ещё не входил"}
                  </Td>
                  <Td className="text-xs text-muted">{formatDateTime(a.expiresAt)}</Td>
                  <Td>
                    {a.hasInvite ? (
                      <>
                        <Badge tone="gold">есть</Badge>
                        {a.inviteExpiresAt ? (
                          <div className="mt-1 text-xs text-faint">до {formatDateTime(a.inviteExpiresAt)}</div>
                        ) : null}
                      </>
                    ) : (
                      <Badge>нет</Badge>
                    )}
                  </Td>
                  {canWrite ? (
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Выдать новый код для входа; старый перестанет работать"
                          disabled={newInvite.isPending}
                          onClick={() => newInvite.mutate(a)}
                        >
                          <Key size={14} weight="light" /> Новый код
                        </Button>
                        <Button
                          size="sm"
                          variant="danger-soft"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(a)}
                        >
                          <Trash size={14} weight="light" /> Удалить
                        </Button>
                      </div>
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </>
  );
}

function StatusCard({
  s,
  pending,
  error,
  isSuper,
  resetting,
  onReset,
}: {
  s: DemoStatusDto | undefined;
  pending: boolean;
  error: unknown;
  isSuper: boolean;
  resetting: boolean;
  onReset: () => void;
}) {
  return (
    <Card className="h-full p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-heading">Демо-база</h3>
          <p className="mt-1 text-sm text-muted">Отдельная база, настоящие данные не затрагиваются.</p>
        </div>
        {pending ? (
          <Skeleton className="h-6 w-24 rounded-full" />
        ) : s ? (
          s.ready ? (
            <Badge tone="success" dot>
              готова
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              не готова
            </Badge>
          )
        ) : null}
      </div>
      {pending ? (
        <Skeleton className="mt-4 h-32 rounded-[var(--radius-md)]" />
      ) : s ? (
        <>
          {!s.ready && s.reason ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {s.reason}
            </div>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Row k="Демо-аккаунтов" v={String(s.accounts)} />
            <Row k="База" v={s.databaseName} mono />
            <Row
              k="Миграции"
              v={`${s.migrationsApplied} применено${s.migrationsPending > 0 ? ` · ${s.migrationsPending} ждут` : ""}`}
            />
            <Row k="Последний сброс" v={s.lastResetAt ? formatDateTime(s.lastResetAt) : "не было"} />
            <Row k="Последняя чистка" v={s.lastSweepAt ? formatDateTime(s.lastSweepAt) : "не было"} />
          </dl>
        </>
      ) : (
        <ErrorNote text={error ? errorText(error) : "Не удалось получить состояние"} />
      )}
      {isSuper ? (
        <div className="mt-5 flex justify-end">
          <Button variant="danger-soft" loading={resetting} disabled={resetting} onClick={onReset}>
            <ArrowsClockwise size={16} weight="light" /> Сбросить демо-мир
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-faint">{k}</dt>
      <dd className={mono ? "truncate font-mono text-xs text-ink" : "text-ink"} title={v}>
        {v}
      </dd>
    </div>
  );
}

function SettingsCard({ initial, canEdit }: { initial: DemoSettingsDto; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [ttl, setTtl] = useState(String(initial.ttlDays));
  const [max, setMax] = useState(String(initial.maxAccountsPerPartner));
  const [autoClean, setAutoClean] = useState(initial.autoClean);
  const [quota, setQuota] = useState(String(initial.uploadQuotaMb));
  const [banner, setBanner] = useState(initial.bannerText);
  const ttlDays = /^\d+$/.test(ttl) ? Number(ttl) : null;
  const maxAccounts = /^\d+$/.test(max) ? Number(max) : null;
  const quotaMb = /^\d+$/.test(quota) ? Number(quota) : null;
  const valid =
    ttlDays !== null &&
    ttlDays >= 1 &&
    ttlDays <= 60 &&
    maxAccounts !== null &&
    maxAccounts <= 20 &&
    quotaMb !== null &&
    quotaMb >= 1 &&
    banner.ru.trim().length > 0 &&
    banner.en.trim().length > 0;

  const save = useMutation({
    mutationFn: () =>
      demoApi.saveSettings({
        enabled,
        ttlDays: ttlDays ?? 7,
        maxAccountsPerPartner: maxAccounts ?? 5,
        autoClean,
        uploadQuotaMb: quotaMb ?? 20,
        bannerText: { ru: banner.ru.trim(), en: banner.en.trim() },
      }),
    onSuccess: () => {
      toast.success("Настройки демо сохранены");
      void qc.invalidateQueries({ queryKey: ["demo-settings"] });
      void qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const num = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    hint: string,
  ) => (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        disabled={!canEdit}
        onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
      />
    </Field>
  );

  return (
    <Card className="h-full p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-heading">Настройки демо</h3>
          <p className="mt-1 text-sm text-muted">
            Выключенный демо-режим закрывает вход во все демо-аккаунты; сами аккаунты остаются.
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={setEnabled}
          disabled={!canEdit}
          label={enabled ? "Демо-режим включён" : "Демо-режим выключен"}
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {num("ds-ttl", "Жизнь без активности, дней", ttl, setTtl, "1–60; потом аккаунт удаляется")}
        {num("ds-max", "Аккаунтов на партнёра", max, setMax, "0–20")}
        {num("ds-quota", "Файлы, МБ на аккаунт", quota, setQuota, "лимит загрузок в демо")}
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-3">
        <div>
          <p className="text-sm font-medium text-heading">Автоочистка</p>
          <p className="mt-0.5 text-xs text-muted">Удалять демо-аккаунты, в которые не входили дольше срока жизни.</p>
        </div>
        <Switch checked={autoClean} onChange={setAutoClean} disabled={!canEdit} label="Автоочистка" />
      </div>
      <h4 className="mt-5 text-sm font-medium text-heading">Плашка в приложении</h4>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {(["ru", "en"] as const).map((lang) => (
          <Field key={lang} label={`Текст (${lang.toUpperCase()})`} htmlFor={`ds-banner-${lang}`}>
            <Textarea
              id={`ds-banner-${lang}`}
              rows={2}
              className="min-h-16"
              value={banner[lang]}
              disabled={!canEdit}
              maxLength={120}
              onChange={(e) => setBanner((b) => ({ ...b, [lang]: e.target.value }))}
            />
          </Field>
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
  );
}

type ShownCode = { code: string; expiresAt: string | null; name: string };

/** The invite code, shown once (the server does not keep it in clear). */
function CodeDialog({ shown, onClose }: { shown: ShownCode; onClose: () => void }) {
  const [done, setDone] = useState(false);
  const code = shown.code.toUpperCase();
  const pretty = code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="Код для входа"
      title={shown.name}
      description={
        <>
          Передайте код блогеру: он вводит его на экране входа («У меня есть демо-код»). Код
          показывается <b>один раз</b> — потом можно только выдать новый.
          {shown.expiresAt ? ` Действует до ${formatDateTime(shown.expiresAt)}.` : ""}
        </>
      }
    >
      <div className="rounded-[var(--radius-md)] bg-canvas px-4 py-5 text-center font-mono text-3xl tracking-[0.3em] text-ink select-all">
        {pretty}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            });
          }}
        >
          {done ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          {done ? "Скопировано" : "Скопировать"}
        </Button>
        <Button type="button" autoFocus onClick={onClose}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}

/** «Создать демо-аккаунт для блогера» (§8). */
function CreateDemoDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (inviteCode: string | null, name: string) => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<DemoRole>("attorney");
  const [label, setLabel] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [withInvite, setWithInvite] = useState(true);
  const create = useMutation({
    mutationFn: () =>
      demoApi.createAccount({
        role,
        label: label.trim() || undefined,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        withInvite,
      }),
    onSuccess: (r) => onCreated(r.inviteCode, r.account.displayName),
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Демо-аккаунт для блогера"
      description="Для человека без аккаунта LawBid. Адвокат приходит уже верифицированным с подпиской, помощник — прикреплён к демо-адвокату, клиент — с профилем."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Роль" htmlFor="cd-role">
          <Select id="cd-role" value={role} onChange={(e) => setRole(e.target.value as DemoRole)}>
            {DEMO_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_TEXT[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Метка (для вас)" htmlFor="cd-label" hint="например «блогер Иван, фотоблог»">
          <Input id="cd-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя в демо" htmlFor="cd-first" hint="необязательно">
            <Input id="cd-first" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Фамилия в демо" htmlFor="cd-last" hint="необязательно">
            <Input id="cd-last" value={lastName} maxLength={60} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-3">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--color-gold,#c9a24a)]"
            checked={withInvite}
            onChange={(e) => setWithInvite(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-heading">Выдать код для входа</span>
            <span className="block text-xs text-muted">8 символов, покажем один раз после создания.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={create.isPending} disabled={create.isPending}>
            Создать
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
