import type { PrismaService } from '../../prisma/prisma.service';
import {
  audienceMatches,
  pacingScore,
  PromotionDeliveryService,
  type LivePromotion,
} from './promotion-delivery.service';
import type { PromotionRefundsService } from './promotion-refunds.service';
import { EMPTY_AUDIENCE } from './promotions.settings';

const viewer = {
  role: 'attorney' as const,
  country: 'US',
  states: ['CA', 'NY'],
  topics: ['family'],
};

describe('audienceMatches', () => {
  it('an empty audience matches everyone', () => {
    expect(audienceMatches(EMPTY_AUDIENCE, viewer)).toBe(true);
    expect(
      audienceMatches(EMPTY_AUDIENCE, {
        role: null,
        country: null,
        states: [],
        topics: [],
      }),
    ).toBe(true);
  });

  it('role, state, country and topic narrow it', () => {
    const a = { ...EMPTY_AUDIENCE };
    expect(audienceMatches({ ...a, role: 'clients' }, viewer)).toBe(false);
    expect(audienceMatches({ ...a, states: ['TX'] }, viewer)).toBe(false);
    expect(audienceMatches({ ...a, states: ['NY'] }, viewer)).toBe(true);
    expect(audienceMatches({ ...a, countries: ['CA'] }, viewer)).toBe(false);
    expect(audienceMatches({ ...a, topics: ['family'] }, viewer)).toBe(true);
    expect(audienceMatches({ ...a, topics: ['tax'] }, viewer)).toBe(false);
  });
});

describe('pacingScore', () => {
  const base = (impressions: number): LivePromotion => ({
    id: 'p',
    userId: 'u',
    caseId: null,
    postId: 'x',
    audience: EMPTY_AUDIENCE,
    delivered: impressions,
    target: 1_000,
    startsAt: new Date(0),
    endsAt: new Date(10_000),
  });

  it('behind schedule ranks first', () => {
    const now = 5_000; // half the period
    expect(pacingScore(base(100), now)).toBeLessThan(
      pacingScore(base(800), now),
    );
    expect(pacingScore(base(500), now)).toBeCloseTo(1);
  });
});

describe('recordAction (owner 2026-10-07)', () => {
  function setup(opts: { seen: boolean; actions: number; target: number }) {
    const prisma = {
      casePromotion: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]),
        update: jest.fn().mockResolvedValue({
          billing: 'actions',
          impressions: 10,
          reach: 8,
          clicks: 2,
          actions: opts.actions,
          target_units: opts.target,
          target_impressions: null,
          user_id: 'owner',
          case_id: null,
          post_id: 'post1',
          status: 'active',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      promotionView: {
        updateMany: jest.fn().mockResolvedValue({ count: opts.seen ? 1 : 0 }),
      },
    };
    const refunds = { refundUnspent: jest.fn().mockResolvedValue(0) };
    const service = new PromotionDeliveryService(
      prisma as unknown as PrismaService,
      undefined,
      refunds as unknown as PromotionRefundsService,
    );
    return { prisma, refunds, service };
  }

  it('counts a paid-for action of someone who was shown it, once', async () => {
    const s = setup({ seen: true, actions: 1, target: 5 });
    expect(
      await s.service.recordAction('viewer', { ownerId: 'owner' }, 'follow'),
    ).toBe(1);
    expect(s.prisma.casePromotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          billing: 'actions',
          billed_actions: { has: 'follow' },
          user_id: 'owner',
        }),
      }),
    );
    expect(s.prisma.promotionView.updateMany).toHaveBeenCalledWith({
      where: { promotion_id: 'p1', user_id: 'viewer', acted: false },
      data: { acted: true },
    });
    expect(s.prisma.casePromotion.updateMany).not.toHaveBeenCalled();
  });

  it('not shown it (or already counted) → nothing', async () => {
    const s = setup({ seen: false, actions: 1, target: 5 });
    expect(
      await s.service.recordAction('viewer', { postId: 'post1' }, 'save'),
    ).toBe(0);
    expect(s.prisma.casePromotion.update).not.toHaveBeenCalled();
  });

  it('the owner acting on their own boost never counts', async () => {
    const s = setup({ seen: true, actions: 1, target: 5 });
    expect(
      await s.service.recordAction('owner', { ownerId: 'owner' }, 'follow'),
    ).toBe(0);
  });

  it('the last paid action finishes it without a refund', async () => {
    const s = setup({ seen: true, actions: 5, target: 5 });
    await s.service.recordAction('viewer', { postId: 'post1' }, 'save');
    expect(s.prisma.casePromotion.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'active' },
      data: { status: 'finished', cancel_reason: 'budget_spent' },
    });
    expect(s.refunds.refundUnspent).not.toHaveBeenCalled();
  });

  it('ending early gives the unspent part back', async () => {
    const s = setup({ seen: true, actions: 1, target: 5 });
    await s.service.finish(
      'p1',
      { user_id: 'owner', case_id: null, post_id: 'post1' },
      'time_over',
    );
    expect(s.refunds.refundUnspent).toHaveBeenCalledWith('p1');
  });
});
