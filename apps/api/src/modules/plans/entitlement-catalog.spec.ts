import {
  BASELINE_DEFAULTS,
  catalogFor,
  ENTITLEMENT_CATALOG,
  mergeEntitlements,
  sanitizeEntitlements,
} from './entitlement-catalog';

describe('entitlement catalog (owner 2026-10-05)', () => {
  it('every key is listed once and belongs to at least one audience', () => {
    const keys = ENTITLEMENT_CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of ENTITLEMENT_CATALOG)
      expect(d.audiences.length).toBeGreaterThan(0);
    expect(catalogFor('client').map((d) => d.key)).toContain('priority_feed');
    expect(catalogFor('client').map((d) => d.key)).not.toContain(
      'included_seats',
    );
  });

  it('sanitize drops unknown keys, wrong types and clamps numbers', () => {
    const out = sanitizeEntitlements('attorney', {
      included_seats: 2.6,
      max_seats: 999,
      bids_any_state: 'yes',
      priority_search: true,
      extra_seat_price_cents: null,
      verified_badge: true, // client-only → dropped
      nonsense: 1,
    });
    expect(out).toEqual({
      included_seats: 3,
      max_seats: 50,
      priority_search: true,
      extra_seat_price_cents: null,
    });
  });

  it('max_seats never falls below included_seats', () => {
    expect(
      sanitizeEntitlements('attorney', { included_seats: 6, max_seats: 2 }),
    ).toEqual({ included_seats: 6, max_seats: 6 });
  });

  it('merge layers baseline ← plan ← snapshot, later wins', () => {
    const v = mergeEntitlements(
      'attorney',
      { priority_search: true, trial_days: 7 },
      { trial_days: 14 },
    );
    expect(v.priority_search).toBe(true);
    expect(v.trial_days).toBe(14);
    expect(v.bids_any_state).toBe(BASELINE_DEFAULTS.attorney.bids_any_state);
  });
});
