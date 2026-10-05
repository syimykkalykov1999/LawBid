import type { Plan } from '@prisma/client';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService, seatsOf } from './entitlements.service';
import { PlansService, seedPlans } from './plans.service';

/** PlansService over an in-memory table; EntitlementsService over a stub
 * Prisma and a no-op Redis. */
function build(opts: {
  role: 'attorney' | 'client';
  subscription?: Record<string, unknown> | null;
  clientSubscription?: Record<string, unknown> | null;
  badge?: Record<string, unknown> | null;
  grant?: Record<string, unknown> | null;
  plans?: Partial<Plan>[];
  seatLimit?: number | null;
}) {
  const now = new Date();
  const plans: Plan[] = (opts.plans ?? seedPlans()).map(
    (p, i) =>
      ({
        id: `plan-${i}`,
        tagline: {},
        description: {},
        interval: null,
        price_kind: null,
        highlights: [],
        status: 'active',
        sort: i,
        is_default: false,
        created_by: null,
        created_at: now,
        updated_at: now,
        ...(p as Record<string, unknown>),
      }) as unknown as Plan,
  );
  const prisma = {
    plan: {
      count: () => Promise.resolve(plans.length),
      findMany: () => Promise.resolve(plans),
      createMany: () => Promise.resolve({ count: 0 }),
    },
    user: { findUnique: () => Promise.resolve({ role: opts.role }) },
    subscription: {
      findUnique: () => Promise.resolve(opts.subscription ?? null),
    },
    clientSubscription: {
      findUnique: () => Promise.resolve(opts.clientSubscription ?? null),
    },
    clientVerification: {
      findUnique: () => Promise.resolve(opts.badge ?? null),
    },
    contractGrant: {
      findMany: () => Promise.resolve(opts.grant ? [opts.grant] : []),
    },
    attorneyProfile: {
      findUnique: () =>
        Promise.resolve({ assistant_seat_limit: opts.seatLimit ?? null }),
    },
  } as unknown as PrismaService;
  const redis = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1),
    incr: () => Promise.resolve(1),
  } as unknown as Redis;
  const plansService = new PlansService(prisma);
  return {
    service: new EntitlementsService(prisma, plansService, redis),
    plans,
  };
}

const planByCode = (plans: Plan[], code: string) =>
  plans.find((p) => p.code === code)!;

describe('EntitlementsService (owner 2026-10-05)', () => {
  it('attorney without a subscription gets the baseline', async () => {
    const { service } = build({ role: 'attorney' });
    const r = await service.forUser('u1');
    expect(r.source).toBe('baseline');
    expect(r.isPaid).toBe(false);
    expect(r.values.bids_any_state).toBe(true);
    expect(r.seats).toEqual({ included: 0, extra: 0, total: 0, max: 0 });
  });

  it('a plan-linked subscription: plan terms + extra seats', async () => {
    const { service, plans } = build({
      role: 'attorney',
      subscription: {
        status: 'active',
        grace_ends_at: null,
        plan: 'monthly',
        assistant_seats: 2,
        plan_id: planByCode(seedAsPlans(), 'attorney_monthly').id,
        entitlements: null,
      },
    });
    const monthly = planByCode(plans, 'attorney_monthly');
    const r = await service.forUser('u1');
    expect(r.source).toBe('plan');
    expect(r.planCode).toBe(monthly.code);
    expect(r.seats).toEqual({ included: 0, extra: 2, total: 2, max: 10 });
  });

  it('the frozen snapshot wins over the plan as edited later', async () => {
    const { service } = build({
      role: 'attorney',
      subscription: {
        status: 'trialing',
        grace_ends_at: null,
        plan: 'yearly',
        assistant_seats: 0,
        plan_id: planByCode(seedAsPlans(), 'attorney_yearly').id,
        entitlements: { included_seats: 10, priority_search: false },
      },
    });
    const r = await service.forUser('u1');
    expect(r.values.included_seats).toBe(10);
    expect(r.values.priority_search).toBe(false);
    expect(r.seats?.total).toBe(10);
  });

  it("a pre-plan yearly row gets the default yearly plan's seats", async () => {
    const { service } = build({
      role: 'attorney',
      subscription: {
        status: 'active',
        grace_ends_at: null,
        plan: 'yearly',
        assistant_seats: 6,
        plan_id: null,
        entitlements: null,
      },
    });
    const r = await service.forUser('u1');
    expect(r.source).toBe('legacy');
    expect(r.planCode).toBe('attorney_yearly');
    // Owner 2026-10-05: the yearly plan now includes the admin's 10 seats.
    expect(r.seats).toEqual({ included: 10, extra: 0, total: 10, max: 10 });
    expect(r.values.priority_search).toBe(true);
  });

  it("an admin's personal seat limit replaces the plan's cap", async () => {
    const { service } = build({
      role: 'attorney',
      subscription: {
        status: 'active',
        grace_ends_at: null,
        plan: 'monthly',
        assistant_seats: 12,
        plan_id: planByCode(seedAsPlans(), 'attorney_monthly').id,
        entitlements: null,
      },
      seatLimit: 15,
    });
    const r = await service.forUser('u1');
    expect(r.seats).toEqual({ included: 0, extra: 12, total: 12, max: 15 });
  });

  it('a personal limit never drops below the seats the plan includes', async () => {
    const { service } = build({
      role: 'attorney',
      subscription: {
        status: 'active',
        grace_ends_at: null,
        plan: 'yearly',
        assistant_seats: 10,
        plan_id: null,
        entitlements: null,
      },
      seatLimit: 3,
    });
    const r = await service.forUser('u1');
    expect(r.seats).toEqual({ included: 10, extra: 0, total: 10, max: 10 });
  });

  it('an expired subscription falls back to the baseline', async () => {
    const { service } = build({
      role: 'attorney',
      subscription: {
        status: 'canceled',
        grace_ends_at: null,
        plan: 'monthly',
        assistant_seats: 3,
        plan_id: null,
        entitlements: null,
      },
    });
    expect((await service.forUser('u1')).source).toBe('baseline');
  });

  it('client: a live plan gives the badge and cases-first', async () => {
    const { service } = build({
      role: 'client',
      clientSubscription: {
        status: 'active',
        current_period_end: null,
        plan_id: planByCode(seedAsPlans(), 'client_plus').id,
        entitlements: null,
      },
    });
    const r = await service.forUser('c1');
    expect(r.source).toBe('plan');
    expect(r.values.verified_badge).toBe(true);
    expect(r.values.priority_feed).toBe(true);
    expect(r.seats).toBeNull();
  });

  it('client: the old badge subscription still counts as verified_badge', async () => {
    const { service } = build({
      role: 'client',
      badge: {
        status: 'approved',
        sub_status: 'active',
        current_period_end: null,
      },
    });
    const r = await service.forUser('c1');
    expect(r.source).toBe('baseline');
    expect(r.values.verified_badge).toBe(true);
    expect(r.values.priority_feed).toBe(false);
  });

  it('seatsOf clamps extra seats to the plan maximum', () => {
    expect(seatsOf({ included_seats: 2, max_seats: 4 }, 10)).toEqual({
      included: 2,
      extra: 2,
      total: 4,
      max: 4,
    });
  });
});

/** The seed plans with the ids `build` assigns (plan-<index>). */
function seedAsPlans(): Plan[] {
  return seedPlans().map(
    (p, i) => ({ id: `plan-${i}`, ...p }) as unknown as Plan,
  );
}
