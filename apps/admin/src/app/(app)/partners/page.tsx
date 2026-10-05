"use client";

import {
  Coins,
  DownloadSimple,
  Handshake,
  HourglassMedium,
  Plus,
  UsersThree,
} from "@phosphor-icons/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Kpi, KpiSkeletons } from "@/components/billing/kpi";
import { fadeUp, LoadMore } from "@/components/billing/shared";
import { CommissionsTable } from "@/components/partners/commissions-table";
import {
  centsToText,
  CLIENT_RULES,
  COMMISSION_STATUSES,
  downloadCommissionsCsv,
  JOIN_MODES,
  PersonCell,
  RateFields,
  textToCents,
  UserPicker,
  type ClientRule,
  type CommissionStatus,
  type JoinMode,
  type PartnerStatus,
  type Picked,
} from "@/components/partners/shared";
import { ErrorNote, PageHeader, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { growthError } from "@/components/growth/errors";
import { api, errorText } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { useMe } from "@/lib/hooks";
import { REASON_MIN, useReasonRequired } from "@/lib/reason-policy";
import {
  CLIENT_RULE,
  COMMISSION_STATUS,
  JOIN_MODE,
  PARTNER_STATUS,
  StatusPill,
  usd,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

type Settings = components["schemas"]["PartnerSettingsDto"];
type Tab = "partners" | "commissions";
type StatusTab = "all" | PartnerStatus;

/** Partner program: who brings attorneys and clients, what they are paid. */
export default function PartnersPage() {
  const { data: me } = useMe();
  const canWrite = me?.role === "super_admin" || me?.role === "finance";
  const canOpenUsers =
    me?.role === "super_admin" ||
    me?.role === "support" ||
    me?.role === "finance" ||
    me?.role === "moderator";
  const [tab, setTab] = useState<Tab>("partners");

  const stats = useQuery({
    queryKey: ["partners-stats"],
    queryFn: async () => (await api.GET("/admin/partners/stats")).data!.data,
  });
  const settings = useQuery({
    queryKey: ["partners-settings"],
    queryFn: async () => (await api.GET("/admin/partners/settings")).data!.data,
  });

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Партнёры"
        subtitle="Блогеры и агенты приводят адвокатов и клиентов по своей ссылке. Вы платите за результат: адвокат купил подписку, клиент нанял адвоката. Ставки свои у каждого партнёра."
      />

      <motion.div {...fadeUp(0)}>
        <Card className="mb-6 p-5">
          <h3 className="font-medium text-heading">Как это работает</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
            <li>
              Вы делаете любого пользователя партнёром и задаёте ему ставки:
              за адвоката, за клиента, при желании — оклад в месяц.
            </li>
            <li>
              Партнёр делится своей ссылкой или кодом. Кто зарегистрировался
              и ввёл код — закрепляется за ним и виден в его профиле.
            </li>
            <li>
              Начисление появляется только по факту: адвокат оплатил первый
              счёт подписки (после пробного периода), клиент нанял адвоката
              (или опубликовал кейс — условие настраивается).
            </li>
            <li>
              Начисление {settings.data?.holdDays ?? 14} дней «на проверке»
              (защита от накрутки и возвратов), затем — «к выплате». Возврат
              платежа или отклонённое приглашение отменяют начисление.
            </li>
            <li>
              Вы выплачиваете одной кнопкой на странице партнёра и отмечаете
              номер перевода; партнёр получает уведомление. CSV — для
              бухгалтерии.
            </li>
          </ol>
        </Card>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isPending ? (
          <KpiSkeletons n={4} />
        ) : stats.data ? (
          <>
            <Kpi
              i={0}
              icon={Handshake}
              title="Партнёров"
              value={stats.data.partners}
              hint={`активных: ${stats.data.active}${stats.data.pending > 0 ? ` · заявок: ${stats.data.pending}` : ""}`}
            />
            <Kpi
              i={1}
              icon={UsersThree}
              title="Привели людей"
              value={stats.data.referredCount}
            />
            <Kpi
              i={2}
              icon={HourglassMedium}
              title="К выплате"
              value={stats.data.approvedCents}
              format={(n) => usd(n)}
              hint={`на проверке: ${usd(stats.data.heldCents)}`}
              gold
            />
            <Kpi
              i={3}
              icon={Coins}
              title="Выплачено всего"
              value={stats.data.paidCents}
              format={(n) => usd(n)}
              hint={`начислено за месяц: ${usd(stats.data.thisMonthCents)}`}
            />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <div className="mt-8 mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "partners" as Tab, label: "Партнёры" },
            { value: "commissions" as Tab, label: "Начисления" },
          ]}
        />
      </div>

      {tab === "partners" ? (
        <PartnersList canWrite={canWrite} canOpenUsers={canOpenUsers} />
      ) : (
        <AllCommissions canWrite={canWrite} canOpenUsers={canOpenUsers} />
      )}

      <SectionTitle>Настройки программы</SectionTitle>
      {settings.isPending ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : settings.data ? (
        <SettingsForm
          key={JSON.stringify(settings.data)}
          initial={settings.data}
          canEdit={me?.role === "super_admin"}
        />
      ) : (
        <ErrorNote
          text={settings.error ? errorText(settings.error) : "Не удалось загрузить настройки"}
        />
      )}
    </>
  );
}

function PartnersList({
  canWrite,
  canOpenUsers,
}: {
  canWrite: boolean;
  canOpenUsers: boolean;
}) {
  const [status, setStatus] = useState<StatusTab>("all");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const list = useInfiniteQuery({
    queryKey: ["partners", status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET("/admin/partners", {
          params: {
            query: {
              cursor: pageParam,
              status: status === "all" ? undefined : status,
              q: q || undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const cols = 6;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[
            { value: "all" as StatusTab, label: "Все" },
            { value: "pending" as StatusTab, label: "Заявки" },
            { value: "active" as StatusTab, label: PARTNER_STATUS.active },
            { value: "paused" as StatusTab, label: PARTNER_STATUS.paused },
            { value: "ended" as StatusTab, label: PARTNER_STATUS.ended },
          ]}
        />
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(draft.trim());
            }}
          >
            <Input
              placeholder="Имя, email, метка или код"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-64"
            />
          </form>
          {canWrite ? (
            <Button onClick={() => setCreating((v) => !v)}>
              <Plus size={16} /> Добавить партнёра
            </Button>
          ) : null}
        </div>
      </div>

      {creating && canWrite ? (
        <CreatePartnerCard onDone={() => setCreating(false)} />
      ) : null}

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Партнёров пока нет"
          text="Добавьте блогера или агента — любого пользователя приложения — и задайте ему ставки."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Партнёр</Th>
              <Th>Код</Th>
              <Th>Ставки</Th>
              <Th>Привёл</Th>
              <Th>Деньги</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link
                      href={`/partners/${p.id}`}
                      className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline"
                    >
                      {p.label || p.user.name || p.user.email || p.id.slice(0, 8)}
                    </Link>
                    <div className="mt-0.5">
                      <PersonCell u={p.user} role={p.user.role} link={canOpenUsers} />
                    </div>
                  </Td>
                  <Td className="font-mono text-xs text-ink">{p.code}</Td>
                  <Td className="text-xs text-muted">
                    адвокат {usd(p.rates.attorneyRateCents)} · клиент{" "}
                    {usd(p.rates.clientRateCents)}
                    {p.rates.monthlyBaseCents > 0
                      ? ` · ${usd(p.rates.monthlyBaseCents)}/мес`
                      : ""}
                    <div className="text-faint">
                      {CLIENT_RULE[p.rates.clientRule]} · проверка {p.rates.holdDays} дн.
                    </div>
                  </Td>
                  <Td className="text-xs text-muted">
                    {p.totals.referredCount} чел.
                    <div className="text-faint">выполнили условие: {p.totals.qualifiedCount}</div>
                  </Td>
                  <Td className="text-xs text-muted">
                    к выплате <span className="text-ink">{usd(p.totals.approvedCents)}</span>
                    <div className="text-faint">
                      на проверке {usd(p.totals.heldCents)} · выплачено {usd(p.totals.paidCents)}
                    </div>
                  </Td>
                  <Td>
                    <StatusPill map={PARTNER_STATUS} value={p.status} />
                    <div className="mt-1 text-xs text-faint">{formatDateTime(p.createdAt)}</div>
                    {p.status === "pending" && canWrite ? (
                      <JoinDecision id={p.id} />
                    ) : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
    </>
  );
}

/** Owner 2026-10-05: a self-enrolment request — approve (the link starts
 * working, the person is told) or decline (ended; told as well). */
function JoinDecision({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const decide = useMutation({
    mutationFn: async (status: "active" | "ended") =>
      (
        await api.PATCH("/admin/partners/{id}", {
          params: { path: { id } },
          body: {
            status,
            reason:
              status === "active"
                ? "Заявка на участие одобрена из админки"
                : "Заявка на участие отклонена из админки",
          },
        })
      ).data!.data,
    onSuccess: (_, status) => {
      toast.success(status === "active" ? "Партнёр подключён" : "Заявка отклонена");
      void qc.invalidateQueries({ queryKey: ["partners"] });
      void qc.invalidateQueries({ queryKey: ["partners-stats"] });
    },
    onError: (e) => toast.error(growthError(e)),
  });
  return (
    <div className="mt-2 flex gap-1.5">
      <Button
        size="sm"
        disabled={decide.isPending}
        onClick={() => decide.mutate("active")}
      >
        Одобрить
      </Button>
      <Button
        size="sm"
        variant="danger-soft"
        disabled={decide.isPending}
        onClick={() => decide.mutate("ended")}
      >
        Отклонить
      </Button>
    </div>
  );
}

function CreatePartnerCard({ onDone }: { onDone: () => void }) {
  // Owner 2026-10-05: a reason only where «Обязательная причина» says so.
  const reasonNeeded = useReasonRequired("money");
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: ["partners-settings"],
    queryFn: async () => (await api.GET("/admin/partners/settings")).data!.data,
  });
  const [picked, setPicked] = useState<Picked | null>(null);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [rates, setRates] = useState({
    attorney: "",
    client: "",
    base: "",
    rule: "" as "" | ClientRule,
    hold: "",
  });
  const cleanCode = code.replace(/[\s-]/g, "").toUpperCase();
  const codeOk = cleanCode === "" || /^[A-Z0-9]{4,24}$/.test(cleanCode);
  const ratesOk =
    (rates.attorney === "" || textToCents(rates.attorney) !== null) &&
    (rates.client === "" || textToCents(rates.client) !== null) &&
    (rates.base === "" || textToCents(rates.base) !== null);
  const valid = !!picked && codeOk && ratesOk && (!reasonNeeded || reason.trim().length >= REASON_MIN);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST("/admin/partners", {
          body: {
            userId: picked!.id,
            label: label.trim() || null,
            note: note.trim() || null,
            code: cleanCode || undefined,
            attorneyRateCents:
              rates.attorney === "" ? null : textToCents(rates.attorney),
            clientRateCents: rates.client === "" ? null : textToCents(rates.client),
            monthlyBaseCents: rates.base === "" ? 0 : (textToCents(rates.base) ?? 0),
            clientRule: rates.rule === "" ? null : rates.rule,
            holdDays: rates.hold === "" ? null : Number(rates.hold),
            reason: reason.trim(),
          },
        })
      ).data!.data,
    onSuccess: (row) => {
      toast.success(`${row.label || row.user.name || "Партнёр"} добавлен, код ${row.code}`);
      void qc.invalidateQueries({ queryKey: ["partners"] });
      void qc.invalidateQueries({ queryKey: ["partners-stats"] });
      onDone();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <Card className="mb-5 p-5">
      <h3 className="font-medium text-heading">Новый партнёр</h3>
      <p className="mt-1 text-sm text-muted">
        Любой аккаунт приложения: адвокат, клиент, помощник или человек,
        которого вы пригласили. Пустая ставка = как в настройках программы.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Кто" htmlFor="np-user">
          <UserPicker id="np-user" picked={picked} onPick={setPicked} />
        </Field>
        <Field label="Метка (для вас)" htmlFor="np-label" hint="например «блогер Иван, YouTube»">
          <Input id="np-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Свой код (необязательно)" htmlFor="np-code" hint="4–24 латинские буквы или цифры">
          <Input
            id="np-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="uppercase"
            placeholder="IVAN2026"
          />
        </Field>
      </div>
      <div className="mt-4">
        <RateFields
          prefix="np"
          values={rates}
          onChange={(v) => setRates((r) => ({ ...r, ...v }))}
          defaults={settings.data ?? null}
        />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Заметка" htmlFor="np-note" hint="условия договорённости, контакты">
          <Textarea id="np-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Причина для журнала" htmlFor="np-reason" hint={reasonNeeded ? `не меньше ${REASON_MIN} символов` : "необязательно"}>
          <Textarea id="np-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
        <Button disabled={!valid || create.isPending} loading={create.isPending} onClick={() => create.mutate()}>
          Добавить
        </Button>
      </div>
    </Card>
  );
}

function AllCommissions({
  canWrite,
  canOpenUsers,
}: {
  canWrite: boolean;
  canOpenUsers: boolean;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | CommissionStatus>("all");
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useInfiniteQuery({
    queryKey: ["partner-commissions", status, period],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET("/admin/partners/commissions", {
          params: {
            query: {
              cursor: pageParam,
              status: status === "all" ? undefined : status,
              period: /^\d{4}-\d{2}$/.test(period) ? period : undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[
            { value: "all" as const, label: "Все" },
            ...COMMISSION_STATUSES.map((s) => ({ value: s, label: COMMISSION_STATUS[s] })),
          ]}
        />
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-44"
            aria-label="Период"
          />
          {canWrite ? (
            <Button
              variant="outline"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const name = await downloadCommissionsCsv({
                    status: status === "all" ? undefined : status,
                    period: /^\d{4}-\d{2}$/.test(period) ? period : undefined,
                  });
                  toast.success(`Файл ${name} скачан`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Не удалось скачать CSV");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <DownloadSimple size={16} weight="light" /> CSV
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <CommissionsTable
        rows={rows}
        loading={list.isPending}
        canWrite={canWrite}
        canOpenUsers={canOpenUsers}
        showPartner
      />
      <LoadMore q={list} />
    </>
  );
}

function SettingsForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [joinMode, setJoinMode] = useState<JoinMode>(initial.joinMode ?? "open");
  const [attorney, setAttorney] = useState(centsToText(initial.attorneyRateCents));
  const [client, setClient] = useState(centsToText(initial.clientRateCents));
  const [rule, setRule] = useState<ClientRule>(initial.clientRule);
  const [hold, setHold] = useState(String(initial.holdDays));
  // Owner 2026-10-05 (legal): a W-9 (or W-8) before the first payout.
  const [requireW9, setRequireW9] = useState(initial.requireW9 ?? true);
  const [texts, setTexts] = useState(initial.texts);
  const attorneyCents = textToCents(attorney);
  const clientCents = textToCents(client);
  const holdDays = /^\d+$/.test(hold) ? Number(hold) : null;
  const valid = attorneyCents !== null && clientCents !== null && holdDays !== null && holdDays <= 180;

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PUT("/admin/partners/settings", {
          body: {
            enabled,
            joinMode,
            attorneyRateCents: attorneyCents ?? 0,
            clientRateCents: clientCents ?? 0,
            clientRule: rule,
            holdDays: holdDays ?? 14,
            requireW9,
            texts,
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success("Настройки сохранены");
      void qc.invalidateQueries({ queryKey: ["partners-settings"] });
      void qc.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const text = (lang: "en" | "ru", key: "title" | "summary") => (
    <Field
      key={`${lang}-${key}`}
      label={`${key === "title" ? "Заголовок" : "Описание"} (${lang.toUpperCase()})`}
      htmlFor={`ps-${lang}-${key}`}
    >
      {key === "title" ? (
        <Input
          id={`ps-${lang}-${key}`}
          value={texts[lang][key]}
          disabled={!canEdit}
          maxLength={80}
          onChange={(e) =>
            setTexts((t) => ({ ...t, [lang]: { ...t[lang], [key]: e.target.value } }))
          }
        />
      ) : (
        <Textarea
          id={`ps-${lang}-${key}`}
          rows={3}
          value={texts[lang][key]}
          disabled={!canEdit}
          maxLength={600}
          onChange={(e) =>
            setTexts((t) => ({ ...t, [lang]: { ...t[lang], [key]: e.target.value } }))
          }
        />
      )}
    </Field>
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-heading">Ставки по умолчанию</h3>
          <p className="mt-1 text-sm text-muted">
            Действуют для партнёров без своих ставок. Выключенная программа
            останавливает новые начисления, уже начисленное остаётся.
          </p>
        </div>
        <Switch checked={enabled} onChange={setEnabled} disabled={!canEdit} label={enabled ? "Включена" : "Выключена"} />
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-3">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-heading">Подключение из приложения</p>
          <p className="mt-1 text-sm text-muted">
            Адвокаты и клиенты видят раздел «Партнёрская программа» в настройках
            и берут ссылку сами по ставкам по умолчанию. «По заявке» — заявка
            ждёт одобрения здесь (вкладка «Заявки»), ссылка заработает после
            него. «Только админ» — партнёров добавляете только вы; уже
            подключённые продолжают работать.
          </p>
        </div>
        <Field label="Режим" htmlFor="ps-join">
          <Select
            id="ps-join"
            value={joinMode}
            disabled={!canEdit || !enabled}
            onChange={(e) => setJoinMode(e.target.value as JoinMode)}
          >
            {JOIN_MODES.map((m) => (
              <option key={m} value={m}>
                {JOIN_MODE[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="За адвоката, $" htmlFor="ps-att" hint="первый оплаченный счёт подписки">
          <Input id="ps-att" inputMode="decimal" value={attorney} disabled={!canEdit} onChange={(e) => setAttorney(e.target.value)} />
        </Field>
        <Field label="За клиента, $" htmlFor="ps-cl">
          <Input id="ps-cl" inputMode="decimal" value={client} disabled={!canEdit} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field
          label="Условие по клиенту"
          htmlFor="ps-rule"
          hint="Рекомендуется «опубликовал кейс»: выплата партнёру не должна зависеть от найма адвоката (законы о посредниках, CA §6152 / TX §38.12)"
        >
          <Select id="ps-rule" value={rule} disabled={!canEdit} onChange={(e) => setRule(e.target.value as ClientRule)}>
            {CLIENT_RULES.map((r) => (
              <option key={r} value={r}>
                {CLIENT_RULE[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Проверка, дней" htmlFor="ps-hold" hint="0 — к выплате сразу, до 180">
          <Input id="ps-hold" inputMode="numeric" value={hold} disabled={!canEdit} onChange={(e) => setHold(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-3">
        <Switch checked={requireW9} onChange={setRequireW9} disabled={!canEdit} label="Требовать W-9 до первой выплаты" />
        <div>
          <p className="text-sm font-medium text-heading">Требовать W-9 до первой выплаты</p>
          <p className="mt-1 text-sm text-muted">
            Партнёр — независимый подрядчик: от $600 в год нужна форма 1099-NEC, а для неё — W-9 (W-8 для нерезидентов). Пока форма не отмечена полученной на странице партнёра, кнопка «Выплатить» не сработает.
          </p>
        </div>
      </div>
      <h4 className="mt-6 text-sm font-medium text-heading">Что видит партнёр в приложении</h4>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {text("ru", "title")}
        {text("en", "title")}
        {text("ru", "summary")}
        {text("en", "summary")}
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
