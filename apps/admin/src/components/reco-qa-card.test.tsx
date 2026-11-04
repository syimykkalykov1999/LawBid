import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";

const { answers, put, post } = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
  put: vi.fn(() => Promise.resolve({ data: { data: {} } })),
  post: vi.fn(() =>
    Promise.resolve({
      data: {
        data: {
          enabled: true,
          lastRunAt: "2026-11-04T05:20:00.000Z",
          durationMs: 3200,
          attorneys: 12,
          questions: 40,
          cases: 9,
          queued: true,
        },
      },
    }),
  ),
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    code = "";
  },
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn((path: string) =>
      Promise.resolve({ data: { data: answers.get(path) ?? {} } }),
    ),
    PUT: put,
    POST: post,
  },
}));
vi.mock("@/components/step-up-dialog", () => ({ StepUpDialog: () => null }));

import { RECO_QA_WEIGHTS, RecoQaCard, recoQaLine } from "./reco-qa-card";

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RecoQaCard />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** R-401: the weights form and «Пересчитать сейчас». */
describe("RecoQaCard", () => {
  beforeEach(() => {
    answers.clear();
    put.mockClear();
    post.mockClear();
    answers.set("/admin/system-health/reco-qa", {
      enabled: true,
      lastRunAt: null,
      durationMs: 0,
      attorneys: 0,
      questions: 0,
      cases: 0,
      queued: false,
    });
    answers.set(
      "/admin/config",
      RECO_QA_WEIGHTS.map((w, i) => ({
        key: w.key,
        value: 0.1 * (i + 1),
        defaultValue: 0.1 * (i + 1),
      })),
    );
  });
  afterEach(cleanup);

  it("shows every weight with its Russian label and the current value", async () => {
    mount();
    for (const w of RECO_QA_WEIGHTS) {
      await waitFor(() =>
        expect(
          (screen.getByLabelText(w.label) as HTMLInputElement).value,
        ).not.toBe(""),
      );
    }
    expect(screen.getByText(/Ещё не считалось/)).toBeTruthy();
    expect(screen.getByText("Включено")).toBeTruthy();
  });

  it("a changed weight gets a Save button that PUTs the number to its key", async () => {
    mount();
    const input = (await screen.findByLabelText(
      "Лайки на ответах",
    )) as HTMLInputElement;
    expect(screen.queryByText("Сохранить")).toBeNull();
    fireEvent.change(input, { target: { value: "0.45" } });
    fireEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]).toEqual([
      "/admin/config/{key}",
      { params: { path: { key: "reco.qa.likes" } }, body: { value: 0.45 } },
    ]);
  });

  it("«Пересчитать сейчас» POSTs and shows the new last run", async () => {
    mount();
    fireEvent.click(await screen.findByText("Пересчитать сейчас"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/admin/system-health/reco-qa/recompute",
      ),
    );
    await screen.findByText(
      /12 адвокатов с баллом, 40 открытых вопросов, 9 открытых кейсов, 3 с/,
    );
  });

  it("recoQaLine: before the first run, and after", () => {
    expect(recoQaLine(undefined)).toBe("Загрузка…");
    expect(
      recoQaLine({
        enabled: true,
        lastRunAt: null,
        durationMs: 0,
        attorneys: 0,
        questions: 0,
        cases: 0,
        queued: false,
      }),
    ).toMatch(/Ещё не считалось/);
    expect(
      recoQaLine({
        enabled: true,
        lastRunAt: "2026-11-04T05:20:00.000Z",
        durationMs: 1500,
        attorneys: 3,
        questions: 4,
        cases: 5,
        queued: false,
      }),
    ).toMatch(
      /3 адвокатов с баллом, 4 открытых вопросов, 5 открытых кейсов, 2 с/,
    );
  });
});
