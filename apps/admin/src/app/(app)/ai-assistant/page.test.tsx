import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

const posts: { path: string; body?: unknown }[] = [];
const puts: { key: string; body: unknown }[] = [];
let status: Record<string, unknown>;
let pullList: Record<string, unknown>;

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn(async (path: string) => ({ data: { data: path.endsWith('/pulls') ? pullList : status } })),
    PUT: vi.fn(async (_path: string, init: { params: { path: { key: string } }; body: unknown }) => {
      puts.push({ key: init.params.path.key, body: init.body });
      return { data: { data: {} } };
    }),
    POST: vi.fn(async (path: string, init: { body: unknown; params?: { path: { n: number } } }) => {
      const n = init.params?.path.n;
      posts.push({ path: n ? path.replace('{n}', String(n)) : path, body: init.body });
      return { data: { data: { number: n ?? 42, url: 'https://github.com/o/r/issues/42', mergedSha: 'b' } } };
    }),
  },
}));

import AiAssistantPage from './page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AiAssistantPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const base = {
  mode: 'auto',
  connected: true,
  allowed: true,
  reason: null,
  tasksAllowed: true,
  tasksReason: null,
  monthUsd: 1.5,
  maxUsd: 30,
  tasks: [
    {
      number: 7,
      title: 'Crash on the case screen',
      state: 'open',
      url: 'https://github.com/o/r/issues/7',
      createdAt: '2026-11-09T01:00:00Z',
      pulls: [{ number: 9, url: 'https://github.com/o/r/pull/9', state: 'open', merged: false }],
    },
  ],
  tasksError: null,
  runs: [
    {
      at: '2026-11-09T01:30:00Z',
      kind: 'task',
      issueNumber: 7,
      runUrl: 'https://github.com/o/r/actions/runs/1',
      costUsd: 0.42,
      conclusion: 'success',
      prUrl: 'https://github.com/o/r/pull/9',
    },
  ],
};

const SHA = 'a'.repeat(40);
const aiPull = {
  number: 9,
  title: 'fix: crash on the case screen',
  url: 'https://github.com/o/r/pull/9',
  summary: '## What\nCrash on open\n## Why\nnull title',
  headSha: SHA,
  branch: 'ai/issue-7',
  createdAt: '2026-11-12T01:00:00Z',
  checks: 'success',
  costUsd: 0.4,
};

beforeEach(() => {
  posts.length = 0;
  puts.length = 0;
  status = { ...base };
  pullList = { pulls: [aiPull], error: null };
});
afterEach(cleanup);

describe('«Задача для ИИ»', () => {
  it('not connected: says so honestly and the button stays off', async () => {
    status = { ...base, connected: false, allowed: false, reason: 'Не подключено: нет GitHub-приложения', tasks: [], runs: [] };
    renderPage();
    expect(await screen.findByText(/Не подключено: нет GitHub-приложения/)).toBeTruthy();
    expect(screen.getByText('GitHub не подключён')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Отдать ИИ' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the task, its PR, the money and the run cost', async () => {
    renderPage();
    expect(await screen.findByText(/#7 Crash on the case screen/)).toBeTruthy();
    expect(screen.getByText('PR ждёт проверки')).toBeTruthy();
    expect(screen.getByText('PR #9').getAttribute('href')).toBe('https://github.com/o/r/pull/9');
    expect(screen.getByText(/\$1\.50 из \$30\.00/)).toBeTruthy();
    expect(screen.getByText(/\$0\.42/)).toBeTruthy();
  });

  it('Выкл / Вкл / Авто: the current one is marked, another is saved to ai.assistant_mode', async () => {
    renderPage();
    await screen.findByText(/#7 Crash/);
    expect((screen.getByRole('button', { name: 'Авто' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Выкл' }));
    await waitFor(() => expect(puts).toEqual([{ key: 'ai.assistant_mode', body: { value: 'off' } }]));
  });

  it('Выкл: no new task can be sent', async () => {
    status = { ...base, mode: 'off', allowed: false, reason: 'ИИ-помощник выключен' };
    renderPage();
    await screen.findByText(/ИИ-помощник выключен/);
    expect((screen.getByRole('button', { name: 'Отдать ИИ' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a task is sent as title + details', async () => {
    renderPage();
    await screen.findByText(/#7 Crash/);
    fireEvent.change(screen.getByLabelText('Коротко: что не так'), { target: { value: 'Fix the bid list' } });
    fireEvent.change(screen.getByLabelText(/Подробно/), { target: { value: 'The list is empty after a refresh.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отдать ИИ' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      path: '/admin/ai-assistant/tasks',
      body: { title: 'Fix the bid list', details: 'The list is empty after a refresh.' },
    });
  });

  it('Авто: the assistant watches by itself, tasks only in Вкл (says why)', async () => {
    status = {
      ...base,
      tasksAllowed: false,
      tasksReason: 'Режим «Авто»: задачи из админки он берёт только в режиме «Вкл».',
    };
    renderPage();
    expect(await screen.findByText(/задачи из админки он берёт только/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Отдать ИИ' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('an AI PR: CI state, what/why, «Разрешить» sends the sha the owner saw', async () => {
    renderPage();
    expect(await screen.findByText(/PR #9 fix: crash on the case screen/)).toBeTruthy();
    expect(screen.getByText('CI зелёный')).toBeTruthy();
    expect(screen.getByText(/Crash on open/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Разрешить (код 2FA)' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: '/admin/ai-assistant/pulls/9/approve', body: { headSha: SHA } });
  });

  it('CI not green: «Разрешить» stays off; «Отклонить» closes the PR', async () => {
    pullList = { pulls: [{ ...aiPull, checks: 'pending' }], error: null };
    renderPage();
    await screen.findByText('CI идёт');
    expect((screen.getByRole('button', { name: 'Разрешить (код 2FA)' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].path).toBe('/admin/ai-assistant/pulls/9/reject');
  });
});
