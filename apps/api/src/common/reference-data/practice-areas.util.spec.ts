import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  flattenPracticeAreaSeed,
  PracticeAreaSeedCategory,
  practiceAreaSnake,
} from './practice-areas.util';
import { US_STATES } from './us-states';

const seedPath = join(
  __dirname,
  '../../../prisma/seed/practice_areas.seed.json',
);

function loadSeed(): PracticeAreaSeedCategory[] {
  return JSON.parse(
    readFileSync(seedPath, 'utf-8'),
  ) as PracticeAreaSeedCategory[];
}

describe('practiceAreaSnake (docs/02_DATABASE.md §3.2)', () => {
  it.each([
    ['Traffic Tickets', 'traffic_tickets'],
    ['Speeding', 'speeding'],
    ['Technology, Privacy and Cyber Law', 'technology_privacy_and_cyber_law'],
    ['Third-Party Claims', 'third_party_claims'],
    ['Film & Music', 'film_and_music'],
    ['  --Weird__ Name!!  ', 'weird_name'],
  ])('%s -> %s', (input, expected) => {
    expect(practiceAreaSnake(input)).toBe(expected);
  });
});

describe('practice_areas.seed.json', () => {
  const rows = flattenPracticeAreaSeed(loadSeed());
  const categories = rows.filter((r) => r.parent_code === null);
  const leaves = rows.filter((r) => r.parent_code !== null);

  it('has 42 categories, each with at least one specialization', () => {
    expect(categories).toHaveLength(42);
    for (const cat of categories) {
      expect(leaves.some((l) => l.parent_code === cat.code)).toBe(true);
    }
  });

  it('matches the spec example and the not-sure fallback leaf', () => {
    expect(rows.map((r) => r.code)).toEqual(
      expect.arrayContaining([
        'traffic_tickets.speeding',
        'general_practice.not_sure_or_other',
      ]),
    );
  });

  it('uses practice.<code> i18n keys', () => {
    for (const row of rows) {
      expect(row.i18n_key).toBe(`practice.${row.code}`);
    }
  });
});

describe('flattenPracticeAreaSeed validation', () => {
  it('rejects a code that breaks the generation rule', () => {
    expect(() =>
      flattenPracticeAreaSeed([
        {
          code: 'traffic',
          name_en: 'Traffic Tickets',
          children: [],
        },
      ]),
    ).toThrow(/expected "traffic_tickets"/);
  });

  it('rejects duplicate codes', () => {
    const leaf = { code: 'a.b', name_en: 'B' };
    expect(() =>
      flattenPracticeAreaSeed([
        { code: 'a', name_en: 'A', children: [leaf, leaf] },
      ]),
    ).toThrow(/duplicate code "a.b"/);
  });
});

describe('US_STATES (docs/02_DATABASE.md §3.1)', () => {
  it('has 51 unique two-letter codes including DC', () => {
    const codes = US_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(51);
    expect(codes).toContain('DC');
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });
});
