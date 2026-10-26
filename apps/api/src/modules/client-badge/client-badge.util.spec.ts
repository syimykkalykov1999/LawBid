import { clientBadgeActive } from './client-badge.util';

const now = new Date('2026-10-02T12:00:00Z');
const later = new Date('2026-11-01T00:00:00Z');
const earlier = new Date('2026-09-01T00:00:00Z');
const row = (status: string, sub: string, end: Date | null = null) => ({
  status,
  sub_status: sub,
  current_period_end: end,
});

describe('clientBadgeActive', () => {
  it('needs the approval AND a paid subscription', () => {
    expect(clientBadgeActive(null, now)).toBe(false);
    expect(clientBadgeActive(row('pending', 'active'), now)).toBe(false);
    expect(clientBadgeActive(row('approved', 'none'), now)).toBe(false);
    expect(clientBadgeActive(row('approved', 'active', later), now)).toBe(true);
  });

  it('a free (comped) badge needs no subscription', () => {
    expect(clientBadgeActive(row('approved', 'comped'), now)).toBe(true);
  });

  it('revoked or rejected never shows', () => {
    expect(clientBadgeActive(row('revoked', 'active', later), now)).toBe(false);
    expect(clientBadgeActive(row('rejected', 'comped'), now)).toBe(false);
  });

  it('a cancelled subscription keeps it until the paid period ends', () => {
    expect(clientBadgeActive(row('approved', 'canceled', later), now)).toBe(
      true,
    );
    expect(clientBadgeActive(row('approved', 'canceled', earlier), now)).toBe(
      false,
    );
  });

  it('a failed payment (past_due) turns it off', () => {
    expect(clientBadgeActive(row('approved', 'past_due', later), now)).toBe(
      false,
    );
  });
});
