import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const GET = vi.fn();
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/api/client", () => ({
  api: { GET: (...a: unknown[]) => GET(...a), POST: vi.fn() },
  errorText: (e: unknown) => String(e),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/components/legacy/confirm", () => ({
  useConfirm: () => ({ confirm: async () => true, dialog: null }),
}));

import MediaModerationPage from "./page";

const row = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  purpose: "post_image",
  status: "flagged",
  topLabel: null,
  maxConfidence: null,
  skipReason: null,
  previewUrl: null,
  ownerUserId: "u1",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MediaModerationPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  GET.mockReset();
});

describe("MediaModerationPage", () => {
  it("рисует строки, в том числе с пустыми полями", async () => {
    GET.mockResolvedValue({
      data: {
        data: {
          items: [
            row(),
            row({
              id: "m2",
              status: "csam_match",
              previewUrl: "https://x/y.jpg",
              topLabel: "x",
              maxConfidence: 91.4,
              skipReason: "weird",
            }),
          ],
          nextCursor: null,
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getAllByText("Удалить").length).toBe(2));
  });

  it("пустой список — подсказка, а не падение", async () => {
    GET.mockResolvedValue({ data: { data: { items: [], nextCursor: null } } });
    mount();
    await waitFor(() =>
      expect(screen.getByText("Ничего не ждёт решения.")).toBeTruthy(),
    );
  });

  it("ответ без items не роняет страницу", async () => {
    GET.mockResolvedValue({ data: { data: { nextCursor: null } } });
    mount();
    await waitFor(() =>
      expect(screen.getByText("Ничего не ждёт решения.")).toBeTruthy(),
    );
  });

  it("ошибка сервера показывается заметкой, страница живая", async () => {
    GET.mockResolvedValue({ data: undefined, error: { message: "boom" } });
    mount();
    await waitFor(() => expect(screen.getByText("Фото и видео")).toBeTruthy());
  });
});
