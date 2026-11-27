"use client";

import { Plus, Star, Trash } from "@phosphor-icons/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNote, PageHeader, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PrefetchSentinel } from "@/components/legacy/prefetch-sentinel";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SortTh, Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api, errorText } from "@/lib/api/client";
import { saveFlag } from "@/lib/config-save";
import { usd } from "@/lib/economy";
import { sortRows, useTableSort } from "@/lib/table-sort";
import { formatDateTime } from "@/lib/utils";
import { useUrlState } from "@/lib/url-state";

type Tab = "report" | "packs" | "history";
/** Scout 13.11 (row 96): the tab lives in the address (lib/url-state.ts). */
const TABS: readonly Tab[] = ["report", "packs", "history"];

const KIND: Record<string, string> = {
  topup: "Пополнение",
  gift_sent: "Подарок",
  gift_converted: "Подарок → звёзды",
  sticker_pack: "Набор стикеров",
  admin_grant: "Вручную",
  refund: "Возврат Stripe",
  boost: "Boost",
  boost_refund: "Возврат за Boost",
  reaction: "Реакция",
};

const stars = (n: number) => `${n.toLocaleString("ru-RU")} ⭐`;

/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const TOP_GIFT_SORT_KEYS = ["title", "sent", "stars"] as const;
const KIND_SORT_KEYS = ["kind", "count", "stars"] as const;
const DEBT_SORT_KEYS = ["user", "debt", "balance"] as const;
const LEDGER_SORT_KEYS = [
  "created",
  "kind",
  "delta",
  "balance",
  "note",
] as const;

/**
 * Owner 2026-10-20 «Звёзды»: the in-app balance bought only on the web.
 * Report for the money section, pack sizes and prices (owner 26.11: the
 * gift catalog is gone; past gifts stay in the report and the history),
 * the history of every balance with a hand-made grant / take-back.
 */
export default function StarsPage() {
  const [tab, setTab] = useUrlState<Tab>("tab", "report", TABS);
  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Звёзды"
        subtitle="Баланс звёзд покупают только на сайте — магазины приложений ничего не берут. Звёзды тратят на платные реакции, Boost и платные наборы стикеров."
      />
      <FlagCard />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "report", label: "Отчёт" },
            { value: "packs", label: "Пакеты и настройки" },
            { value: "history", label: "История и выдача" },
          ]}
        />
      </div>
      {tab === "report" ? <ReportTab /> : null}
      {tab === "packs" ? <PacksTab /> : null}
      {tab === "history" ? <HistoryTab /> : null}
    </>
  );
}

function FlagCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["admin-stars-settings"],
    queryFn: async () => (await api.GET("/admin/stars/settings")).data!.data,
  });
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      // Row 179: checked against the version this tab saw (lib/config-save.ts).
      await saveFlag(qc, "stars", enabled);
      return enabled;
    },
    onSuccess: (enabled) => {
      toast.success(enabled ? "Звёзды включены" : "Звёзды выключены");
      void qc.invalidateQueries({ queryKey: ["admin-stars-settings"] });
      void qc.invalidateQueries({ queryKey: ["flags"] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="mb-5 flex items-center justify-between gap-4">
      <div>
        <div className="font-medium">Звёзды в приложении и на сайте</div>
        <p className="text-sm text-muted">
          Выключено — пополнений, платных реакций и наборов нет. Купленные
          звёзды остаются на балансах.
        </p>
      </div>
      <Switch
        label="Звёзды"
        checked={q.data?.enabled ?? false}
        disabled={!q.data || toggle.isPending}
        onChange={(v) => toggle.mutate(v)}
      />
    </Card>
  );
}

function Stat({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-faint">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-heading">
        {value}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

function ReportTab() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const q = useQuery({
    queryKey: ["admin-stars-report", days],
    queryFn: async () =>
      (
        await api.GET("/admin/stars/report", {
          params: { query: { days: Number(days) } },
        })
      ).data!.data,
  });
  const r = q.data;
  const topGiftSort = useTableSort(TOP_GIFT_SORT_KEYS, "topGiftSort");
  const topGiftRows = sortRows(r?.topGifts ?? [], topGiftSort.sort, {
    title: (g) => g.title,
    sent: (g) => g.sent,
    stars: (g) => g.stars,
  });
  const kindSort = useTableSort(KIND_SORT_KEYS, "kindSort");
  const kindRows = sortRows(r?.byKind ?? [], kindSort.sort, {
    kind: (k) => KIND[k.kind] ?? k.kind,
    count: (k) => k.count,
    stars: (k) => k.stars,
  });
  return (
    <>
      <div className="mb-4">
        <Tabs
          size="sm"
          value={days}
          onChange={setDays}
          items={[
            { value: "7", label: "7 дней" },
            { value: "30", label: "30 дней" },
            { value: "90", label: "90 дней" },
          ]}
        />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {!r ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              title="Выручка за звёзды"
              value={usd(r.revenueCents / 100)}
              hint={`${r.purchases} покупок · ${stars(r.starsSold)}`}
            />
            <Stat
              title="Потрачено звёзд"
              value={stars(r.starsSpent)}
              hint="подарки и наборы стикеров"
            />
            <Stat
              title="Лежит на балансах"
              value={stars(r.outstandingStars)}
              hint="за это мы ещё отдадим подарки и стикеры"
            />
            <Stat
              title="Подарков отправлено"
              value={String(r.giftsSent)}
              hint={`обратно в звёзды: ${stars(r.starsConverted)}`}
            />
            <Stat
              title="Долги после возвратов"
              value={stars(r.debtStars)}
              hint={
                r.debtUsers > 0
                  ? `${r.debtUsers} чел.: баланс заморожен на нуле, следующие пополнения гасят долг`
                  : "Возвратов Stripe с долгом нет"
              }
            />
          </div>
          {r.debtUsers > 0 ? <DebtsTable /> : null}
          <div>
            <SectionTitle>Самые покупаемые подарки</SectionTitle>
            {r.topGifts.length === 0 ? (
              <EmptyState icon={Star} title="Пока нет подарков" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <SortTh {...topGiftSort.header("title")}>Подарок</SortTh>
                    <SortTh
                      {...topGiftSort.header("sent")}
                      className="text-right"
                    >
                      Отправлено
                    </SortTh>
                    <SortTh
                      {...topGiftSort.header("stars")}
                      className="text-right"
                    >
                      Звёзд
                    </SortTh>
                  </tr>
                </thead>
                <tbody>
                  {topGiftRows.map((g) => (
                    <tr key={g.title}>
                      <Td>{g.title}</Td>
                      <Td className="text-right tabular-nums">{g.sent}</Td>
                      <Td className="text-right tabular-nums">
                        {stars(g.stars)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <div>
            <SectionTitle>Движение звёзд по видам</SectionTitle>
            <Table>
              <thead>
                <tr>
                  <SortTh {...kindSort.header("kind")}>Вид</SortTh>
                  <SortTh {...kindSort.header("count")} className="text-right">
                    Операций
                  </SortTh>
                  <SortTh {...kindSort.header("stars")} className="text-right">
                    Звёзд (+/−)
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {r.byKind.length === 0 ? (
                  <TableEmpty colSpan={3} />
                ) : (
                  kindRows.map((k) => (
                    <tr key={k.kind}>
                      <Td>{KIND[k.kind] ?? k.kind}</Td>
                      <Td className="text-right tabular-nums">{k.count}</Td>
                      <Td className="text-right tabular-nums">
                        {k.stars > 0 ? `+${k.stars}` : k.stars}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}

function DebtsTable() {
  const q = useQuery({
    queryKey: ["admin-stars-debts"],
    queryFn: async () => (await api.GET("/admin/stars/debts")).data!.data,
  });
  const { sort, header } = useTableSort(DEBT_SORT_KEYS, "debtSort");
  const rows = sortRows(q.data ?? [], sort, {
    user: (d) => d.userId,
    debt: (d) => d.debt,
    balance: (d) => d.balance,
  });
  return (
    <div>
      <SectionTitle>Должники (возврат Stripe после трат)</SectionTitle>
      <Table>
        <thead>
          <tr>
            <SortTh {...header("user")}>Пользователь</SortTh>
            <SortTh {...header("debt")} className="text-right">
              Долг
            </SortTh>
            <SortTh {...header("balance")} className="text-right">
              Баланс
            </SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={3} />
          ) : (
            rows.map((d) => (
              <tr key={d.userId}>
                <Td className="font-mono text-xs">{d.userId}</Td>
                <Td className="text-right tabular-nums">{stars(d.debt)}</Td>
                <Td className="text-right tabular-nums">{stars(d.balance)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}

type PackRow = { id: string; stars: string; price: string };

function PacksTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["admin-stars-settings"] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await api.GET("/admin/stars/settings")).data!.data,
  });
  const [rows, setRows] = useState<PackRow[] | null>(null);
  const [percent, setPercent] = useState<string | null>(null);
  const [perDay, setPerDay] = useState<string | null>(null);
  const [starCents, setStarCents] = useState<string | null>(null);
  const [reactionStars, setReactionStars] = useState<string | null>(null);
  const [premium, setPremium] = useState<string | null>(null);
  const d = q.data;
  const current: PackRow[] =
    rows ??
    (d?.packs ?? []).map((p) => ({
      id: p.id,
      stars: String(p.stars),
      price: String(p.priceCents / 100),
    }));
  const pct = percent ?? String(d?.giftConvertPercent ?? 70);
  const max = perDay ?? String(d?.giftsPerDayMax ?? 100);
  const cents = starCents ?? String(d?.starCents ?? 2);
  const reaction = reactionStars ?? String(d?.reactionStars ?? 3);
  const premiumText = premium ?? (d?.premiumReactions ?? []).join(" ");
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PUT("/admin/stars/settings", {
          body: {
            packs: current.map((r) => ({
              id: r.id,
              stars: Number(r.stars),
              priceCents: Math.round(Number(r.price) * 100),
            })),
            giftConvertPercent: Number(pct),
            giftsPerDayMax: Number(max),
            starCents: Number(cents),
            reactionStars: Number(reaction),
            premiumReactions: premiumText.split(/[\s,]+/).filter(Boolean),
          },
        })
      ).data!.data,
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      setRows(null);
      setPercent(null);
      setPerDay(null);
      setStarCents(null);
      setReactionStars(null);
      setPremium(null);
      toast.success("Сохранено");
    },
    onError: (e) => toast.error(e),
  });
  const set = (i: number, patch: Partial<PackRow>) =>
    setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const valid =
    current.every(
      (r) =>
        /^[a-z][a-z0-9_]{1,39}$/.test(r.id) &&
        Number(r.stars) >= 1 &&
        Number.isInteger(Number(r.stars)) &&
        Number(r.price) >= 0.5,
    ) &&
    new Set(current.map((r) => r.id)).size === current.length &&
    Number.isInteger(Number(pct)) &&
    Number(pct) >= 0 &&
    Number(pct) <= 100 &&
    Number.isInteger(Number(max)) &&
    Number(max) >= 1 &&
    Number.isInteger(Number(cents)) &&
    Number(cents) >= 1 &&
    Number.isInteger(Number(reaction)) &&
    Number(reaction) >= 1;
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-medium">Пакеты звёзд</h3>
        <p className="mt-1 text-sm text-muted">
          Цена в долларах — это курс: чем больше пакет, тем дешевле звезда.
          Покупка идёт только на сайте через Stripe (3-D Secure); в приложении
          цен нет.
        </p>
        <div className="mt-3 grid gap-2">
          {current.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <Field label="Код">
                <Input
                  value={r.id}
                  onChange={(e) => set(i, { id: e.target.value.toLowerCase() })}
                />
              </Field>
              <Field label="Звёзд">
                <Input
                  value={r.stars}
                  onChange={(e) => set(i, { stars: e.target.value })}
                />
              </Field>
              <Field
                label="Цена, $"
                hint={
                  Number(r.stars) > 0 && Number(r.price) > 0
                    ? `≈ $${(Number(r.price) / Number(r.stars)).toFixed(4)} за звезду`
                    : undefined
                }
              >
                <Input
                  value={r.price}
                  onChange={(e) => set(i, { price: e.target.value })}
                />
              </Field>
              <Button
                variant="ghost"
                aria-label="Убрать строку"
                title="Убрать строку"
                onClick={() => setRows(current.filter((_, j) => j !== i))}
              >
                <Trash size={16} />
              </Button>
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="ghost"
          onClick={() =>
            setRows([
              ...current,
              {
                id: `stars_${current.length + 1}`,
                stars: "100",
                price: "1.99",
              },
            ])
          }
        >
          <Plus size={16} weight="bold" /> Добавить пакет
        </Button>
      </Card>
      <Card>
        <h3 className="font-medium">Подарки</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Сколько % цены получает адвокат или клиент, обратив подарок в звёзды"
            hint="Остальное — наша комиссия. 0 — обращать подарки в звёзды нельзя."
          >
            <Input
              value={pct}
              inputMode="numeric"
              onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field
            label="Сколько подарков один человек может сделать за сутки"
            hint="Тормоз от злоупотреблений с чужими картами."
          >
            <Input
              value={max}
              inputMode="numeric"
              onChange={(e) => setPerDay(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>
      </Card>
      <Card>
        <h3 className="font-medium">Boost и реакции за звёзды</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Сколько центов стоит одна звезда при оплате Boost"
            hint="Boost на $5 при 2 центах = 250 звёзд. Меньше — звёзды выгоднее, больше — дороже."
          >
            <Input
              value={cents}
              inputMode="numeric"
              onChange={(e) => setStarCents(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field
            label="Сколько звёзд стоит премиум-реакция"
            hint="Один раз на сообщение и реакцию."
          >
            <Input
              value={reaction}
              inputMode="numeric"
              onChange={(e) =>
                setReactionStars(e.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
          <Field
            label="Премиум-реакции (смайлы через пробел)"
            hint="Бесплатные для всех: 👍 ❤️ 😂 😮 😢 🙏"
          >
            <Input
              value={premiumText}
              onChange={(e) => setPremium(e.target.value)}
            />
          </Field>
        </div>
      </Card>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <div>
        <Button
          variant="gold"
          disabled={!valid || save.isPending || !d}
          onClick={() => save.mutate()}
        >
          Сохранить
        </Button>
        <p className="mt-2 text-xs text-muted">
          Цены наборов стикеров задаются в разделе «Рилсы и стикеры» → Стикеры →
          набор. Возврат денег через Stripe снимает звёзды сам: что уже
          потрачено, становится долгом (вкладка «Отчёт»), а новые пополнения
          гасят его. Отмена Boost, оплаченного звёздами, возвращает звёзды.
        </p>
      </div>
    </div>
  );
}

function HistoryTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const uid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId.trim(),
    )
      ? userId.trim()
      : undefined;
  const q = useInfiniteQuery({
    queryKey: ["admin-stars-ledger", uid],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET("/admin/stars/ledger", {
          params: { query: { userId: uid, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(LEDGER_SORT_KEYS, "ledgerSort");
  const rows = sortRows(q.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    created: (i) => i.createdAt,
    kind: (i) => KIND[i.kind] ?? i.kind,
    delta: (i) => i.delta,
    balance: (i) => i.balanceAfter,
    note: (i) => i.note ?? null,
  });
  const grant = useMutation({
    mutationFn: async () =>
      (
        await api.POST("/admin/stars/grant", {
          body: {
            userId: userId.trim(),
            amount: Number(amount),
            reason: reason.trim(),
          },
        })
      ).data!.data,
    onSuccess: (r) => {
      toast.success(`Готово. Баланс: ${stars(r.balance)}`);
      setAmount("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-stars-ledger"] });
    },
    onError: (e) => toast.error(e),
  });
  const n = Number(amount);
  const ok =
    !!uid && Number.isInteger(n) && n !== 0 && reason.trim().length >= 3;
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-medium">Выдать или списать звёзды</h3>
        <p className="mt-1 text-sm text-muted">
          Для возврата платежа в Stripe или подарка. Минус — списать (баланс не
          уйдёт ниже нуля). Остаётся в журнале с причиной.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
          <Field label="ID пользователя">
            <Input
              className="font-mono"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </Field>
          <Field label="Звёзд (+/−)">
            <Input
              value={amount}
              inputMode="numeric"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
            />
          </Field>
          <Field label="Причина">
            <Input
              maxLength={120}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            variant="gold"
            disabled={!ok || grant.isPending}
            loading={grant.isPending}
            onClick={() => grant.mutate()}
          >
            Применить
          </Button>
        </div>
      </Card>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <SortTh {...header("created")}>Когда</SortTh>
            <SortTh {...header("kind")}>Вид</SortTh>
            <SortTh {...header("delta")} className="text-right">
              Звёзд
            </SortTh>
            <SortTh {...header("balance")} className="text-right">
              Баланс после
            </SortTh>
            <SortTh {...header("note")}>Заметка</SortTh>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={5} loading />
          ) : rows.length === 0 && !q.isError ? (
            <TableEmpty colSpan={5} />
          ) : (
            rows.map((i) => (
              <tr key={i.id}>
                <Td className="whitespace-nowrap text-xs text-muted">
                  {formatDateTime(i.createdAt)}
                </Td>
                <Td>{KIND[i.kind] ?? i.kind}</Td>
                <Td className="text-right tabular-nums">
                  {i.delta > 0 ? `+${i.delta}` : i.delta}
                </Td>
                <Td className="text-right tabular-nums">{i.balanceAfter}</Td>
                <Td className="text-muted">{i.note ?? "—"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {q.hasNextPage ? (
        <PrefetchSentinel
          enabled={!q.isFetchingNextPage}
          onNear={() => void q.fetchNextPage()}
        />
      ) : null}
      {q.hasNextPage ? (
        <Button
          variant="outline"
          loading={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          Показать ещё
        </Button>
      ) : null}
    </div>
  );
}
