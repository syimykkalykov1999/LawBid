import {
  ALREADY_BID_FACTOR,
  CASE_WEIGHTS,
  type CaseCandidate,
  type CaseViewer,
  caseScore,
  urgencyScore,
} from './cases.scoring';
import {
  PEOPLE_JITTER,
  PEOPLE_WEIGHTS,
  type PeopleViewer,
  type PersonCandidate,
  personFeatures,
  personScore,
} from './people.scoring';
import {
  POST_WEIGHTS,
  type PostAuthor,
  type PostCandidate,
  type PostViewer,
  hotRaw,
  postScore,
} from './posts.scoring';
import { DAY_MS, HOUR_MS } from './ranking.math';

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const sum = (w: Record<string, number>) =>
  Object.values(w).reduce((a, b) => a + b, 0);

describe('weights', () => {
  it.each([
    ['people', PEOPLE_WEIGHTS],
    ['posts', POST_WEIGHTS],
    ['cases', CASE_WEIGHTS],
  ])('%s weights add up to 1', (_n, w) => {
    expect(sum(w)).toBeCloseTo(1, 10);
  });
});

describe('people score', () => {
  const viewer: PeopleViewer = {
    id: 'v',
    states: ['NJ'],
    interests: new Map([['family', 1]]),
  };
  const base: PersonCandidate = {
    id: 'c',
    ratingAvg: 4.5,
    ratingCount: 20,
    followersCount: 100,
    trustLevel: 1,
    trustBadge: false,
    posts30d: 3,
    lastPostAt: new Date(NOW - 2 * DAY_MS),
    states: ['CA'],
    categories: ['tax'],
    mutual: 0,
    followsViewer: false,
    engaged: 0,
  };
  const score = (c: Partial<PersonCandidate>) =>
    personScore({ ...base, ...c }, viewer, NOW);
  // The daily jitter is ±PEOPLE_JITTER, so compare with that margin.
  const bigger = (a: number, b: number) =>
    expect(a).toBeGreaterThan(b + 2 * PEOPLE_JITTER);

  it('same state beats another state', () => {
    bigger(score({ states: ['NJ'] }), score({}));
  });

  it('same practice beats another practice', () => {
    bigger(score({ categories: ['family'] }), score({}));
  });

  it('common follows and follow-back raise the score', () => {
    bigger(score({ mutual: 4 }), score({}));
    bigger(score({ followsViewer: true }), score({}));
  });

  it('a few great reviews beat one perfect review', () => {
    bigger(
      score({ ratingAvg: 4.8, ratingCount: 60 }),
      score({ ratingAvg: 5, ratingCount: 1 }),
    );
  });

  it('an active author beats a silent one', () => {
    bigger(
      score({ posts30d: 10, lastPostAt: new Date(NOW - HOUR_MS) }),
      score({ posts30d: 0, lastPostAt: null }),
    );
  });

  it('Identity and past interaction help', () => {
    // Identity is a small weight (0.03): compare its feature, not the
    // jittered total.
    expect(
      personFeatures({ ...base, trustLevel: 3, trustBadge: true }, viewer, NOW)
        .identity,
    ).toBeGreaterThan(personFeatures(base, viewer, NOW).identity);
    bigger(score({ engaged: 6 }), score({}));
  });

  it('is deterministic within a day and stays in a sane range', () => {
    expect(score({})).toBe(score({}));
    const s = score({ states: ['NJ'], categories: ['family'], mutual: 9 });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1 + PEOPLE_JITTER);
  });
});

describe('post score', () => {
  const viewer: PostViewer = {
    id: 'v',
    language: 'en',
    states: ['NJ'],
    interests: new Map([['family', 1]]),
    following: new Set(['followed']),
    seen: new Set(['seen']),
  };
  const base: PostCandidate = {
    id: 'p',
    authorId: 'a',
    createdAt: new Date(NOW - 6 * HOUR_MS),
    likes: 10,
    comments: 2,
    saves: 1,
    shares: 0,
    views: 40,
    category: 'tax',
    language: 'en',
    kind: 'photo',
  };
  const author: PostAuthor = {
    ratingAvg: 4.5,
    ratingCount: 10,
    trustLevel: 1,
    trustBadge: false,
    states: [],
    mutual: 0,
    engaged: 0,
  };
  const score = (
    p: Partial<PostCandidate>,
    a: Partial<PostAuthor> = {},
    hotMax = hotRaw({ ...base, likes: 200, comments: 40 }, NOW),
  ) => postScore({ ...base, ...p }, { ...author, ...a }, viewer, hotMax, NOW);

  it('more engagement, same age → higher', () => {
    expect(score({ likes: 120, comments: 30, saves: 20 })).toBeGreaterThan(
      score({}),
    );
  });

  it('time decay: an old post with the same likes ranks lower', () => {
    expect(score({ createdAt: new Date(NOW - 10 * DAY_MS) })).toBeLessThan(
      score({}),
    );
  });

  it('the viewer’s practice, a followed author and their language help', () => {
    expect(score({ category: 'family' })).toBeGreaterThan(score({}));
    expect(score({ authorId: 'followed' })).toBeGreaterThan(score({}));
    expect(score({ language: 'ru' })).toBeLessThan(score({}));
  });

  it('a seen post is shown lower', () => {
    expect(score({ id: 'seen' })).toBeCloseTo(score({}) * 0.5, 6);
  });

  it('no candidates with engagement → hot is 0, no NaN', () => {
    const s = postScore(
      { ...base, likes: 0, comments: 0, saves: 0, views: 0 },
      undefined,
      viewer,
      0,
      NOW,
    );
    expect(Number.isFinite(s)).toBe(true);
  });
});

describe('case score', () => {
  const viewer: CaseViewer = {
    id: 'att',
    practiceIds: new Set(['leaf-own']),
    interests: new Map([['cat-own', 1]]),
    states: new Set(['NJ']),
    bidOn: new Set(['bid-on']),
  };
  const base: CaseCandidate = {
    id: 'c',
    createdAt: new Date(NOW - 6 * HOUR_MS),
    practiceId: 'leaf-other',
    categoryId: 'cat-other',
    states: ['CA'],
    budgetCents: 200_000,
    bidsCount: 2,
    viewCount: 10,
    commentCount: 0,
    urgency: 'soon',
    deadlineAt: null,
    clientRatingAvg: 0,
    clientRatingCount: 0,
  };
  const score = (c: Partial<CaseCandidate>) =>
    caseScore({ ...base, ...c }, viewer, NOW);

  it('own practice and own state win', () => {
    expect(score({ practiceId: 'leaf-own' })).toBeGreaterThan(score({}));
    expect(score({ categoryId: 'cat-own' })).toBeGreaterThan(score({}));
    expect(score({ states: ['NJ'] })).toBeGreaterThan(score({}));
  });

  it('fresh, funded, uncontested cases rank higher', () => {
    expect(score({ createdAt: new Date(NOW - 20 * DAY_MS) })).toBeLessThan(
      score({}),
    );
    expect(score({ budgetCents: 2_000_000 })).toBeGreaterThan(score({}));
    expect(score({ budgetCents: null })).toBeLessThan(score({}));
    expect(score({ bidsCount: 0 })).toBeGreaterThan(score({ bidsCount: 12 }));
  });

  it('a case the attorney already bid on goes down, not away', () => {
    const s = score({ id: 'bid-on' });
    expect(s).toBeCloseTo(score({}) * ALREADY_BID_FACTOR, 6);
    expect(s).toBeGreaterThan(0);
  });

  it('urgency: by_date counts the days left', () => {
    const in5 = new Date(NOW + 5 * DAY_MS);
    const in90 = new Date(NOW + 90 * DAY_MS);
    expect(urgencyScore('by_date', in5, NOW)).toBeGreaterThan(
      urgencyScore('by_date', in90, NOW),
    );
    expect(urgencyScore('very_urgent', null, NOW)).toBe(1);
    expect(urgencyScore(null, null, NOW)).toBe(0.3);
    expect(urgencyScore('by_date', new Date(NOW - DAY_MS), NOW)).toBe(0.1);
  });
});
