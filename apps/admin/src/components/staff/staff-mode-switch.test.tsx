import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above every import, so everything the factories touch is hoisted with it.
const h = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  const state = {
    entries: [] as { key: string; value: unknown }[],
    puts: [] as { key: string; body: unknown }[],
    putError: null as Error | null,
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  return { ApiError, state, toast };
});
const { ApiError, state, toast } = h;

vi.mock('@/lib/api/client', () => ({
  ApiError: h.ApiError,
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn(async () => ({ data: { data: h.state.entries } })),
    PUT: vi.fn(async (_path: string, init: { params: { path: { key: string } }; body: unknown }) => {
      if (h.state.putError) throw h.state.putError;
      h.state.puts.push({ key: init.params.path.key, body: init.body });
      return { data: { data: {} } };
    }),
  },
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => h.toast }));
vi.mock('@/components/step-up-dialog', () => ({
  StepUpDialog: ({ open, onDone }: { open: boolean; onDone: () => void }) =>
    open ? (
      <button type="button" onClick={onDone}>
        Код 2FA принят
      </button>
    ) : null,
}));

import { modeOf, StaffModeSwitch } from './staff-mode-switch';

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  state.entries = [
    { key: 'staff.rating_enabled', value: 'auto' },
    { key: 'staff.piecework_enabled', value: true },
  ];
  state.puts.length = 0;
  state.putError = null;
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

describe('StaffModeSwitch (owner rule 5c: Выкл / Вкл / Авто)', () => {
  it('reads the stored position: «auto» string, and an old boolean true = Вкл', () => {
    expect(modeOf('auto')).toBe('auto');
    expect(modeOf('off')).toBe('off');
    expect(modeOf(true)).toBe('on');
    expect(modeOf(false)).toBe('off');
    expect(modeOf('typo')).toBe('auto');
  });

  it('shows three buttons per switch with the current one pressed and says what «Авто» decides on', async () => {
    wrap(<StaffModeSwitch keys={['staff.rating_enabled', 'staff.piecework_enabled']} />);
    await waitFor(() => expect(screen.getByLabelText('Ночной рейтинг: Авто')).toHaveProperty('disabled', true));
    expect(screen.getByLabelText('Ночной рейтинг: Выкл')).toHaveProperty('disabled', false);
    expect(screen.getByLabelText('Сдельная оплата: Вкл')).toHaveProperty('disabled', true);
    expect(screen.getByText(/хоть один сотрудник кроме владельца/)).toBeTruthy();
    expect(screen.getByText(/хоть одна ставка/)).toBeTruthy();
  });

  it('a click saves the position through the settings route (value off/on/auto)', async () => {
    wrap(<StaffModeSwitch keys={['staff.rating_enabled']} />);
    await waitFor(() => expect(screen.getByLabelText('Ночной рейтинг: Авто')).toHaveProperty('disabled', true));
    fireEvent.click(screen.getByLabelText('Ночной рейтинг: Вкл'));
    await waitFor(() => expect(state.puts).toEqual([{ key: 'staff.rating_enabled', body: { value: 'on' } }]));
    expect(toast.success).toHaveBeenCalled();
  });

  it('a 2FA step-up is asked for and the same position is saved after the code', async () => {
    state.putError = new ApiError('ADMIN_STEP_UP_REQUIRED');
    wrap(<StaffModeSwitch keys={['staff.rating_enabled']} />);
    await waitFor(() => expect(screen.getByLabelText('Ночной рейтинг: Авто')).toHaveProperty('disabled', true));
    fireEvent.click(screen.getByLabelText('Ночной рейтинг: Выкл'));
    const done = await screen.findByText('Код 2FA принят');
    state.putError = null;
    fireEvent.click(done);
    await waitFor(() => expect(state.puts).toEqual([{ key: 'staff.rating_enabled', body: { value: 'off' } }]));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
