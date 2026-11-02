/// <reference types="vite/client" />
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke: every admin page mounts and survives a slow or failing server
 * (loading state, 5xx error) without throwing — a throw here is the
 * «Страница не открылась» screen in production (media-moderation, 2026-11-01).
 */
type Mode = "loading" | "error";
let mode: Mode = "loading";
const call = () =>
  mode === "loading"
    ? new Promise(() => undefined)
    : // The real client's `toProxy` middleware throws ApiError on any non-2xx reply.
      Promise.reject(Object.assign(new Error("boom"), { status: 500 }));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
for (const name of ["IntersectionObserver", "ResizeObserver"])
  vi.stubGlobal(
    name,
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/x",
  useParams: () => ({ id: "id1", slug: "s", code: "c" }),
  notFound: () => undefined,
  redirect: () => undefined,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={String(href)}>{children}</a>
  ),
}));
vi.mock("@/lib/api/client", async (orig) => {
  const real = await orig<typeof import("@/lib/api/client")>();
  return {
    ...real,
    api: { GET: call, POST: call, PUT: call, PATCH: call, DELETE: call },
  };
});

const pages = Object.entries(import.meta.glob("./**/page.tsx")).filter(
  ([path]) => path.startsWith("./(app)/"),
);

function mount(Page: ComponentType<unknown>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Page
        {...({
          params: Promise.resolve({ id: "id1" }),
          searchParams: Promise.resolve({}),
        } as object)}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("admin pages smoke", () => {
  const modes: [string, Mode][] = [
    ["сервер думает (загрузка)", "loading"],
    ["сервер ответил ошибкой", "error"],
  ];
  for (const [path, load] of pages) {
    for (const [name, m] of modes) {
      it(`${path} — ${name}`, async () => {
        mode = m;
        const mod = (await load().catch((e: Error) => {
          // Server-component pages import server-only code; they render on the server.
          if (/server-only/.test(e.message)) return null;
          throw e;
        })) as { default: ComponentType<unknown> } | null;
        if (!mod) return;
        // Async server components render on the server, not in jsdom.
        if (mod.default.constructor.name === "AsyncFunction") return;
        expect(() => mount(mod.default)).not.toThrow();
        await new Promise((res) => setTimeout(res, 20));
      });
    }
  }
});
