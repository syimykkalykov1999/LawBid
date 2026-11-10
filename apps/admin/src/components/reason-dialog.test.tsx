import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReason } from '@/components/reason-dialog';

// The owner: a «Причина» is optional for him everywhere…
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin' } }) }));
vi.mock('@/lib/reason-policy', () => ({ REASON_MIN: 3, useReasonRequired: () => false }));

let ask: ReturnType<typeof useReason>['ask'] | null = null;
function Host() {
  const r = useReason();
  ask = r.ask;
  return r.dialog;
}

afterEach(() => {
  cleanup();
  ask = null;
});

async function open(extra: Record<string, unknown>) {
  render(<Host />);
  await act(async () => {
    void ask!({ title: 'Сменить статус', label: 'Причина', min: 3, confirm: 'Сменить статус', ...extra });
  });
  return screen.getByRole('button', { name: 'Сменить статус' }) as HTMLButtonElement;
}

describe('reason dialog', () => {
  it('the owner may leave an ordinary «Причина» empty', async () => {
    expect((await open({})).disabled).toBe(false);
  });

  // Click audit 2026-11-08: trust status / bar number unblock are refused by
  // the server without a note; the empty dialog used to send and get a 400.
  it('textRequired: the button waits for the text, owner included', async () => {
    expect((await open({ textRequired: true })).disabled).toBe(true);
  });
});
