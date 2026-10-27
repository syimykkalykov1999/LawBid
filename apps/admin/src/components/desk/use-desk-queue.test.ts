import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api/client', () => ({ api: {}, ApiError: class extends Error {}, toProxy: { onRequest: () => undefined }, errorText: String }));

import { settingsView } from '@/lib/desk-data';
import { outcomeText, queueMode } from './use-desk-queue';

const on = (...keys: string[]) => settingsView({ switches: Object.fromEntries(keys.map((k) => [k, true])), numbers: {} }, false);

describe('queue mode of «Следующий» (the slot of T4)', () => {
  it('lease mode needs the master switch AND the queue switch', () => {
    expect(queueMode(on('staff.lease_enabled', 'staff.lease_verification_enabled'), 'verification')).toBe('lease');
    expect(queueMode(on('staff.lease_verification_enabled'), 'verification')).toBe('legacy');
    expect(queueMode(on('staff.lease_enabled'), 'verification')).toBe('legacy');
  });

  it('engine off: verification and support keep their old opener, moderation and finance have none', () => {
    const off = on();
    expect(queueMode(off, 'verification')).toBe('legacy');
    expect(queueMode(off, 'support_ticket')).toBe('legacy');
    expect(queueMode(off, 'report')).toBe('none');
    expect(queueMode(off, 'payout')).toBe('none');
    expect(queueMode(off, null)).toBe('none');
  });

  it('says in plain words what the engine answered', () => {
    expect(outcomeText({ status: 'leased', lease: { kind: 'verification', itemId: 'a', takenAt: '', leasedUntil: '', attempt: 1 } })).toBeNull();
    expect(outcomeText({ status: 'empty' })).toMatch(/пуста/);
    expect(outcomeText({ status: 'wrap_up', retryAfterSec: 20 })).toMatch(/20 с/);
    expect(outcomeText({ status: 'away' })).toMatch(/отошёл/);
    expect(outcomeText({ status: 'busy', held: [] })).toMatch(/в работе/);
    expect(outcomeText({ status: 'off' })).toMatch(/выключена/);
  });
});
