import { statusOf } from './case-invites.service';

describe('case invite status (owner 2026-10-05)', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const later = new Date('2026-10-12T12:00:00Z');
  const earlier = new Date('2026-10-05T11:59:59Z');

  it('a pending invite on an open case is pending', () => {
    expect(
      statusOf({ status: 'pending', expires_at: later }, 'open', now),
    ).toBe('pending');
  });

  it('past its expiry it is expired, even if the case closed', () => {
    expect(
      statusOf({ status: 'pending', expires_at: earlier }, 'open', now),
    ).toBe('expired');
    expect(
      statusOf({ status: 'pending', expires_at: earlier }, 'closed', now),
    ).toBe('expired');
  });

  it('on a case that no longer takes bids it is closed', () => {
    expect(
      statusOf({ status: 'pending', expires_at: later }, 'in_progress', now),
    ).toBe('closed');
  });

  it('answered invites keep their stored status', () => {
    for (const s of ['accepted', 'declined', 'cancelled']) {
      expect(statusOf({ status: s, expires_at: earlier }, 'open', now)).toBe(s);
    }
  });
});
