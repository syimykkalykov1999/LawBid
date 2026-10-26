import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { CostRegistryReport, CostRegistryRow } from "@/lib/launch";

const row = (o: Partial<CostRegistryRow>): CostRegistryRow => ({
  id: "vendor.twilio",
  name: "SMS-коды входа (Twilio)",
  purpose: "Код подтверждения телефона.",
  kind: "vendor",
  controlType: "app-setting",
  controlKey: "budget.sms.monthly_max",
  editable: true,
  lockedReason: null,
  states: ["off", "auto"],
  defaultState: "auto",
  state: "auto",
  stateKnown: true,
  stateNote: null,
  stateHints: {},
  ceilingLabel: "Лимит SMS в месяц",
  ceilingKey: "budget.sms.monthly_max",
  ceilingWhere: "app-setting",
  priceText: "$0,0115 за SMS",
  priceModel: "unit",
  priceSourceUrl: "https://www.twilio.com/en-us/sms/pricing/us",
  priceCheckedAt: "2026-10-25",
  priceVerified: true,
  usdLaunch: [2, 12],
  usdK100: [1150, 1150],
  usdM1: [10000, 10000],
  ifOnUsd: null,
  needed: "yes",
  neededNote: "Нужен для регистрации.",
  alarm: "лимит SMS",
  note: null,
  ceService: null,
  status: {
    state: "auto",
    live: "idle",
    reason: "Авто: включится само, когда понадобится.",
    checkedAt: "2026-10-26T10:00:00Z",
  },
  monthUsd: 7,
  projectedUsd: 14,
  monthSource: "real",
  steps: {
    off: ["Админка → Расходы → Выкл"],
    auto: ["Админка → Расходы → Авто"],
  },
  ...o,
});

const report: CostRegistryReport = {
  generatedAt: "2026-10-25T10:00:00Z",
  spendRefreshedAt: "2026-10-25T06:00:00Z",
  rows: [
    row({}),
    row({
      id: "aws.guardduty",
      name: "Охрана аккаунта (GuardDuty)",
      kind: "aws",
      controlType: "tfvars",
      editable: false,
      lockedReason: "Меняется строкой в terraform.tfvars; шаги ниже.",
      states: ["off", "on"],
      defaultState: "on",
      state: "on",
      usdLaunch: [4, 4],
      monthUsd: null,
      projectedUsd: null,
      monthSource: "none",
      steps: {
        off: ["Впишите: guardduty_enabled = false"],
        on: ["Впишите: guardduty_enabled = true"],
      },
    }),
    row({
      id: "aws.opensearch",
      name: "Поисковый движок (OpenSearch)",
      kind: "aws",
      controlType: "tfvars",
      editable: false,
      states: ["off", "on"],
      defaultState: "off",
      state: "off",
      usdLaunch: [0, 0],
      ifOnUsd: [28, 280],
      needed: "later",
      monthUsd: null,
      projectedUsd: null,
      monthSource: "none",
    }),
    row({
      id: "hidden.cron_jobs",
      name: "Периодические фоновые задачи",
      kind: "aws",
      controlType: "app-setting",
      states: ["off", "on"],
      state: "on",
      usdLaunch: [0, 0],
      neededNote:
        "Нагрузка: тяжёлые задачи сами встают на паузу, когда база тормозит.",
      monthUsd: null,
      projectedUsd: null,
      monthSource: "none",
    }),
    row({
      id: "aws.db_autoscale",
      name: "Автомасштаб размера базы",
      kind: "aws",
      controlType: "ssm-mode",
      states: ["off", "on", "auto"],
      state: "auto",
      usdLaunch: [0, 0],
      needed: "auto",
      neededNote: "Авто: база растёт только при нагрузке.",
      stateHints: {
        on: "Вкл: только письма «что бы я сделал», ничего не меняет.",
      },
      steps: { off: ["x"], on: ["y"], auto: ["z"] },
    }),
  ],
  unclaimed: [{ service: "Amazon Brand New Thing", usd: 12 }],
  ladder: {
    dayOne: { aws: [263, 263], vendors: [12, 22], all: [275, 285] },
    scenarios: [
      { users: 1000, usd: [280, 290] },
      { users: 1_000_000, usd: [25000, 45000] },
    ],
    monthToDateUsd: 105,
    projectedUsd: 210,
  },
};

const patch = vi.fn(async () => ({
  data: { data: { id: "x", state: "off" } },
}));
vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn(async () => ({ data: { data: report } })),
    PATCH: (...a: unknown[]) =>
      (patch as unknown as (...x: unknown[]) => unknown)(...a),
  },
}));
vi.mock("@/lib/live", () => ({ livePoll: () => false }));

import { CostRegistry } from "./registry";

afterEach(() => {
  cleanup();
  localStorage.clear();
  patch.mockClear();
});

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CostRegistry />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("cost registry on «Расходы»", () => {
  it("the ladder shows the corrected day-one total and the growth steps", async () => {
    renderIt();
    const day = await screen.findByTestId("ladder-day-one");
    expect(day.textContent).toContain("$275–285");
    expect(day.textContent).toContain("занижено");
    expect(screen.getByTestId("ladder-scenarios").textContent).toContain(
      "1 тыс. человек",
    );
    expect(screen.getByTestId("ladder-switchable").textContent).toContain(
      "OpenSearch",
    );
    expect(screen.getByTestId("ladder-auto").textContent).toContain(
      "Автомасштаб размера базы",
    );
  });

  it("every row has a quiet status dot with the reason on hover, and a faint legend", async () => {
    renderIt();
    const dot = await screen.findByTestId("dot-vendor.twilio");
    expect(dot.getAttribute("data-live")).toBe("idle");
    expect(dot.getAttribute("title")).toContain("включится само");
    expect(dot.className).not.toMatch(/animate|pulse|blink/);
    expect(screen.getByTestId("status-legend").textContent).toContain(
      "нужно ваше внимание",
    );
  });

  it("hidden costs and load have their own section", async () => {
    renderIt();
    await screen.findByTestId("registry-hidden.cron_jobs");
    expect(
      screen.getAllByText(/Скрытые расходы и нагрузка/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("toggle-hidden.cron_jobs"));
    expect(
      screen.getByTestId("details-hidden.cron_jobs").textContent,
    ).toContain("Нагрузка");
  });

  it("a row is one line; clicking opens money, price source and the useful-now note", async () => {
    renderIt();
    const money = await screen.findByTestId("registry-money-vendor.twilio");
    expect(money.textContent).toContain("$7");
    expect(screen.queryByTestId("details-vendor.twilio")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-vendor.twilio"));
    const card = screen.getByTestId("details-vendor.twilio");
    expect(card.textContent).toContain("$14");
    expect(card.textContent).toContain("Нужно сейчас");
    expect(card.textContent).toContain("Нужен для регистрации.");
    expect(card.querySelector("a")?.getAttribute("href")).toContain(
      "twilio.com",
    );
    expect(
      screen.getByTestId("registry-money-aws.guardduty").textContent,
    ).toContain("$4");
  });

  it("search narrows the list instantly, Esc clears it, the summary follows the filter", async () => {
    renderIt();
    await screen.findByTestId("registry-vendor.twilio");
    const box = screen.getByLabelText(
      "Поиск по реестру расходов",
    ) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "guardduty" } });
    expect(screen.queryByTestId("registry-vendor.twilio")).toBeNull();
    expect(screen.getByTestId("registry-aws.guardduty")).toBeTruthy();
    expect(screen.getByTestId("registry-summary").textContent).toContain(
      "Показано: 1",
    );
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("");
    expect(screen.getByTestId("registry-vendor.twilio")).toBeTruthy();
  });

  it("category chips carry counts and filter; the choice is remembered", async () => {
    renderIt();
    await screen.findByTestId("registry-vendor.twilio");
    expect(screen.getByTestId("cat-vendor").textContent).toContain("· 1");
    expect(screen.getByTestId("cat-hidden").textContent).toContain("· 1");
    fireEvent.click(screen.getByTestId("cat-hidden"));
    expect(screen.queryByTestId("registry-vendor.twilio")).toBeNull();
    expect(screen.getByTestId("registry-hidden.cron_jobs")).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("spend-registry-view") ?? "{}").cat,
    ).toBe("hidden");
  });

  it('"/" focuses the search box', async () => {
    renderIt();
    await screen.findByTestId("registry-vendor.twilio");
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(
      screen.getByLabelText("Поиск по реестру расходов"),
    );
  });

  it("flipping an editable item sends the new state; unsupported and locked positions do not", async () => {
    renderIt();
    await screen.findByTestId("registry-vendor.twilio");
    expect(
      (screen.getByTestId("state-vendor.twilio-on") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByTestId("state-vendor.twilio-off"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("/admin/spend/registry/{id}/mode", {
      params: { path: { id: "vendor.twilio" } },
      body: { state: "off" },
    });
    // Terraform items are read-only here.
    expect(
      (screen.getByTestId("state-aws.guardduty-off") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByTestId("state-aws.guardduty-off"));
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("three positions on an autoscaler, steps expandable, Terraform steps shown", async () => {
    renderIt();
    await screen.findByTestId("registry-aws.db_autoscale");
    fireEvent.click(screen.getByTestId("toggle-aws.guardduty"));
    for (const st of ["off", "on", "auto"]) {
      expect(screen.getByTestId(`state-aws.db_autoscale-${st}`)).toBeTruthy();
    }
    expect(screen.getByTestId("registry-aws.guardduty").textContent).toContain(
      "guardduty_enabled = false",
    );
    expect(screen.getByText(/Amazon Brand New Thing/)).toBeTruthy();
  });
});
