import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Row 150: each flag card offers the way people are split for a partial
 * rollout (old FNV-1a or GrowthBook v2); changing it asks first. */
const flags = vi.hoisted(() => ({
  rows: [] as { key: string; enabled: boolean; hashVersion: number }[],
  patches: [] as Record<string, unknown>[],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
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
      opts: { params: { path: { key: string } }; body: Record<string, unknown> },
    ) => {
      flags.patches.push({ key: opts.params.path.key, ...opts.body });
      const row = flags.rows.find((r) => r.key === opts.params.path.key);
      if (row && typeof opts.body.hashVersion === "number") row.hashVersion = opts.body.hashVersion;
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
  flags.rows = [{ key: "video_posts", enabled: true, hashVersion: 1 }];
  flags.patches = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("«Деление людей» on a flag card", () => {
  it("shows the stored way (old for a flag from before)", async () => {
    mount();
    const select = (await screen.findByLabelText(/деление людей/)) as HTMLSelectElement;
    expect(select.value).toBe("1");
    expect(select.textContent).toContain("Новое (ровное, как в GrowthBook)");
  });

  it("asks first and sends only hashVersion", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    const select = await screen.findByLabelText(/деление людей/);
    fireEvent.change(select, { target: { value: "2" } });
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(flags.patches).toEqual([{ key: "video_posts", hashVersion: 2 }]));
  });

  it("a «no» changes nothing", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    const select = await screen.findByLabelText(/деление людей/);
    fireEvent.change(select, { target: { value: "2" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(flags.patches).toEqual([]);
  });
});
