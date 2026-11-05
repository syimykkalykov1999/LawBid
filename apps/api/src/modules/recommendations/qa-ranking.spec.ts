import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import {
  hnWeight,
  openItemScore,
  QA_CASE_BOOST,
  QA_GRAVITY,
  QA_PEOPLE_BOOST,
  QA_WEIGHTS,
  qaCaseBoost,
  qaFeatures,
  qaPeopleBoost,
  qaScore,
  topicMatch,
  wilsonLower,
  type QaAnswerFact,
} from './qa-ranking';
import { DAY_MS } from './ranking.math';

const NOW = Date.UTC(2026, 10, 4, 12);
const days = (n: number) => new Date(NOW - n * DAY_MS);
const fact = (over: Partial<QaAnswerFact> = {}): QaAnswerFact => ({
  createdAt: days(1),
  likes: 0,
  best: false,
  category: 'family',
  ...over,
});
const scoreOf = (facts: QaAnswerFact[]) =>
  qaScore(qaFeatures(facts, NOW).features);

/** R-401: the Q&A ranking maths (HN gravity, Wilson lower bound). */
describe('qa-ranking', () => {
  it('HN gravity: fresh counts most, 12 weeks old is a few per cent', () => {
    const fresh = hnWeight(0);
    expect(fresh).toBeCloseTo(1 / Math.pow(2, QA_GRAVITY), 10);
    expect(hnWeight(7 * DAY_MS) / fresh).toBeLessThan(0.5);
    expect(hnWeight(84 * DAY_MS) / fresh).toBeLessThan(0.05);
    // A heavier gravity forgets faster.
    expect(hnWeight(14 * DAY_MS, 3)).toBeLessThan(hnWeight(14 * DAY_MS, 1));
  });

  it('Wilson lower bound: 1 of 1 loses to 8 of 10, 0 of 0 is 0', () => {
    expect(wilsonLower(0, 0)).toBe(0);
    expect(wilsonLower(1, 1)).toBeLessThan(wilsonLower(8, 10));
    // Evan Miller's example: 100 % of 1 is about 0.2; 95 % of 100 about 0.89.
    expect(wilsonLower(1, 1)).toBeCloseTo(0.206, 2);
    expect(wilsonLower(95, 100)).toBeCloseTo(0.887, 2);
  });

  it('more answers rank higher; likes and best marks lift further', () => {
    const one = scoreOf([fact()]);
    const five = scoreOf(
      [1, 2, 3, 4, 5].map((d) => fact({ createdAt: days(d) })),
    );
    expect(five).toBeGreaterThan(one);
    const liked = scoreOf(
      [1, 2, 3, 4, 5].map((d) => fact({ createdAt: days(d), likes: 3 })),
    );
    expect(liked).toBeGreaterThan(five);
    const best = scoreOf(
      [1, 2, 3, 4, 5].map((d) =>
        fact({ createdAt: days(d), likes: 3, best: d === 1 }),
      ),
    );
    expect(best).toBeGreaterThan(liked);
  });

  it('old answers count less than fresh ones (decayed window)', () => {
    const fresh = scoreOf([
      fact({ createdAt: days(1) }),
      fact({ createdAt: days(2) }),
    ]);
    const stale = scoreOf([
      fact({ createdAt: days(80) }),
      fact({ createdAt: days(85) }),
    ]);
    expect(stale).toBeGreaterThan(0);
    expect(stale).toBeLessThan(fresh);
  });

  it('topics: the strongest answered topic is 1, others a share', () => {
    const { topics } = qaFeatures(
      [
        fact({ category: 'family' }),
        fact({ category: 'family' }),
        fact({ category: 'tax' }),
        fact({ category: null }),
      ],
      NOW,
    );
    expect(topics.family).toBe(1);
    expect(topics.tax).toBeCloseTo(0.5, 10);
    expect(Object.keys(topics)).toEqual(['family', 'tax']);
  });

  it('topic match: the viewer wants what the attorney answers', () => {
    const interests = new Map([
      ['family', 1],
      ['tax', 0.3],
    ]);
    expect(topicMatch({ family: 1 }, interests)).toBe(1);
    expect(topicMatch({ tax: 1 }, interests)).toBeCloseTo(0.3, 10);
    expect(topicMatch({ crime: 1 }, interests)).toBe(0);
    expect(topicMatch(undefined, interests)).toBe(0);
  });

  it('people boost: nothing without a snapshot, score + topic with it', () => {
    const interests = new Map([['family', 1]]);
    expect(qaPeopleBoost(undefined, interests)).toBe(0);
    const entry = {
      score: 0.5,
      topics: { family: 1 },
      counts: { answers: 3, likes: 2, best: 0 },
    };
    expect(qaPeopleBoost(entry, interests)).toBeCloseTo(
      QA_PEOPLE_BOOST.qa * 0.5 + QA_PEOPLE_BOOST.qaTopic,
      10,
    );
    // Admin weights change the boost.
    expect(qaPeopleBoost(entry, interests, { qa: 0, qaTopic: 0 })).toBe(0);
  });

  it('case boost: only cases of the answered topics', () => {
    const entry = {
      score: 1,
      topics: { family: 1, tax: 0.5 },
      counts: { answers: 2, likes: 0, best: 0 },
    };
    expect(qaCaseBoost(entry, 'family')).toBeCloseTo(QA_CASE_BOOST, 10);
    expect(qaCaseBoost(entry, 'tax')).toBeCloseTo(QA_CASE_BOOST / 2, 10);
    expect(qaCaseBoost(entry, 'crime')).toBe(0);
    expect(qaCaseBoost(undefined, 'family')).toBe(0);
  });

  it('open items: fresher and emptier first', () => {
    const freshEmpty = openItemScore(days(0), 0, 10, NOW);
    const freshFull = openItemScore(days(0), 9, 10, NOW);
    const oldEmpty = openItemScore(days(30), 0, 10, NOW);
    expect(freshEmpty).toBeGreaterThan(freshFull);
    expect(freshEmpty).toBeGreaterThan(oldEmpty);
    expect(freshEmpty).toBeLessThanOrEqual(1);
  });

  it('every weight is an admin setting with the built-in default', () => {
    for (const [k, v] of Object.entries(QA_WEIGHTS)) {
      expect(APP_SETTINGS[`reco.qa.${k}` as keyof typeof APP_SETTINGS]).toBe(v);
    }
    expect(APP_SETTINGS['reco.qa.gravity']).toBe(QA_GRAVITY);
    expect(APP_SETTINGS['reco.people.qa']).toBe(QA_PEOPLE_BOOST.qa);
    expect(APP_SETTINGS['reco.people.qaTopic']).toBe(QA_PEOPLE_BOOST.qaTopic);
    expect(APP_SETTINGS['reco.case.qaTopic']).toBe(QA_CASE_BOOST);
  });
});
