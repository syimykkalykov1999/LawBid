import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owner 14.11 (row 179, B5 / detective R3A-6): a switch save carries the
 * `updatedAt` the admin saw, so a tab that missed another admin's change
 * gets 409 «изменено другим» instead of silently putting the old value back.
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
    { key: "video_posts", enabled: true },
    { key: "reels_client_publish", enabled: false },
    { key: "reels_client_publish_paid_only", enabled: false },
  ];
  flags.patches = [];
  flags.bodies = [];
});
afterEach(() => cleanup());

describe("«Функции»: a switch save is checked against what the admin saw", () => {
  it("sends expectedUpdatedAt = the row's updatedAt", async () => {
    mount();
    await screen.findByText("Рилсы: публикация клиентами");
    const [sw] = screen.getAllByRole("switch");
    fireEvent.click(sw);
    await waitFor(() => expect(flags.bodies).toHaveLength(1));
    expect(flags.bodies[0]).toMatchObject({ expectedUpdatedAt: "2026-11-04T00:00:00Z" });
  });
});
