import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/** Owner 2026-11-12: «Масштаб» → «База: копия для чтения и разделение таблиц»
 * tells the truth about prod (cloud-made copies, the partition login). */
const answers = new Map<string, unknown>();

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn((path: string) => Promise.resolve({ data: { data: answers.get(path) } })),
    POST: vi.fn(),
  },
}));
vi.mock('@/lib/live', () => ({ livePoll: () => false }));

import { ScaleSwitches, runnerHint } from './scale-switches';

const card = {
  table: 'messages',
  label: 'сообщения чатов (по хешу)',
  rows: 1200,
  bytes: 4_000_000,
  partitioned: false,
  partitions: 0,
  state: 'idle',
  blockedBy: [],
  progress: null,
  phase: null,
  error: null,
  paused: false,
  canStart: false,
  canUndo: false,
  canFinalize: false,
  finalizeAfter: null,
  overThreshold: false,
  runnerConfigured: false,
  mode: 'auto' as const,
  autoRows: 50_000_000,
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ScaleSwitches />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => answers.clear());
afterEach(cleanup);

describe('«Копия базы для чтения»', () => {
  it('cloud-made copies: «Работает», the count and lag, no app-path buttons', async () => {
    answers.set('/admin/system-health/db-replica', {
      state: 'managed',
      lagSeconds: 0.4,
      instanceClass: null,
      serving: true,
      copies: 1,
      note: 'Копий для чтения: 1. Их создаёт и убирает облако.',
    });
    answers.set('/admin/system-health/partitions', []);
    renderIt();
    expect(await screen.findByText('Работает')).toBeTruthy();
    expect(screen.getByText(/Копий для чтения: 1/)).toBeTruthy();
    expect(screen.getByText('0 с')).toBeTruthy();
    expect(screen.queryByText('Недоступно')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Включить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Выключить' })).toBeNull();
  });

  it('the button copy (app path) keeps its buttons', async () => {
    answers.set('/admin/system-health/db-replica', {
      state: 'off',
      lagSeconds: null,
      instanceClass: null,
      serving: false,
      copies: 0,
      note: 'Выключено.',
    });
    answers.set('/admin/system-health/partitions', []);
    renderIt();
    const on = await screen.findByRole('button', { name: 'Включить' });
    expect(on).toHaveProperty('disabled', false);
  });
});

describe('partition cards and the runner login', () => {
  it('no login yet: «Авто» explains the login comes by itself at the threshold; modes stay pressable', async () => {
    answers.set('/admin/system-health/db-replica', { state: 'unavailable', serving: false, copies: 0, note: 'x', lagSeconds: null, instanceClass: null });
    answers.set('/admin/system-health/partitions', [card]);
    renderIt();
    expect(await screen.findByText(/Авто: вход для деления \(роль lawbid_partition\) появится сам/)).toBeTruthy();
    expect(screen.queryByText(/PARTITION_DATABASE_URL/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Вкл' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Авто' })).toHaveProperty('disabled', true); // current
  });

  it('login present (here or in the worker): no hint', () => {
    expect(runnerHint({ ...card, runnerConfigured: true })).toBeNull();
  });

  it('security journals: no «Запустить заработает» promise, the reason says it is by design', () => {
    expect(
      runnerHint({
        ...card,
        mode: null,
        state: 'blocked',
        blockedBy: ['журнал безопасности: так задумано, кнопкой его не делят.'],
      }),
    ).toBeNull();
  });

  it('monthly tables without a mode point to the cloud row', () => {
    expect(runnerHint({ ...card, mode: null })).toContain('«Вход для деления больших таблиц»');
  });
});
