import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { CASE_WEIGHTS } from './cases.scoring';
import {
  PEOPLE_WEIGHTS,
  personScore,
  type PeopleViewer,
} from './people.scoring';
import { POST_WEIGHTS } from './posts.scoring';

/** Owner 2026-10-15: every recommendation weight is an admin setting. */
describe('recommendation weights in the admin settings', () => {
  const sets = [
    ['case', CASE_WEIGHTS],
    ['people', PEOPLE_WEIGHTS],
    ['post', POST_WEIGHTS],
  ] as const;

  for (const [kind, weights] of sets) {
    it(`${kind}: one setting per weight, defaults equal the built-in ones`, () => {
      for (const [k, v] of Object.entries(weights)) {
        const key = `reco.${kind}.${k}` as keyof typeof APP_SETTINGS;
        expect(APP_SETTINGS[key]).toBe(v);
      }
    });
  }

  it('a heavier weight changes the score', () => {
    const viewer: PeopleViewer = {
      id: 'v',
      states: ['NJ'],
      interests: new Map(),
    };
    const c = {
      id: 'c',
      ratingAvg: 5,
      ratingCount: 50,
      followersCount: 10,
      trustLevel: 0,
      trustBadge: false,
      posts30d: 0,
      lastPostAt: null,
      states: ['NJ'],
      categories: [],
      mutual: 0,
      followsViewer: false,
      engaged: 0,
      contact: 0,
    };
    const now = Date.UTC(2026, 9, 15);
    const base = personScore(c, viewer, now);
    const heavy = personScore(c, viewer, now, { ...PEOPLE_WEIGHTS, state: 1 });
    expect(heavy).toBeGreaterThan(base);
  });
});
