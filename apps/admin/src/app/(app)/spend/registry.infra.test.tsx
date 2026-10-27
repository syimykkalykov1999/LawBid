import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { CostRegistryReport, CostRegistryRow } from "@/lib/launch";
import type { InfraOverview, InfraRequest } from "@/lib/infra";

/**
 * Owner 2026-10-26: a whitelisted Terraform row is flipped from «Расходы»:
 * Вкл makes a change request (not the app-setting PATCH), the «План: …»
 * sheet opens, the 2FA confirm goes to /confirm.
 */
const os: CostRegistryRow = {
  id: "aws.opensearch",
  name: "Поисковый движок (OpenSearch)",
  purpose: "Быстрый поиск.",
  kind: "aws",
  controlType: "tfvars",
  controlKey: "growth.opensearch_enabled",
  editable: true,
  infraSwitch: true,
  lockedReason: null,
  states: ["off", "on"],
  defaultState: "off",
  state: "off",
  stateKnown: false,
  stateNote: null,
  stateHints: {},
  ceilingLabel: null,
  ceilingKey: null,
  ceilingWhere: null,
  priceText: "t3.small ≈ $28 в месяц",
  priceModel: "fixed",
  priceSourceUrl: "https://aws.amazon.com/opensearch-service/pricing/",
  priceCheckedAt: "2026-10-25",
  priceVerified: true,
  usdLaunch: [0, 0],
  usdK100: [0, 0],
  usdM1: [0, 0],
  ifOnUsd: [28, 280],
  needed: "later",
  neededNote: "Когда поиск тормозит.",
  alarm: null,
  note: null,
  ceService: null,
  status: { state: "off", live: "idle", reason: "Выкл.", checkedAt: "2026-10-26T10:00:00Z" },
  monthUsd: null,
  projectedUsd: null,
  monthSource: "none",
  steps: { off: ["x"], on: ["y"] },
};

const report: CostRegistryReport = {
  generatedAt: "2026-10-26T10:00:00Z",
  spendRefreshedAt: null,
  rows: [os],
  unclaimed: [],
  ladder: {
    dayOne: { aws: [1, 1], vendors: [1, 1], all: [2, 2] },
    scenarios: [],
    monthToDateUsd: null,
    projectedUsd: null,
  },
};

const planned: InfraRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  itemId: "aws.opensearch",
  itemName: os.name,
  fromState: "off",
  toState: "on",
  changes: { "growth.opensearch_enabled": true },
  status: "planned",
  costDeltaUsd: [28, 280],
  dryRun: false,
  rollbackOf: null,
  plan: { add: 3, change: 0, destroy: 0, resources: [] },
  runUrl: null,
  recorded: null,
  error: null,
  impact: "",
  createdAt: "2026-10-26T10:00:00Z",
  plannedAt: "2026-10-26T10:02:00Z",
  expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
  finishedAt: null,
};

let requests: InfraRequest[] = [];
const overview = (): InfraOverview => ({
  guards: { dryRun: false, dailyCap: 3, quietHours: "", configured: true, inQuietWindow: true },
  switchable: ["aws.opensearch"],
  requests,
  suggestions: [],
});
const post = vi.fn(async (path: string) => {
  if (path === "/admin/infra/requests") {
    requests = [planned];
    return { data: { data: planned } };
  }
  return { data: { data: { ...planned, status: "confirmed" } } };
});
const patch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn(async (path: string) => ({
      data: { data: path === "/admin/infra" ? overview() : report },
    })),
    POST: (...a: unknown[]) => (post as unknown as (...x: unknown[]) => unknown)(...a),
    PATCH: (...a: unknown[]) => (patch as unknown as (...x: unknown[]) => unknown)(...a),
  },
}));
vi.mock("@/lib/live", () => ({ livePoll: () => false }));

import { CostRegistry } from "./registry";

afterEach(() => {
  cleanup();
  localStorage.clear();
  requests = [];
  post.mockClear();
  patch.mockClear();
});

describe("cloud switch on «Расходы»", () => {
  it("Вкл creates a change request, opens the plan sheet, and the confirm asks the API", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <CostRegistry />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const on = (await screen.findByTestId("state-aws.opensearch-on")) as HTMLButtonElement;
    expect(on.disabled).toBe(false);
    fireEvent.click(on);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/infra/requests", {
        body: { itemId: "aws.opensearch", to: "on" },
      }),
    );
    expect(patch).not.toHaveBeenCalled();
    const sheet = await screen.findByTestId("infra-sheet");
    expect(sheet.textContent).toContain("+3 добавить");
    expect(sheet.textContent).toContain("+$28–280 в месяц");
    fireEvent.click(screen.getByTestId("infra-confirm"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/infra/requests/{id}/confirm", {
        params: { path: { id: planned.id } },
      }),
    );
    // While the request runs the row shows its status chip.
    expect(await screen.findByTestId("infra-chip-aws.opensearch")).toBeTruthy();
  });
});
