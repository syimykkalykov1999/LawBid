import { describe, expect, it } from "vitest";
import {
  barHeights,
  budgetPercent,
  budgetTone,
  fixedFromDrafts,
  freeTierPercent,
  freeTierTone,
  groupItems,
  keepLine,
  launchSummary,
  money,
  newFixedId,
  parseLimit,
  type LaunchItem,
  type CostRegistryRow,
  DEFAULT_REGISTRY_VIEW,
  categoryCounts,
  filterRegistry,
  registrySummary,
  rowMatchesSearch,
  STATUS_DOT,
  statusTitle,
} from "./launch";

const item = (id: string, group: LaunchItem["group"]): LaunchItem => ({
  id,
  group,
  title: id,
  status: "green",
  detail: "",
  hint: null,
  runbook: null,
  manualTick: false,
  ticked: false,
  action: null,
});

describe("launch helpers (owner 2026-10-24)", () => {
  it("groups the steps in server order with Russian titles", () => {
    const g = groupItems([
      item("a", "release"),
      item("b", "money"),
      item("c", "release"),
    ]);
    expect(g.map((x) => [x.title, x.items.map((i) => i.id)])).toEqual([
      ["Выкат и домен", ["a", "c"]],
      ["Деньги", ["b"]],
    ]);
  });

  it("says how many steps are done", () => {
    expect(launchSummary({ greenCount: 9, total: 16 })).toBe(
      "Готово 9 из 16. Осталось 7.",
    );
    expect(launchSummary({ greenCount: 3, total: 3 })).toBe(
      "Всё готово: 3 из 3.",
    );
  });

  it("reads a budget limit the way a person types it", () => {
    expect(parseLimit("150")).toBe(150);
    expect(parseLimit("$150,5")).toBe(150.5);
    expect(parseLimit(" 99.99 ")).toBe(99.99);
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
    expect(parseLimit("1e5")).toBeNull();
    expect(parseLimit("100001")).toBeNull();
  });

  it("colours a budget by how much is spent", () => {
    expect(budgetPercent({ limitUsd: 200, actualUsd: 50 })).toBe(25);
    expect(budgetPercent({ limitUsd: null, actualUsd: 5 })).toBeNull();
    expect(budgetTone(25)).toBe("success");
    expect(budgetTone(85)).toBe("warning");
    expect(budgetTone(100)).toBe("danger");
    expect(budgetTone(null)).toBe("neutral");
  });

  it("formats money and admits missing data", () => {
    expect(money(null)).toBe("нет данных");
    expect(money(12)).toBe("$12");
    expect(money(12.5)).toBe("$12,50");
  });

  it("scales the 30-day bars to the biggest day, tiny days stay visible", () => {
    expect(
      barHeights([{ usd: 0 }, { usd: 10 }, { usd: 5 }, { usd: 0.01 }]),
    ).toEqual([0, 100, 50, 4]);
    expect(barHeights([{ usd: 0 }, { usd: 0 }])).toEqual([0, 0]);
  });

  it("free tier bar", () => {
    expect(freeTierPercent({ used: 250, free: 1000 })).toBe(25);
    expect(freeTierPercent(null)).toBeNull();
    expect(freeTierTone(25)).toBe("success");
    expect(freeTierTone(75)).toBe("warning");
    expect(freeTierTone(120)).toBe("danger");
  });

  it("turns the editable fixed-cost rows into an API body, null while a row is wrong", () => {
    expect(
      fixedFromDrafts([
        {
          id: "c1",
          label: " Apple ",
          usd: "99",
          period: "year",
          paidMonth: "",
        },
        {
          id: "c2",
          label: "Google",
          usd: "25,5",
          period: "once",
          paidMonth: "2026-10",
        },
      ]),
    ).toEqual({
      items: [
        { id: "c1", label: "Apple", usd: 99, period: "year" },
        {
          id: "c2",
          label: "Google",
          usd: 25.5,
          period: "once",
          paidMonth: "2026-10",
        },
      ],
    });
    expect(
      fixedFromDrafts([
        { id: "c1", label: "", usd: "1", period: "month", paidMonth: "" },
      ]),
    ).toBeNull();
    expect(
      fixedFromDrafts([
        { id: "c1", label: "x", usd: "many", period: "month", paidMonth: "" },
      ]),
    ).toBeNull();
    expect(
      fixedFromDrafts([
        { id: "c1", label: "x", usd: "1", period: "once", paidMonth: "" },
      ]),
    ).toBeNull();
    expect(newFixedId([{ id: "c1" }, { id: "c2" }])).toBe("c3");
  });

  it("the «keep on the account» sentence names forecast, margin and total", () => {
    const t = {
      monthToDateUsd: 10,
      forecastUsd: 100,
      marginPercent: 20,
      keepOnAccountUsd: 120,
      fixedMonthUsd: 0,
      stripeFeesUsd: null,
    };
    expect(keepLine(t)).toBe(
      "Прогноз счетов за месяц $100 плюс запас 20%: держите на счету около $120.",
    );
  });
});

const crow = (o: Partial<CostRegistryRow>): CostRegistryRow =>
  ({
    id: "x",
    name: "Имя",
    purpose: "",
    kind: "aws",
    controlKey: "",
    ceilingKey: null,
    ceService: null,
    priceText: "",
    state: "on",
    usdLaunch: [0, 0],
    usdK100: [0, 0],
    usdM1: [0, 0],
    ...o,
  }) as CostRegistryRow;

describe("registry view (search, filters, sort, summary)", () => {
  const rows = [
    crow({
      id: "a",
      name: "Балансировщик",
      usdLaunch: [22, 22],
      usdK100: [40, 40],
      usdM1: [250, 250],
      ceService: "Amazon Elastic Load Balancing",
    }),
    crow({
      id: "b",
      name: "База данных",
      usdLaunch: [28, 28],
      usdK100: [190, 190],
      usdM1: [700, 1400],
      ceService: "Amazon Relational Database Service",
    }),
    crow({ id: "c", name: "OpenSearch", state: "off" }),
    crow({ id: "d", name: "Автомасштаб базы", state: "auto" }),
    crow({ id: "hidden.e", name: "Фоновые задачи", state: "on" }),
    crow({
      id: "f",
      name: "Twilio",
      kind: "vendor",
      state: "auto",
      usdLaunch: [7, 7],
      usdM1: [10000, 10000],
    }),
  ];
  const v = DEFAULT_REGISTRY_VIEW;
  const ids = (x: CostRegistryRow[]) => x.map((r) => r.id);

  it("default order: paying first, dearest first", () => {
    expect(ids(filterRegistry(rows, v)).slice(0, 3)).toEqual(["b", "a", "f"]);
  });

  it("search matches name, purpose, key and the AWS service, all words", () => {
    expect(rowMatchesSearch(rows[0], "load balancing")).toBe(true);
    expect(rowMatchesSearch(rows[0], "балансир")).toBe(true);
    expect(rowMatchesSearch(rows[0], "балансир база")).toBe(false);
    expect(ids(filterRegistry(rows, { ...v, q: "relational" }))).toEqual(["b"]);
  });

  it("category and state filters, including paying and auto-but-idle", () => {
    expect(ids(filterRegistry(rows, { ...v, cat: "vendor" }))).toEqual(["f"]);
    expect(ids(filterRegistry(rows, { ...v, cat: "hidden" }))).toEqual([
      "hidden.e",
    ]);
    expect(ids(filterRegistry(rows, { ...v, state: "off" }))).toEqual(["c"]);
    expect(ids(filterRegistry(rows, { ...v, state: "paying" }))).toEqual([
      "b",
      "a",
      "f",
    ]);
    expect(ids(filterRegistry(rows, { ...v, state: "auto_idle" }))).toEqual([
      "d",
    ]);
  });

  it("sorts by 1M cost and by name", () => {
    expect(filterRegistry(rows, { ...v, sort: "m1" })[0].id).toBe("f");
    expect(filterRegistry(rows, { ...v, sort: "name" })[0].name).toBe(
      "Автомасштаб базы",
    );
  });

  it("chip counts follow the other filters; the summary totals the rows shown", () => {
    const f = { ...v, state: "paying" as const };
    expect(categoryCounts(rows, f)).toMatchObject({
      all: 3,
      aws: 2,
      vendor: 1,
      hidden: 0,
    });
    expect(registrySummary(filterRegistry(rows, f))).toEqual({
      count: 3,
      now: 57,
      k100: 230,
      m1: 11300,
    });
  });
});

describe("status dot", () => {
  it("quiet muted colours, one phrase on hover", () => {
    expect(Object.keys(STATUS_DOT)).toEqual(["active", "idle", "attention"]);
    for (const d of Object.values(STATUS_DOT))
      expect(d.color).toMatch(/^#[0-9a-f]{6}$/);
    const t = statusTitle({
      state: "auto",
      live: "attention",
      reason: "База под нагрузкой.",
      checkedAt: "x",
    });
    expect(t).toBe("посмотрите: База под нагрузкой.");
    expect(statusTitle(null)).toContain("неизвестно");
  });
});
