import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owner 2026-11-04 (R-398): on «Функции» the client-reels card is ONE
 * three-way choice (Выключено / Бесплатно всем / Только с галочкой) over two
 * flags; the second flag has no card of its own.
 */
const flags = vi.hoisted(() => ({
  rows: [] as { key: string; enabled: boolean }[],
  patches: [] as { key: string; enabled: boolean }[],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={String(href)}>{children}</a>
  ),
}));
vi.mock("motion/react", () => ({
  m: new Proxy(
    {},
    {
      get: () => ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) => {
        const dom = Object.fromEntries(
          Object.entries(rest).filter(([k]) => !["initial", "animate", "transition", "layout", "layoutId"].includes(k)),
        );
        return <div {...dom}>{children}</div>;
      },
    },
  ),
}));
vi.mock("@/lib/api/client", () => ({
  errorText: (e: unknown) => String(e),
  api: {
    GET: async () => ({
      data: {
        data: flags.rows.map((r) => ({
          ...r,
          rolloutPercent: 100,
          description: null,
          paid: false,
          missingKeys: [],
          updatedAt: "2026-11-04T00:00:00Z",
        })),
      },
    }),
    PATCH: async (
      _path: string,
      opts: { params: { path: { key: string } }; body: { enabled: boolean } },
    ) => {
      flags.patches.push({ key: opts.params.path.key, enabled: opts.body.enabled });
      const row = flags.rows.find((r) => r.key === opts.params.path.key);
      if (row) row.enabled = opts.body.enabled;
      return { data: { data: row } };
    },
  },
}));

import FlagsPage from "./page";

const selected = (label: string) =>
  screen.getByRole("tab", { name: label }).getAttribute("aria-selected");

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FlagsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  flags.rows = [
    { key: "video_posts", enabled: true },
    { key: "reels_client_publish", enabled: false },
    { key: "reels_client_publish_paid_only", enabled: false },
  ];
  flags.patches = [];
});
afterEach(() => cleanup());

describe("«Рилсы: публикация клиентами» — three-way choice", () => {
  it("shows one control with the three labels and no card for the second flag", async () => {
    mount();
    await screen.findByText("Рилсы: публикация клиентами");
    const control = screen.getByTestId("reels-client-mode");
    for (const label of ["Выключено", "Бесплатно всем", "Только с галочкой"])
      expect(control.textContent).toContain(label);
    expect(screen.queryByText(/paid only/i)).toBeNull();
    expect(screen.queryByText("Reels client publish paid only")).toBeNull();
    // The card has no on/off switch of its own: the mode is the control.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(selected("Выключено")).toBe("true");
  });

  it("«Только с галочкой» writes the narrowing first, then opens the gate", async () => {
    mount();
    await screen.findByText("Рилсы: публикация клиентами");
    fireEvent.click(screen.getByRole("tab", { name: "Только с галочкой" }));
    await waitFor(() => expect(flags.patches).toHaveLength(2));
    expect(flags.patches).toEqual([
      { key: "reels_client_publish_paid_only", enabled: true },
      { key: "reels_client_publish", enabled: true },
    ]);
    await waitFor(() => expect(selected("Только с галочкой")).toBe("true"));
    expect(screen.getByTestId("reels-client-mode").textContent).toContain("Публикация рилсов");
  });

  it("«Бесплатно всем» from «Только с галочкой» drops only the narrowing", async () => {
    flags.rows[1].enabled = true;
    flags.rows[2].enabled = true;
    mount();
    await screen.findByText("Рилсы: публикация клиентами");
    expect(selected("Только с галочкой")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Бесплатно всем" }));
    await waitFor(() => expect(flags.patches).toEqual([{ key: "reels_client_publish_paid_only", enabled: false }]));
  });
});
