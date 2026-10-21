import { DISAPPEAR_OPTIONS_S, expiresAtFor, notExpired } from './disappearing';

describe('disappearing messages helpers', () => {
  const now = new Date('2026-10-21T00:00:00Z');

  it('offers 24 hours, 7 days and 90 days', () => {
    expect([...DISAPPEAR_OPTIONS_S]).toEqual([86_400, 604_800, 7_776_000]);
  });

  it('stamps a message sent under a timer, and nothing when it is off', () => {
    expect(expiresAtFor(604_800, now)).toEqual(
      new Date('2026-10-28T00:00:00Z'),
    );
    expect(expiresAtFor(null, now)).toBeNull();
    expect(expiresAtFor(undefined, now)).toBeNull();
    expect(expiresAtFor(0, now)).toBeNull();
  });

  it('keeps a message in the lists until its time has passed', () => {
    expect(notExpired(now)).toEqual({
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    });
  });
});
