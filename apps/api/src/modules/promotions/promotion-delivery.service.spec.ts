import {
  audienceMatches,
  pacingScore,
  type LivePromotion,
} from './promotion-delivery.service';
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
    impressions,
    targetImpressions: 1_000,
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
