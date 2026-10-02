import {
  effectiveSeats,
  grantIsActive,
  paidSeats,
} from './contract-grant.util';

const DAY = 86_400_000;

describe('contract grant rules (owner 2026-10-02)', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const at = (days: number) => new Date(now.getTime() + days * DAY);

  it.each([
    ['inside the window', null, -1, 30, true],
    ['not started yet', null, 1, 30, false],
    ['ended', null, -60, -1, false],
    ['ends exactly now (exclusive)', null, -30, 0, false],
    ['starts exactly now (inclusive)', null, 0, 30, true],
    ['revoked', at(-1), -10, 30, false],
  ])('%s', (_label, revoked, start, end, expected) => {
    expect(
      grantIsActive(
        { revoked_at: revoked, starts_at: at(start), ends_at: at(end) },
        now,
      ),
    ).toBe(expected);
  });

  it('seats: max(paid, grant)', () => {
    expect(effectiveSeats(0, 3)).toBe(3);
    expect(effectiveSeats(4, 3)).toBe(4);
    expect(effectiveSeats(2, null)).toBe(2);
    expect(effectiveSeats(0, null)).toBe(0);
  });

  it('paid seats: yearly = 6, monthly = bought, none = 0', () => {
    expect(paidSeats({ plan: 'yearly', assistant_seats: 0 })).toBe(6);
    expect(paidSeats({ plan: 'monthly', assistant_seats: 2 })).toBe(2);
    expect(paidSeats(null)).toBe(0);
  });
});
