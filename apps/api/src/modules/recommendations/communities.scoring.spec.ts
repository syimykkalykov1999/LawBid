import {
  feedOrder,
  COMMUNITY_JITTER,
  COMMUNITY_WEIGHTS,
  type CommunityCandidate,
  type CommunityViewer,
  communityScore,
} from './communities.scoring';
import { DAY_MS } from './ranking.math';

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const viewer: CommunityViewer = {
  id: 'v',
  states: ['NY'],
  interests: new Map([['immigration', 1]]),
};
const base: CommunityCandidate = {
  id: 'a',
  members: 100,
  lastActivityAt: new Date(NOW - DAY_MS),
  joins7d: 0,
  categories: [],
  states: [],
  mutual: 0,
};
const score = (c: Partial<CommunityCandidate>) =>
  communityScore({ ...base, ...c }, viewer, NOW);

describe('community scoring', () => {
  it('weights add up to 1', () => {
    expect(
      Object.values(COMMUNITY_WEIGHTS).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1, 10);
  });

  it('people the viewer knows lift a community most', () => {
    expect(score({ mutual: 4 })).toBeGreaterThan(
      score({ categories: ['immigration'] }) + COMMUNITY_JITTER * 2,
    );
  });

  it('topic, region, activity, growth and size each raise the score', () => {
    const j = COMMUNITY_JITTER * 2;
    expect(score({ categories: ['immigration'] })).toBeGreaterThan(
      score({}) - j,
    );
    expect(score({ states: ['NY'] })).toBeGreaterThan(score({}) - j);
    expect(score({ joins7d: 20 })).toBeGreaterThan(score({}));
    expect(score({ members: 4000 })).toBeGreaterThan(score({}));
    expect(score({ lastActivityAt: new Date(NOW - 60 * DAY_MS) })).toBeLessThan(
      score({}),
    );
    expect(score({ lastActivityAt: null })).toBeLessThan(score({}));
  });

  it('a cold start (no signals) still ranks by activity and size', () => {
    const cold: CommunityViewer = { id: 'v', states: [], interests: new Map() };
    const big = communityScore({ ...base, members: 3000 }, cold, NOW);
    const small = communityScore({ ...base, id: 'b', members: 5 }, cold, NOW);
    expect(big).toBeGreaterThan(small);
  });

  it('is stable within a day for the same pair', () => {
    expect(score({})).toBe(score({}));
  });
});

describe('feedOrder', () => {
  const mk = (id: string, score: number) => ({ id, score });
  it('top by score, then the rest popular, then newest, no repeats', () => {
    const scored = ['a', 'b', 'c', 'd', 'e'].map((id, i) => mk(id, i));
    const out = feedOrder(scored, ['a', 'b', 'c'], ['e', 'd', 'a'], 1).map(
      (x) => x.id,
    );
    expect(out).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(new Set(out).size).toBe(out.length);
  });
});
