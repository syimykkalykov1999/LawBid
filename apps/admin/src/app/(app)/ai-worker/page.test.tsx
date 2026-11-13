import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { agreementText, runProgress } from '@/lib/ai-worker';

const posts: { path: string; body?: unknown; params?: unknown }[] = [];
const gets: { path: string; params?: unknown }[] = [];
let status: Record<string, unknown>;
let items: Record<string, unknown>[];

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn(async (path: string, init?: { params?: unknown }) => {
      gets.push({ path, params: init?.params });
      if (path === '/admin/ai-worker/items') return { data: { data: { items, nextCursor: null } } };
      return { data: { data: status } };
    }),
    POST: vi.fn(async (path: string, init: { body?: unknown; params?: unknown }) => {
      posts.push({ path, body: init?.body, params: init?.params });
      return { data: { data: { id: 'x', updated: 1, total: 3 } } };
    }),
  },
}));

import AiWorkerPage from './page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AiWorkerPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const ROLE = {
  id: 'r1',
  name: 'Документы адвокатов',
  instructions: 'Проверяй лицензию, штат, срок и совпадение имени.',
  queue: 'attorney_verification',
  model: 'claude-opus-5-5',
  confidenceMin: 90,
  auditPct: 10,
  reviewed: 10,
  agreed: 9,
  agreementPct: 90,
  createdAt: '2026-11-12T10:00:00Z',
};

const base = {
  enabled: true,
  budgetCents: 500,
  spentCents: 12,
  models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  defaultModel: 'claude-opus-5-5',
  queues: [{ key: 'attorney_verification', label: 'Проверка документов адвокатов' }],
  toReview: 3,
  toReviewByLane: { priority: 1, audit: 0, bulk: 2 },
  roles: [ROLE],
  runs: [
    {
      id: 'run1',
      roleId: 'r1',
      roleName: 'Документы адвокатов',
      status: 'running',
      model: 'claude-opus-5-5',
      total: 10,
      proposed: 4,
      failed: 1,
      inFlight: true,
      costCents: 3.5,
      error: null,
      createdAt: '2026-11-12T10:00:00Z',
      finishedAt: null,
    },
  ],
  proposals: [],
};

const ITEM = {
  id: 'i1',
  runId: 'run1',
  roleName: 'Документы адвокатов',
  itemId: 'req1',
  status: 'proposed',
  decision: 'approve',
  confidence: 62,
  lane: 'priority',
  flags: ['licence_CA_past_expiry'],
  reasons: ['Лицензия CA активна'],
  evidence: [{ source: 'licence 1', note: 'verified' }],
  draftNote: '',
  injectionSuspected: true,
  error: null,
  costCents: 0.4,
  reviewedAt: null,
  ownerDecision: null,
  ownerNote: null,
};

beforeEach(() => {
  posts.length = 0;
  gets.length = 0;
  status = { ...base };
  items = [ITEM];
});
afterEach(cleanup);

describe('«ИИ-сотрудник»', () => {
  it('shows the priority lane first, with confidence, evidence, red flags and the injection warning', async () => {
    renderPage();
    expect(await screen.findByText('Лицензия CA активна')).toBeTruthy();
    expect(gets.find((g) => g.path === '/admin/ai-worker/items')?.params).toEqual({ query: { status: 'proposed', lane: 'priority' } });
    expect(screen.getByText(/уверенность 62 %/)).toBeTruthy();
    expect(screen.getByText(/licence 1 — verified/)).toBeTruthy();
    expect(screen.getByText('licence_CA_past_expiry')).toBeTruthy();
    expect(screen.getByText('Попытка обмана ИИ')).toBeTruthy();
    expect(screen.getByText(/90 % \(9 из 10\)/)).toBeTruthy();
  });

  it('«Верно» approves one proposal', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Верно' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ path: '/admin/ai-worker/items/review', body: { ids: ['i1'], verdict: 'approved' } });
  });

  it('«Неверно» records the owner’s correction and note (taught back to the role)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Неверно' }));
    fireEvent.change(screen.getByLabelText('Почему'), { target: { value: 'Лицензия истекла' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ ids: ['i1'], verdict: 'rejected', ownerDecision: 'reject', ownerNote: 'Лицензия истекла' });
  });

  it('the confident lane approves the whole list in one tap', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Уверенные · 2/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Утвердить весь список \(2\)/ }));
    await waitFor(() => expect(posts.some((p) => p.path === '/admin/ai-worker/items/approve-bulk')).toBe(true));
  });

  it('starts a background run of a role', async () => {
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Запустить' });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(posts[0]?.path).toBe('/admin/ai-worker/roles/{id}/runs'));
    expect(posts[0].params).toEqual({ path: { id: 'r1' } });
  });

  it('master switch off: says so and the run button stays off', async () => {
    status = { ...base, enabled: false };
    renderPage();
    expect(await screen.findByText(/Режим ИИ выключен/)).toBeTruthy();
    const run = screen.getAllByRole('button', { name: 'Запустить' })[0] as HTMLButtonElement;
    expect(run.disabled).toBe(true);
  });

  it('a proposal «могу взять на себя» lists its examples', async () => {
    status = {
      ...base,
      roles: [],
      proposals: [
        {
          queue: 'attorney_verification',
          label: 'Проверка документов адвокатов',
          open: 12,
          roleId: null,
          text: 'Могу взять на себя «Проверка документов адвокатов»: ждут 12.',
          examples: [
            { itemId: 'a', summary: 'ждёт 3 дн.; документы: bar_license' },
            { itemId: 'b', summary: 'ждёт 2 дн.; документы: selfie' },
            { itemId: 'c', summary: 'ждёт 1 дн.; документы: нет' },
          ],
        },
      ],
    };
    renderPage();
    expect(await screen.findByText(/ждут 12/)).toBeTruthy();
    expect(screen.getByText('ждёт 2 дн.; документы: selfie')).toBeTruthy();
  });
});

describe('ai-worker labels', () => {
  it('agreement and progress', () => {
    expect(agreementText({ reviewed: 0, agreed: 0, agreementPct: null })).toBe('ещё нет решений');
    expect(runProgress({ total: 10, proposed: 4, failed: 1 })).toBe(50);
  });
});
