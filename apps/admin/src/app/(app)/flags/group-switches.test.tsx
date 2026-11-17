import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owner 16.11 (row 183): the card «Группы в чатах» carries a second switch
 * «Звонки в группах»; each switch writes its own flag, both start on, and
 * the calls switch has no card of its own.
 */
const flags = vi.hoisted(() => ({
  rows: [] as { key: string; enabled: boolean }[],
  patches: [] as { key: string; enabled: boolean }[],
  bodies: [] as Record<string, unknown>[],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), undo: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={String(href)}>{children}</a>
  ),
}));
vi.mock("motion/react-m", () => {
  const Plain = ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) => {
    const dom = Object.fromEntries(
      Object.entries(rest).filter(([k]) => !["initial", "animate", "transition", "layout", "layoutId"].includes(k)),
    );
    return <div {...dom}>{children}</div>;
  };
  // Every m.<tag> renders as a plain element, as the old motion/react mock did.
  const tags = ["div", "span", "p", "a", "ul", "li", "tr", "td", "button", "section", "header", "nav", "aside", "main", "form", "label", "h1", "h2", "h3", "img", "svg", "path"];
  return Object.fromEntries(tags.map((t) => [t, Plain]));
});
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
      flags.bodies.push(opts.body as unknown as Record<string, unknown>);
      const row = flags.rows.find((r) => r.key === opts.params.path.key);
      if (row) row.enabled = opts.body.enabled;
      return { data: { data: row } };
    },
  },
}));

import FlagsPage from "./page";

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
    { key: "groups", enabled: true },
    { key: "groups_calls", enabled: true },
  ];
  flags.patches = [];
  flags.bodies = [];
});
afterEach(cleanup);

describe("«Группы в чатах» card (row 183)", () => {
  it("one card, two switches, both on", async () => {
    mount();
    const groups = await screen.findByRole("switch", { name: "Группы в чатах" });
    const calls = screen.getByRole("switch", { name: "Звонки в группах" });
    expect(groups.getAttribute("aria-checked")).toBe("true");
    expect(calls.getAttribute("aria-checked")).toBe("true");
    // the calls flag has no card of its own: its title shows once
    expect(screen.getAllByText("Звонки в группах")).toHaveLength(1);
  });

  it("calls off leaves the groups on (and the other way round)", async () => {
    mount();
    const calls = await screen.findByRole("switch", { name: "Звонки в группах" });
    fireEvent.click(calls);
    await waitFor(() => expect(flags.patches).toEqual([{ key: "groups_calls", enabled: false }]));
    expect(flags.rows.find((r) => r.key === "groups")?.enabled).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Группы в чатах" }).getAttribute("aria-disabled")).not.toBe("true"),
    );
    await waitFor(() => expect(screen.getByRole("switch", { name: "Группы в чатах" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("switch", { name: "Группы в чатах" }));
    await waitFor(() => expect(flags.patches).toContainEqual({ key: "groups", enabled: false }));
    expect(flags.rows.find((r) => r.key === "groups_calls")?.enabled).toBe(false);
  });
});
