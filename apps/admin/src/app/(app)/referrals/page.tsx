"use client";

import {
  CheckCircle,
  Coins,
  Gift,
  MagnifyingGlass,
  Prohibit,
  RocketLaunch,
  ShareNetwork,
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
import { useEffect, useState } from "react";
import { Kpi, KpiSkeletons } from "@/components/billing/kpi";
import { fadeUp, LoadMore, plural } from "@/components/billing/shared";
import { ErrorNote, PageHeader } from "@/components/page-header";
import { useReason } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CodesCard } from "@/components/referrals/codes-card";
import { Switch } from "@/components/ui/switch";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { growthError } from "@/components/growth/errors";
import { api, errorText } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { useMe } from "@/lib/hooks";
import {
  label,
  REFERRAL_STATUS,
  ROLE_TEXT,
  StatusPill,
  usd,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

type Referral = components["schemas"]["AdminReferralRowDto"];
type ReferralStatus = components["schemas"]["ReferralStatus"];
type Reward = components["schemas"]["ReferralRewardDto"];
type RewardType = components["schemas"]["ReferralRewardType"];
type Settings = components["schemas"]["ReferralSettingsDto"];
type Tab = "all" | ReferralStatus;
type Action = "qualify" | "reward" | "reject";
type Section = "invites" | "settings" | "codes";
const SECTIONS: Section[] = ["invites", "settings", "codes"];
const SECTION_KEY = "admin.referrals.section";

/** ?tab=settings deep link, else the last tab this admin opened. */
function initialSection(): Section {
  if (typeof window === "undefined") return "invites";
  const fromUrl = new URLSearchParams(window.location.search).get("tab");
  if (SECTIONS.includes(fromUrl as Section)) return fromUrl as Section;
  try {
    const saved = window.localStorage.getItem(SECTION_KEY);
    if (SECTIONS.includes(saved as Section)) return saved as Section;
  } catch {
    // storage blocked: default tab
  }
  return "invites";
}

function rememberSection(s: Section) {
  try {
    window.localStorage.setItem(SECTION_KEY, s);
  } catch {
    // storage blocked: nothing to remember
  }
}

const STATUSES: ReferralStatus[] = [
  "pending",
  "qualified",
  "rewarded",
  "rejected",
];

const REWARD_TYPE: Record<RewardType, string> = {
  balance_cents: "деньги на баланс",
  percent_first_invoice: "скидка на первый счёт",
  promotion_days: "дни продвижения кейса",
};

/** Reward slots and the types the server accepts for each (referrals.settings.ts). */
const SLOTS: {
  key:
    | "attorneyReferrerReward"
    | "attorneyRefereeReward"
    | "clientReferrerReward"
    | "clientRefereeReward";
  title: string;
  hint: string;
  types: RewardType[];
}[] = [
  {
    key: "attorneyReferrerReward",
    title: "Адвокат, который пригласил",
    hint: "Начисляется на баланс в Stripe и уходит в оплату подписки.",
    types: ["balance_cents"],
  },
  {
    key: "attorneyRefereeReward",
    title: "Приглашённый адвокат",
    hint: "Скидка на первый месяц подписки.",
    types: ["percent_first_invoice", "balance_cents"],
  },
  {
    key: "clientReferrerReward",
    title: "Клиент, который пригласил",
    hint: "Бесплатные дни продвижения кейса.",
    types: ["promotion_days"],
  },
  {
    key: "clientRefereeReward",
    title: "Приглашённый клиент",
    hint: "Бесплатные дни продвижения кейса.",
    types: ["promotion_days"],
  },
];

const MAX_VALUE: Record<RewardType, number> = {
  balance_cents: 100_000,
  percent_first_invoice: 100,
  promotion_days: 30,
};

function rewardText(r: Reward): string {
  if (r.type === "balance_cents") return `${usd(r.value)} на баланс`;
  if (r.type === "percent_first_invoice") return `−${r.value}% на первый счёт`;
  return `${daysText(exact(r))} продвижения`;
}

/** Referral program: how it works, stats, list with actions, settings. */
export default function ReferralsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = me?.role === "super_admin" || me?.role === "finance";
  const canOpenUsers =
    me?.role === "super_admin" ||
    me?.role === "support" ||
    me?.role === "finance" ||
    me?.role === "moderator";
  const { ask, dialog } = useReason();
  const [tab, setTab] = useState<Tab>("all");
  // Owner 2026-10-05: with thousands of invites the settings were out of
  // reach at the bottom — each part now has its own tab.
  const [section, setSection] = useState<Section>("invites");
  useEffect(() => setSection(initialSection()), []);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");

  const stats = useQuery({
    queryKey: ["referrals-stats"],
    queryFn: async () => (await api.GET("/admin/referrals/stats")).data!.data,
  });
  const list = useInfiniteQuery({
    queryKey: ["referrals", tab, search],
    enabled: section === "invites",
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET("/admin/referrals", {
          params: {
            query: {
              cursor: pageParam,
              status: tab === "all" ? undefined : tab,
              q: search || undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const byStatus = Object.fromEntries(
    (stats.data?.byStatus ?? []).map((s) => [s.key, s.count]),
  );

  const act = useMutation({
    mutationFn: async ({ r, action }: { r: Referral; action: Action }) => {
      const text = {
        qualify: {
          title: "Засчитать условие",
          description:
            "Отметить, что приглашённый выполнил условие. Награды будут выданы сразу, если это возможно.",
          confirm: "Засчитать",
        },
        reward: {
          title: "Выдать награды",
          description:
            "Повторить выдачу наград. Деньги адвокату уйдут, только если у него уже есть аккаунт в Stripe.",
          confirm: "Выдать",
        },
        reject: {
          title: "Отклонить приглашение",
          description: "Например, если это накрутка. Награды не будут выданы.",
          confirm: "Отклонить",
          danger: true,
        },
      }[action];
      const a = await ask({ ...text, label: "Причина" });
      if (!a) return null;
      const opts = { params: { path: { id: r.id } }, body: { reason: a.text } };
      if (action === "qualify")
        await api.POST("/admin/referrals/{id}/qualify", opts);
      else if (action === "reward")
        await api.POST("/admin/referrals/{id}/reward", opts);
      else await api.POST("/admin/referrals/{id}/reject", opts);
      return action;
    },
    onSuccess: (action) => {
      if (!action) return;
      toast.success(
        {
          qualify: "Условие засчитано",
          reward: "Награды выданы",
          reject: "Приглашение отклонено",
        }[action],
      );
      void qc.invalidateQueries({ queryKey: ["referrals"] });
      void qc.invalidateQueries({ queryKey: ["referrals-stats"] });
    },
    onError: (e) => {
      toast.error(growthError(e));
      // A failed reward still records the attempt; refresh the row.
      void qc.invalidateQueries({ queryKey: ["referrals"] });
    },
  });

  const cols = canWrite ? 7 : 6;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Рост"
        title="Рефералы"
        subtitle="Пользователи приглашают друзей по своему коду и получают награду, когда друг начинает пользоваться приложением."
      />

      <motion.div {...fadeUp(0)}>
        <Card className="mb-6 p-5">
          <h3 className="font-medium text-heading">Как это работает</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
            <li>
              У каждого пользователя есть свой код. Друг вводит его в течение
              нескольких дней после регистрации.
            </li>
            <li>
              Приглашение засчитывается, когда друг выполнит условие: адвокат —
              первая оплата подписки, клиент — первый опубликованный кейс.
            </li>
            <li>
              После этого обе стороны получают награду из настроек ниже. Награды
              фиксируются в момент ввода кода.
            </li>
            <li>
              Себя, взаимные приглашения и повторный ввод кода сервер не
              пропускает. Подозрительные случаи можно отклонить вручную.
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
              icon={UsersThree}
              title="Всего приглашений"
              value={stats.data.total}
            />
            <Kpi
              i={1}
              icon={CheckCircle}
              title="Награда выдана"
              value={byStatus.rewarded ?? 0}
              hint={`ждут условия: ${byStatus.pending ?? 0}`}
              gold
            />
            <Kpi
              i={2}
              icon={Coins}
              title="Выдано на баланс"
              value={stats.data.balanceCentsIssued}
              format={(n) => usd(n)}
            />
            <Kpi
              i={3}
              icon={RocketLaunch}
              title="Дни продвижения"
              value={stats.data.promotionDaysIssuedExact}
              format={(n) => String(Math.round(n * 100) / 100)}
              hint={`использовано: ${stats.data.promotionDaysUsedExact}`}
            />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <div className="mt-8 mb-5 border-b border-line pb-4">
        <Tabs
          value={section}
          onChange={(v) => {
            setSection(v);
            rememberSection(v);
          }}
          items={[
            { value: "invites" as Section, label: "Приглашения" },
            { value: "settings" as Section, label: "Настройки программы" },
            { value: "codes" as Section, label: "Коды и ссылки" },
          ]}
        />
      </div>

      {section === "invites" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form
              className="relative min-w-56 flex-1 sm:max-w-xs"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(draft.trim());
              }}
            >
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
              />
              <Input
                className="pl-9"
                placeholder="Код, имя или почта — Enter"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value === "") setSearch("");
                }}
              />
            </form>
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "all" as Tab, label: "Все" },
                ...STATUSES.map((s) => ({
                  value: s as Tab,
                  label: REFERRAL_STATUS[s],
                  count: s === "qualified" ? byStatus[s] : null,
                })),
              ]}
            />
          </div>
          <ErrorNote text={list.error ? errorText(list.error) : null} />
          {!list.isPending && !list.error && rows.length === 0 ? (
            <EmptyState
              icon={ShareNetwork}
              title={
                search ? `Ничего не найдено по «${search}»` : "Приглашений нет"
              }
              text={
                search
                  ? "Попробуйте начало кода, имя или почту."
                  : tab === "all"
                    ? "Они появятся, когда пользователи начнут вводить коды друзей."
                    : "В этом статусе ничего нет."
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Пригласил</Th>
                  <Th>Приглашённый</Th>
                  <Th>Статус</Th>
                  <Th>Награды</Th>
                  <Th>Создано</Th>
                  <Th>Итог</Th>
                  {canWrite ? <Th /> : null}
                </tr>
              </thead>
              <tbody>
                {list.isPending ? (
                  <TableEmpty colSpan={cols} loading />
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <Person
                          u={r.referrer}
                          role={r.referrerRole}
                          link={canOpenUsers}
                        />
                        <div className="mt-0.5 font-mono text-[11px] text-faint">
                          {r.code}
                        </div>
                      </Td>
                      <Td>
                        <Person
                          u={r.referee}
                          role={r.refereeRole}
                          link={canOpenUsers}
                        />
                      </Td>
                      <Td>
                        <StatusPill map={REFERRAL_STATUS} value={r.status} />
                        {r.rejectedReason ? (
                          <div className="mt-1 max-w-[200px] text-xs text-faint">
                            {r.rejectedReason}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-xs">
                        <RewardLine
                          who="пригласившему"
                          r={r.referrerReward}
                          issued={r.referrerRewardIssued}
                        />
                        <RewardLine
                          who="приглашённому"
                          r={r.refereeReward}
                          issued={r.refereeRewardIssued}
                        />
                      </Td>
                      <Td className="min-w-24 text-xs text-muted">
                        {formatDateTime(r.createdAt)}
                      </Td>
                      <Td className="text-xs text-muted">
                        {formatDateTime(r.qualifiedAt)}
                        <br />
                        {formatDateTime(r.rewardedAt)}
                      </Td>
                      {canWrite ? (
                        <Td className="text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            {r.status === "pending" ? (
                              <Button
                                size="sm"
                                variant="soft"
                                disabled={act.isPending}
                                onClick={() =>
                                  act.mutate({ r, action: "qualify" })
                                }
                              >
                                <CheckCircle size={14} /> Засчитать
                              </Button>
                            ) : null}
                            {r.status === "qualified" ? (
                              <Button
                                size="sm"
                                variant="soft"
                                disabled={act.isPending}
                                onClick={() =>
                                  act.mutate({ r, action: "reward" })
                                }
                              >
                                <Gift size={14} /> Выдать
                              </Button>
                            ) : null}
                            {r.status === "pending" ||
                            r.status === "qualified" ? (
                              <Button
                                size="sm"
                                variant="danger-soft"
                                disabled={act.isPending}
                                onClick={() =>
                                  act.mutate({ r, action: "reject" })
                                }
                              >
                                <Prohibit size={14} /> Отклонить
                              </Button>
                            ) : null}
                          </div>
                        </Td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
          <LoadMore q={list} />
        </>
      ) : null}

      {section === "settings" ? (
        <SettingsCard canEdit={me?.role === "super_admin"} />
      ) : null}

      {section === "codes" ? (
        <CodesCard
          canEdit={me?.role === "super_admin" || me?.role === "finance"}
        />
      ) : null}
    </>
  );
}

function Person({
  u,
  role,
  link,
}: {
  u: Referral["referrer"];
  role: string;
  link: boolean;
}) {
  const name = u.name || u.email || u.id.slice(0, 8);
  return (
    <div className="min-w-0">
      {link ? (
        <Link
          href={`/users/${u.id}`}
          className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium text-ink">{name}</span>
      )}
      <div
        className="max-w-[150px] truncate text-xs text-faint"
        title={u.email ?? undefined}
      >
        {label(ROLE_TEXT, role)}
        {u.email && u.email !== name ? ` · ${u.email}` : ""}
      </div>
    </div>
  );
}

function RewardLine({
  who,
  r,
  issued,
}: {
  who: string;
  r: Reward;
  issued: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5">
      {issued ? (
        <CheckCircle size={13} weight="fill" className="text-success" />
      ) : (
        <span className="inline-block h-[13px] w-[13px] rounded-full border border-line-strong" />
      )}
      <span className="text-muted">{who}:</span>
      <span className="text-ink">{rewardText(r)}</span>
    </div>
  );
}

function SettingsCard({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ["referrals-settings"],
    queryFn: async () =>
      (await api.GET("/admin/referrals/settings")).data!.data,
  });
  if (q.isPending)
    return <Skeleton className="h-80 rounded-[var(--radius-lg)]" />;
  if (!q.data)
    return (
      <ErrorNote
        text={q.error ? errorText(q.error) : "Не удалось загрузить настройки"}
      />
    );
  return (
    <SettingsForm
      key={JSON.stringify(q.data)}
      initial={q.data}
      canEdit={canEdit}
    />
  );
}

/** The exact reward: `amount` carries fractional days, `value` whole ones. */
const exact = (r: Reward) => r.amount ?? r.value;

/** Value as typed in the form: dollars for balance_cents, the number otherwise. */
const toInput = (r: Reward) =>
  r.type === "balance_cents" ? String(r.value / 100) : String(exact(r));
/**
 * Owner 2026-10-05: small rewards are allowed — $0.01 (one cent) and
 * 0.01 day (0.5 = 12 hours); percent stays whole. Commas, spaces and
 * «$ % д» are ignored.
 */
function fromInput(type: RewardType, text: string): number | null {
  const clean = text.replace(",", ".").replace(/[\s$%a-zа-яё]/gi, "");
  if (clean === "" || !/^\d*\.?\d*$/.test(clean)) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) return null;
  // Dollars → whole cents; days keep two decimals; percent is whole.
  const v =
    type === "balance_cents"
      ? Math.round(n * 100)
      : type === "promotion_days"
        ? Math.round(n * 100) / 100
        : n;
  if (!Number.isFinite(v) || v > MAX_VALUE[type]) return null;
  if (type === "percent_first_invoice" && !Number.isInteger(v)) return null;
  return v;
}

function daysText(n: number): string {
  if (n > 0 && n < 1) {
    const h = Math.round(n * 24 * 10) / 10;
    return `${h} ч`;
  }
  return `${n} ${plural(n, "день", "дня", "дней")}`;
}

type SlotState = { type: RewardType; value: string };

function SettingsForm({
  initial,
  canEdit,
}: {
  initial: Settings;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [windowDays, setWindowDays] = useState(String(initial.applyWindowDays));
  const [maxInvites, setMaxInvites] = useState(
    String(initial.maxInvitesPerReferrer),
  );
  const [qualifyDays, setQualifyDays] = useState(String(initial.qualifyWindowDays));
  const [clientOn, setClientOn] = useState<"case_published" | "case_completed">(
    initial.clientQualifyOn,
  );
  const [lang, setLang] = useState<"ru" | "en">("ru");
  const [texts, setTexts] = useState(initial.texts);
  const [slots, setSlots] = useState<Record<string, SlotState>>(() =>
    Object.fromEntries(
      SLOTS.map((s) => [
        s.key,
        { type: initial[s.key].type, value: toInput(initial[s.key]) },
      ]),
    ),
  );

  const parsed = SLOTS.map((s) => ({
    key: s.key,
    type: slots[s.key].type,
    value: fromInput(slots[s.key].type, slots[s.key].value),
  }));
  const wd = Number(windowDays);
  const mi = Number(maxInvites);
  const qd = Number(qualifyDays);
  const textsOk = (["ru", "en"] as const).every((l) =>
    Object.values(texts[l]).every((v) => v.trim() !== ""),
  );
  const valid =
    parsed.every((p) => p.value != null) &&
    Number.isInteger(wd) &&
    wd >= 1 &&
    wd <= 90 &&
    Number.isInteger(mi) &&
    mi >= 0 &&
    mi <= 100000 &&
    Number.isInteger(qd) &&
    qd >= 0 &&
    qd <= 3650 &&
    textsOk;

  const save = useMutation({
    mutationFn: async () => {
      const body: Settings = {
        enabled,
        applyWindowDays: wd,
        maxInvitesPerReferrer: mi,
        qualifyWindowDays: qd,
        clientQualifyOn: clientOn,
        texts,
        attorneyReferrerReward: { type: "balance_cents", value: 0 },
        attorneyRefereeReward: { type: "percent_first_invoice", value: 0 },
        clientReferrerReward: { type: "promotion_days", value: 0 },
        clientRefereeReward: { type: "promotion_days", value: 0 },
      };
      // `value` must stay whole; the exact days go in `amount`.
      for (const p of parsed)
        body[p.key] = {
          type: p.type,
          value: Math.floor(p.value!),
          amount: p.value!,
        };
      return (await api.PUT("/admin/referrals/settings", { body })).data!.data;
    },
    onSuccess: (data) => {
      toast.success("Настройки программы сохранены");
      qc.setQueryData(["referrals-settings"], data);
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <motion.div {...fadeUp(0)}>
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <h3 className="font-medium text-heading">Программа включена</h3>
              <p className="mt-1 text-sm text-muted">
                Если выключить, новые коды вводить нельзя. Уже введённые
                приглашения продолжат работать.
              </p>
            </div>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              disabled={!canEdit}
              label="Программа включена"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <Field
              label="Сколько дней после регистрации можно ввести код"
              htmlFor="rf-window"
              hint="От 1 до 90."
            >
              <Input
                id="rf-window"
                type="number"
                min={1}
                max={90}
                value={windowDays}
                disabled={!canEdit}
                onChange={(e) => setWindowDays(e.target.value)}
                className="w-32"
              />
            </Field>
            <Field
              label="Сколько человек может пригласить один пользователь"
              htmlFor="rf-max"
              hint="0 — без ограничения."
            >
              <Input
                id="rf-max"
                type="number"
                min={0}
                max={100000}
                value={maxInvites}
                disabled={!canEdit}
                onChange={(e) => setMaxInvites(e.target.value)}
                className="w-32"
              />
            </Field>
            {/* Owner 2026-10-24: the end date of one invitation and what qualifies a client. */}
            <Field
              label="За сколько дней приглашённый должен выполнить условие"
              htmlFor="rf-qualify"
              hint="После этого срока награда не выдаётся. 0 — без срока."
            >
              <Input
                id="rf-qualify"
                type="number"
                min={0}
                max={3650}
                value={qualifyDays}
                disabled={!canEdit}
                onChange={(e) => setQualifyDays(e.target.value)}
                className="w-32"
              />
            </Field>
            <Field
              label="Когда награда за приглашённого клиента"
              htmlFor="rf-client-on"
              hint="Адвокат — после первой оплаты подписки."
            >
              <Select
                id="rf-client-on"
                value={clientOn}
                disabled={!canEdit}
                onChange={(e) => setClientOn(e.target.value as "case_published" | "case_completed")}
              >
                <option value="case_completed">после первого завершённого кейса</option>
                <option value="case_published">после первого опубликованного кейса</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {SLOTS.map((s) => {
              const st = slots[s.key];
              const bad = fromInput(st.type, st.value) == null;
              const unit =
                st.type === "balance_cents"
                  ? "$"
                  : st.type === "percent_first_invoice"
                    ? "%"
                    : "дней";
              return (
                <div
                  key={s.key}
                  className="rounded-xl border border-line bg-surface-2/50 p-4"
                >
                  <div className="font-medium text-heading">{s.title}</div>
                  <p className="mt-0.5 text-xs text-muted">{s.hint}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <Field
                      label="Тип награды"
                      htmlFor={`rf-${s.key}-type`}
                      className="min-w-44 flex-1"
                    >
                      <Select
                        id={`rf-${s.key}-type`}
                        value={st.type}
                        disabled={!canEdit || s.types.length < 2}
                        onChange={(e) =>
                          setSlots((x) => ({
                            ...x,
                            [s.key]: {
                              type: e.target.value as RewardType,
                              value: "0",
                            },
                          }))
                        }
                      >
                        {s.types.map((t) => (
                          <option key={t} value={t}>
                            {REWARD_TYPE[t]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label={`Размер, ${unit}`}
                      htmlFor={`rf-${s.key}-value`}
                    >
                      <Input
                        id={`rf-${s.key}-value`}
                        inputMode="decimal"
                        className={bad ? "w-28 border-danger" : "w-28"}
                        value={st.value}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setSlots((x) => ({
                            ...x,
                            [s.key]: { ...st, value: e.target.value },
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-faint">
                    {bad
                      ? st.type === "balance_cents"
                        ? "Число от 0 до 1000, например 0.05."
                        : st.type === "percent_first_invoice"
                          ? "Целое число от 0 до 100."
                          : "Число от 0 до 30, например 0.5."
                      : st.type === "balance_cents"
                        ? "От $0.01 до $1000."
                        : st.type === "percent_first_invoice"
                          ? "От 1 до 100 %."
                          : (() => {
                              const v = fromInput(st.type, st.value) ?? 0;
                              return v > 0 && v < 1
                                ? `Это ${daysText(v)}. Можно от 0.01 до 30 дней.`
                                : "От 0.01 до 30 дней, 0.5 = 12 часов.";
                            })()}{" "}
                    0 — без награды.
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-medium text-heading">
              Слова для пользователей
            </h3>
            <p className="mt-1 mb-3 text-sm text-muted">
              Это видят пользователи в приложении: заголовок, описание, условия
              и текст сообщения при «Поделиться». В тексте сообщения{" "}
              {"{{code}}"} заменится на код, {"{{url}}"} на ссылку. Язык
              приложения выбирается автоматически.
            </p>
            <Tabs
              value={lang}
              onChange={setLang}
              items={[
                { value: "ru", label: "Русский" },
                { value: "en", label: "English" },
              ]}
            />
            <div className="mt-4 grid gap-4">
              {(
                [
                  ["title", "Заголовок", 1, 80],
                  ["summary", "Короткое описание", 2, 400],
                  ["terms", "Условия программы", 7, 5000],
                  ["shareMessage", "Сообщение при «Поделиться»", 2, 400],
                ] as const
              ).map(([k, title, rows, max]) => (
                <Field
                  key={k}
                  label={title}
                  htmlFor={`rf-t-${lang}-${k}`}
                  hint={`${texts[lang][k].length} / ${max}`}
                >
                  <Textarea
                    id={`rf-t-${lang}-${k}`}
                    rows={rows}
                    maxLength={max}
                    disabled={!canEdit}
                    value={texts[lang][k]}
                    onChange={(e) =>
                      setTexts((t) => ({
                        ...t,
                        [lang]: { ...t[lang], [k]: e.target.value },
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
          {canEdit ? (
            <div className="mt-5 flex items-center justify-end gap-3">
              {!valid ? (
                <span className="text-xs text-danger">Проверьте значения</span>
              ) : null}
              <Button
                type="submit"
                loading={save.isPending}
                disabled={!valid || save.isPending}
              >
                Сохранить
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-faint">
              Менять настройки может только супер-админ.
            </p>
          )}
        </form>
      </Card>
    </motion.div>
  );
}
