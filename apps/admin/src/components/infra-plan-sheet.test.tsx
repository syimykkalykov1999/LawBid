import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InfraRequest } from "@/lib/infra";
import { costLine, minutesLeft, planLine } from "@/lib/infra";

vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: { GET: vi.fn(), POST: vi.fn() },
}));
vi.mock("@/lib/live", () => ({ livePoll: () => false }));

import { InfraPlanSheet } from "./infra-plan-sheet";

const req = (o: Partial<InfraRequest> = {}): InfraRequest => ({
  id: "00000000-0000-4000-8000-000000000001",
  itemId: "aws.opensearch",
  itemName: "Поисковый движок (OpenSearch)",
  fromState: "off",
  toState: "on",
  changes: { "growth.opensearch_enabled": true },
  status: "planned",
  costDeltaUsd: [28, 280],
  dryRun: false,
  rollbackOf: null,
  plan: {
    add: 2,
    change: 1,
    destroy: 0,
    resources: [
      {
        address: "module.stack.module.growth.aws_opensearch_domain.search[0]",
        action: "create",
      },
    ],
  },
  runUrl: "https://github.com/o/r/actions/runs/42",
  recorded: null,
  error: null,
  impact: "Без перерыва: движок создаётся 15–30 минут.",
  createdAt: "2026-10-26T10:00:00Z",
  plannedAt: "2026-10-26T10:03:00Z",
  expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  finishedAt: null,
  ...o,
});

afterEach(() => cleanup());

function sheet(r: InfraRequest | null, dryRunMode = false) {
  const h = {
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRollback: vi.fn(),
  };
  render(
    <InfraPlanSheet
      request={r}
      dryRunMode={dryRunMode}
      busy={false}
      {...h}
    />,
  );
  return h;
}

describe("«План: …» sheet for a cloud switch", () => {
  it("shows resources +/−, the monthly cost from the registry, the impact and the 2FA confirm", async () => {
    const h = sheet(req());
    const plan = await screen.findByTestId("infra-sheet-plan");
    expect(plan.textContent).toContain("+2 добавить");
    expect(plan.textContent).toContain("~1 изменить");
    expect(plan.textContent).toContain("−0 удалить");
    expect(screen.getByTestId("infra-sheet-cost").textContent).toContain(
      "+$28–280 в месяц",
    );
    expect(plan.textContent).toContain("Без перерыва");
    expect(screen.getByTestId("infra-sheet-status").textContent).toContain(
      "нужен ваш код",
    );
    expect(screen.getByText(/План действует ещё/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("infra-confirm"));
    expect(h.onConfirm).toHaveBeenCalledWith(req().id);
    fireEvent.click(screen.getByTestId("infra-cancel"));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("infra-rollback")).toBeNull();
  });

  it("while GitHub plans there is nothing to confirm yet", async () => {
    sheet(req({ status: "planning", plan: null, expiresAt: null }));
    expect((await screen.findByTestId("infra-sheet-plan")).textContent).toContain(
      "План ещё готовится",
    );
    expect(screen.queryByTestId("infra-confirm")).toBeNull();
    expect(screen.getByTestId("infra-cancel")).toBeTruthy();
  });

  it("a finished change offers «Откатить»; a failed one shows why", async () => {
    const h = sheet(req({ status: "done", expiresAt: null }));
    fireEvent.click(await screen.findByTestId("infra-rollback"));
    expect(h.onRollback).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("infra-confirm")).toBeNull();
    cleanup();
    sheet(req({ status: "failed", error: "План удаляет данные, это запрещено" }));
    expect((await screen.findByTestId("infra-sheet-error")).textContent).toContain(
      "запрещено",
    );
    expect(screen.queryByTestId("infra-confirm")).toBeNull();
  });

  it("dry-run mode says the cloud is not changed", async () => {
    sheet(req({ status: "dry_run", expiresAt: null }), true);
    expect(await screen.findByText(/облако не меняется/)).toBeTruthy();
    expect(screen.queryByTestId("infra-confirm")).toBeNull();
  });

  it("nothing is rendered without a request", () => {
    sheet(null);
    expect(screen.queryByTestId("infra-sheet")).toBeNull();
  });
});

describe("infra helpers", () => {
  it("cost and plan lines in plain words", () => {
    expect(costLine([28, 280])).toBe("+$28–280 в месяц");
    expect(costLine([-11, -11])).toBe("−$11 в месяц");
    expect(costLine([-280, -28])).toBe("−$28–280 в месяц");
    expect(costLine([0, 0])).toBe("без изменения цены");
    expect(planLine({ plan: null })).toContain("готовится");
    const now = new Date("2026-10-26T10:00:00Z");
    expect(minutesLeft({ expiresAt: "2026-10-26T10:29:30Z" }, now)).toBe(30);
    expect(minutesLeft({ expiresAt: null }, now)).toBeNull();
  });
});
