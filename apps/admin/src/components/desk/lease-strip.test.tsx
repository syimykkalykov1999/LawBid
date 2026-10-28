import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaseView, MyLeases } from '@/lib/desk-data';

const post = vi.fn();
const toast = { success: vi.fn(), error: vi.fn() };
let idle = 0;

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/lib/activity', () => ({ idleMs: () => idle, IDLE_STOP_MS: 15 * 60_000 }));
vi.mock('@/lib/api/client', () => ({ api: {}, ApiError: class extends Error {}, toProxy: { onRequest: () => undefined }, errorText: String }));
vi.mock('@/lib/desk-data', async (orig) => {
  const real = await orig<typeof import('@/lib/desk-data')>();
  return { ...real, deskPost: (...a: unknown[]) => post(...a) };
});

import { settingsView } from '@/lib/desk-data';
import { renewDue, useDeskHeartbeat } from './lease-hooks';
import { LeaseStrip } from './lease-strip';

const NOW = new Date('2026-10-27T10:00:00Z').getTime();
const lease = (over: Partial<LeaseView> = {}): LeaseView => ({
  kind: 'verification',
  itemId: '11111111-2222-3333-4444-555555555555',
  takenAt: new Date(NOW - 60_000).toISOString(),
  leasedUntil: new Date(NOW + 19 * 60_000).toISOString(),
  attempt: 1,
  ...over,
});
const my = (leases: LeaseView[]): MyLeases => ({ status: 'online', leases, capacity: { chat: 3, other: 1 }, wrapUpSec: 0 });
const settings = (leaseOn = true) => settingsView({ switches: { 'staff.lease_enabled': leaseOn }, numbers: { 'staff.lease.ttl_verification_min': 20 } }, false);

function wrap(ui: ReactNode, qc = new QueryClient()) {
  return { qc, ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  idle = 0;
  post.mockReset();
  post.mockResolvedValue({ ok: true, data: { ok: true, limited: false } });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('lease strip: the item pinned to me', () => {
  it('shows what I hold and the countdown, nothing when the engine is off or hands are empty', () => {
    wrap(<LeaseStrip role="verifier" settings={settings()} my={my([lease()])} />);
    expect(screen.getByTestId('lease-strip').textContent).toMatch(/Заявка адвоката/);
    expect(screen.getByLabelText('Осталось времени').textContent).toBe('осталось 19:00');
    cleanup();
    wrap(<LeaseStrip role="verifier" settings={settings(false)} my={my([lease()])} />);
    expect(screen.queryByTestId('lease-strip')).toBeNull();
    cleanup();
    wrap(<LeaseStrip role="verifier" settings={settings()} my={my([])} />);
    expect(screen.queryByTestId('lease-strip')).toBeNull();
  });

  it('shows the lease of the desk only, and links the card of a report by its object kind', () => {
    const report = lease({ kind: 'report', itemId: '99999999-2222-3333-4444-555555555555', targetType: 'post' });
    wrap(<LeaseStrip role="moderator" settings={settings()} my={my([lease(), report])} />);
    const strip = screen.getByTestId('lease-strip');
    expect(strip.textContent).toMatch(/Жалоба/);
    expect(strip.textContent).not.toMatch(/Заявка адвоката/);
    expect(strip.querySelector('a')?.getAttribute('href')).toBe('/moderation/review?type=post&id=99999999-2222-3333-4444-555555555555');
  });

  it('«Отпустить» releases it', async () => {
    wrap(<LeaseStrip role="verifier" settings={settings()} my={my([lease()])} />);
    fireEvent.click(screen.getByText('Отпустить'));
    await act(async () => {});
    expect(post).toHaveBeenCalledWith('/admin/desk/lease/verification/11111111-2222-3333-4444-555555555555/release');
  });

  it('«Пропустить» asks for a reason from the list and sends it', async () => {
    wrap(<LeaseStrip role="verifier" settings={settings()} my={my([lease()])} />);
    expect(screen.queryByText('Не мой язык')).toBeNull();
    fireEvent.click(screen.getByText('Пропустить'));
    expect(screen.getAllByRole('group', { name: 'Причина пропуска' })).toHaveLength(1);
    fireEvent.click(screen.getByText('Конфликт интересов'));
    await act(async () => {});
    expect(post).toHaveBeenCalledWith('/admin/desk/lease/verification/11111111-2222-3333-4444-555555555555/skip', { reason: 'conflict_of_interest' });
    expect(toast.success).toHaveBeenCalled();
  });

  it('says so when the hourly skips are used up', async () => {
    post.mockResolvedValue({ ok: true, data: { ok: false, limited: true } });
    wrap(<LeaseStrip role="verifier" settings={settings()} my={my([lease()])} />);
    fireEvent.click(screen.getByText('Пропустить'));
    fireEvent.click(screen.getByText('Другое'));
    await act(async () => {});
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('auto-renew while the person moves', () => {
  it('renewDue: past half of the time, moving, tab shown', () => {
    const l = lease({ leasedUntil: new Date(NOW + 5 * 60_000).toISOString() });
    expect(renewDue(l, 1200, NOW, 1000, false)).toBe(true);
    expect(renewDue(lease(), 1200, NOW, 1000, false)).toBe(false); // plenty left
    expect(renewDue(l, 1200, NOW, 90_000, false)).toBe(false); // not moving
    expect(renewDue(l, 1200, NOW, 1000, true)).toBe(false); // tab hidden
    expect(renewDue(lease({ leasedUntil: new Date(NOW - 1000).toISOString() }), 1200, NOW, 0, false)).toBe(false); // already gone
  });

  it('renews on its own tick while moving, and stays quiet when idle', async () => {
    const l = lease({ leasedUntil: new Date(NOW + 5 * 60_000).toISOString() });
    wrap(<LeaseStrip role="verifier" settings={settings()} my={my([l])} />);
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(post).toHaveBeenCalledWith('/admin/desk/lease/verification/11111111-2222-3333-4444-555555555555/renew');
    post.mockClear();
    idle = 5 * 60_000;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('closing with the decision', () => {
  it('a successful decision on the desk makes the desk look at my items again', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    function Decision() {
      const m = useMutation({ mutationFn: async () => 'ok' });
      return <button onClick={() => m.mutate()}>approve</button>;
    }
    wrap(
      <>
        <LeaseStrip role="verifier" settings={settings()} my={my([lease()])} />
        <Decision />
      </>,
      qc,
    );
    fireEvent.click(screen.getByText('approve'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['desk-my-leases'] });
  });
});

describe('presence heartbeat of the desk', () => {
  function Beat({ on }: { on: boolean }) {
    useDeskHeartbeat(on, 15);
    return null;
  }

  it('sends a signal at once and every 15 s with the activity flag', async () => {
    wrap(<Beat on />);
    await act(async () => {});
    expect(post).toHaveBeenCalledWith('/admin/desk/heartbeat', { active: true });
    idle = 10 * 60_000;
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith('/admin/desk/heartbeat', { active: false });
  });

  it('stops signalling after 15 minutes without input (the session may run into its idle timeout)', async () => {
    idle = 20 * 60_000;
    wrap(<Beat on />);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('sends nothing while presence is off', async () => {
    wrap(<Beat on={false} />);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(post).not.toHaveBeenCalled();
  });
});
