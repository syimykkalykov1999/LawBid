"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorNote, SectionTitle } from "@/components/page-header";
import { Badge, Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/empty";
import { StatusDot, StatusLegend } from "@/components/status-dot";
import { useToast } from "@/components/ui/toast";
import { api, errorText } from "@/lib/api/client";
import {
  autoRows,
  categoryCounts,
  COST_NEEDED_WORD,
  COST_STATE_WORD,
  dayOneRows,
  DEFAULT_REGISTRY_VIEW,
  filterRegistry,
  loadRegistryView,
  money,
  REGISTRY_CATEGORIES,
  REGISTRY_STATE_FILTERS,
  registrySummary,
  saveRegistryView,
  switchableRows,
  usdRange,
  usersWord,
  type CostRegistryReport,
  type CostRegistryRow,
  type CostState,
  type RegistrySort,
  type RegistryView,
} from "@/lib/launch";
import { livePoll } from "@/lib/live";

const KEY = ["spend-registry"];
const STATES: CostState[] = ["off", "on", "auto"];

/**
 * Owner 2026-10-25: every billable thing in one list, with this month's real
 * number and a three-position switch Выкл / Вкл / Авто. Items that live in
 * Terraform show the exact steps instead of a button.
 */
export function CostRegistry() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () =>
      (await api.GET("/admin/spend/registry")).data!.data as CostRegistryReport,
    refetchInterval: livePoll(),
  });
  const setMode = useMutation({
    mutationFn: async (v: { id: string; state: CostState }) =>
      (
        await api.PATCH("/admin/spend/registry/{id}/mode", {
          params: { path: { id: v.id } },
          body: { state: v.state },
        })
      ).data!.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success("Переключатель сохранён и записан в журнал действий");
    },
    onError: (e) => toast.error(e),
  });
  const r = q.data;
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {!r ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <details open className="mb-4" data-testid="ladder-details">
            <summary className="mb-2 cursor-pointer text-sm font-medium text-heading">
              Лестница расходов (свернуть / развернуть)
            </summary>
            <Ladder report={r} />
          </details>
          <SectionTitle>
            Все платные пункты: состояние, деньги, как переключить
          </SectionTitle>
          {r.unclaimed.length > 0 ? (
            <Card
              className="mb-3 border-warning p-3 text-sm"
              data-testid="registry-unclaimed"
            >
              В счёте AWS есть строки, которых нет в списке ниже:{" "}
              {r.unclaimed
                .map((u) => `${u.service} (${money(u.usd)})`)
                .join(", ")}
              . Скажите Claude добавить их в реестр.
            </Card>
          ) : null}
          <RegistryList
            rows={r.rows}
            pendingId={
              setMode.isPending ? (setMode.variables?.id ?? null) : null
            }
            onPick={(id, state) => setMode.mutate({ id, state })}
          />
        </>
      )}
    </>
  );
}

const SORTS: { id: RegistrySort; label: string }[] = [
  { id: "paying", label: "Платим сейчас, дорогие первыми" },
  { id: "launch", label: "По цене сейчас" },
  { id: "m1", label: "По цене на 1 млн" },
  { id: "name", label: "По названию" },
];

function RegistryList({
  rows,
  pendingId,
  onPick,
}: {
  rows: CostRegistryRow[];
  pendingId: string | null;
  onPick: (id: string, s: CostState) => void;
}) {
  const [view, setView] = useState<RegistryView>(DEFAULT_REGISTRY_VIEW);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => setView(loadRegistryView()), []);
  const patch = (p: Partial<RegistryView>) =>
    setView((v) => {
      const n = { ...v, ...p };
      saveRegistryView(n);
      return n;
    });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "Escape" && t === search.current) {
        patch({ q: "" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const shown = useMemo(() => filterRegistry(rows, view), [rows, view]);
  const counts = useMemo(() => categoryCounts(rows, view), [rows, view]);
  const sum = registrySummary(shown);
  const toggle = (id: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div>
      <StatusLegend />
      <div
        className="sticky top-0 z-10 mb-3 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3"
        data-testid="registry-bar"
      >
        <input
          ref={search}
          type="search"
          aria-label="Поиск по реестру расходов"
          placeholder="Поиск: название, зачем, ключ, служба AWS…   ( / )"
          value={view.q}
          onChange={(e) => patch({ q: e.target.value })}
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm"
        />
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Категории"
        >
          {REGISTRY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={view.cat === c.id}
              data-testid={`cat-${c.id}`}
              onClick={() => patch({ cat: c.id })}
              className={[
                "rounded-full border px-3 py-1 text-xs",
                view.cat === c.id
                  ? "border-gold-600 bg-gold-600 text-white"
                  : "border-line bg-surface text-ink",
              ].join(" ")}
            >
              {c.label} · {counts[c.id]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Фильтр по состоянию"
            value={view.state}
            onChange={(e) =>
              patch({ state: e.target.value as RegistryView["state"] })
            }
            className="h-9 rounded-xl border border-line bg-surface px-2 text-sm"
          >
            <option value="">Любое состояние</option>
            {REGISTRY_STATE_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Сортировка"
            value={view.sort}
            onChange={(e) => patch({ sort: e.target.value as RegistrySort })}
            className="h-9 rounded-xl border border-line bg-surface px-2 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {view.q || view.cat !== "all" || view.state ? (
            <button
              type="button"
              className="text-xs text-gold-600 underline"
              onClick={() => patch({ q: "", cat: "all", state: "" })}
            >
              Сбросить
            </button>
          ) : null}
        </div>
        <div
          className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2 text-sm"
          data-testid="registry-summary"
        >
          <span>
            Показано: <b>{sum.count}</b> из {rows.length}
          </span>
          <span>
            Сейчас: <b>{money(sum.now)}</b>
          </span>
          <span>
            100 тыс.: <b>{money(sum.k100)}</b>
          </span>
          <span>
            1 млн: <b>{money(sum.m1)}</b>
          </span>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          Ничего не найдено. Сбросьте фильтры или поиск.
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {shown.map((row) => (
          <Row
            key={row.id}
            row={row}
            expanded={open.has(row.id)}
            onToggle={() => toggle(row.id)}
            busy={pendingId === row.id}
            onPick={(state) => onPick(row.id, state)}
          />
        ))}
      </div>
    </div>
  );
}

function Ladder({ report }: { report: CostRegistryReport }) {
  const { ladder, rows } = report;
  const dayOne = dayOneRows(rows);
  const sw = switchableRows(rows);
  const auto = autoRows(rows);
  return (
    <>
      <SectionTitle>Лестница расходов</SectionTitle>
      <Card className="mb-3 p-5" data-testid="ladder-day-one">
        <div className="text-xs text-muted">
          День первый: пустое приложение, платим за каждую строку
        </div>
        <div className="mt-1 text-3xl font-semibold text-heading">
          ≈ {usdRange(ladder.dayOne.all)} в месяц
        </div>
        <p className="mt-1 text-sm text-muted">
          AWS {usdRange(ladder.dayOne.aws)} + сторонние и аккаунты{" "}
          {usdRange(ladder.dayOne.vendors)}. Старые документы писали «$150–170»:
          это было занижено примерно на $100.
        </p>
        <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {dayOne.map((d) => (
            <div
              key={d.id}
              className="flex items-baseline justify-between gap-3 border-b border-line py-1"
            >
              <span className="min-w-0 truncate text-ink" title={d.purpose}>
                {d.name}
              </span>
              <span className="shrink-0 text-muted">
                {usdRange(d.usdLaunch)}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card className="p-4" data-testid="ladder-switchable">
          <div className="text-sm font-medium text-heading">
            Включаете вы сами (сейчас выключено)
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {sw.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span
                  className="min-w-0 truncate text-ink"
                  title={s.neededNote}
                >
                  {s.name}
                </span>
                <span className="shrink-0 text-muted">
                  +{usdRange(s.ifOnUsd)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4" data-testid="ladder-auto">
          <div className="text-sm font-medium text-heading">
            Включается само, по сигналу (Авто)
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {auto.map((s) => (
              <li key={s.id}>
                <span className="text-ink">{s.name}</span>
                <span className="block text-xs text-muted">{s.neededNote}</span>
                {s.ceilingLabel ? (
                  <span className="block text-xs text-muted">
                    Потолок: {s.ceilingLabel}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mb-6 p-4" data-testid="ladder-scenarios">
        <div className="text-sm font-medium text-heading">
          Сколько в месяц при росте (грубо: в 2 раза можно ошибиться)
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {ladder.scenarios.map((s) => (
            <div key={s.users}>
              <div className="text-xs text-muted">
                {usersWord(s.users)} человек
              </div>
              <div className="text-lg font-semibold text-heading">
                {usdRange(s.usd)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Сейчас фактически за месяц: {money(ladder.monthToDateUsd)}, прогноз на
          месяц: {money(ladder.projectedUsd)}.
        </p>
      </Card>
    </>
  );
}

function Row({
  row,
  expanded,
  onToggle,
  busy,
  onPick,
}: {
  row: CostRegistryRow;
  expanded: boolean;
  onToggle: () => void;
  busy: boolean;
  onPick: (s: CostState) => void;
}) {
  const stepsStates = row.states.length > 0 ? row.states : ["on"];
  return (
    <Card className="p-0" data-testid={`registry-${row.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          data-testid={`toggle-${row.id}`}
          onClick={onToggle}
          className="min-w-[200px] flex-1 truncate text-left text-sm font-medium text-heading"
          title={row.purpose}
        >
          {expanded ? "▾ " : "▸ "}
          {row.name}
        </button>
        <StatusDot status={row.status} testId={`dot-${row.id}`} />
        <StateControl row={row} busy={busy} onPick={onPick} />
        <span
          className="w-28 text-right text-sm text-ink"
          data-testid={`registry-money-${row.id}`}
        >
          {row.monthUsd == null
            ? `≈ ${usdRange(row.usdLaunch)}`
            : money(row.monthUsd)}
        </span>
        <span className="w-28 text-right text-xs text-muted">
          1 млн: {usdRange(row.usdM1)}
        </span>
        <span className="w-5" title={row.alarm ?? "Тревоги нет"}>
          {row.alarm ? (
            <Bell
              size={16}
              aria-label={`Тревога: ${row.alarm}`}
              className="text-gold-600"
            />
          ) : null}
        </span>
      </div>
      {expanded ? (
        <div
          className="border-t border-line px-3 py-3"
          data-testid={`details-${row.id}`}
        >
          <p className="text-xs text-muted">{row.purpose}</p>
          {row.ceilingLabel ? (
            <p className="mt-1 text-xs text-muted">
              Потолок: {row.ceilingLabel}
            </p>
          ) : null}
          {row.stateNote ? (
            <p className="mt-1 text-xs text-warning">{row.stateNote}</p>
          ) : null}
          {row.lockedReason && !row.editable ? (
            <p className="mt-1 text-xs text-muted">{row.lockedReason}</p>
          ) : null}
          <div className="mt-2 grid gap-3 text-sm lg:grid-cols-2">
            <div>
              <div className="text-xs text-muted">Этот месяц · прогноз</div>
              <div className="text-ink">
                {row.monthUsd == null
                  ? "нет данных"
                  : `${money(row.monthUsd)} · ${money(row.projectedUsd)}`}
              </div>
              <div className="text-xs text-muted">
                Старт {usdRange(row.usdLaunch)} · 100 тыс.{" "}
                {usdRange(row.usdK100)} · 1 млн {usdRange(row.usdM1)}
                {row.ifOnUsd
                  ? ` · если включить +${usdRange(row.ifOnUsd)}`
                  : ""}
              </div>
              <div className="text-xs text-muted">
                {row.priceText}{" "}
                <a
                  href={row.priceSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold-600 underline-offset-2 hover:underline"
                >
                  цена на {row.priceCheckedAt}
                </a>
                {row.priceVerified ? "" : " (уточнить)"}
              </div>
            </div>
            <div className="min-w-0">
              <Badge
                tone={
                  row.needed === "yes" || row.needed === "auto"
                    ? "success"
                    : "neutral"
                }
              >
                {COST_NEEDED_WORD[row.needed]}
              </Badge>
              <p className="mt-1 text-xs text-ink">{row.neededNote}</p>
              {row.alarm ? (
                <p className="mt-1 text-xs text-muted">Тревога: {row.alarm}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-sm">
            <div className="mb-1 text-gold-600">Как включить / выключить</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {stepsStates.map((st) => (
                <div key={st}>
                  <div className="text-xs font-medium text-heading">
                    {COST_STATE_WORD[st as CostState]}
                  </div>
                  <ol className="ml-4 list-decimal text-xs text-ink">
                    {(row.steps[st] ?? []).map((x, i) => (
                      <li key={i} className="whitespace-pre-wrap">
                        {x}
                      </li>
                    ))}
                  </ol>
                  {row.stateHints[st] ? (
                    <p className="mt-1 text-xs text-muted">
                      {row.stateHints[st]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function StateControl({
  row,
  busy,
  onPick,
}: {
  row: CostRegistryRow;
  busy: boolean;
  onPick: (s: CostState) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Состояние: ${row.name}`}
      className="inline-flex overflow-hidden rounded-xl border border-line"
    >
      {STATES.map((st) => {
        const supported = row.states.includes(st);
        const active = row.state === st;
        const can = row.editable && supported && !busy && !active;
        return (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!can && !active}
            title={
              !supported
                ? "Для этого пункта такого положения нет"
                : (row.stateHints[st] ?? "")
            }
            data-testid={`state-${row.id}-${st}`}
            onClick={() => can && onPick(st)}
            className={[
              "h-9 px-3 text-sm transition-colors",
              active ? "bg-gold-600 text-white" : "bg-surface text-ink",
              supported ? "" : "opacity-30",
              can ? "hover:bg-line/40" : "cursor-default",
            ].join(" ")}
          >
            {COST_STATE_WORD[st]}
          </button>
        );
      })}
    </div>
  );
}
