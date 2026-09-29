import type Redis from 'ioredis';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  containsTerm,
  countLinks,
  normalizeForRules,
  RuleBasedModerationHook,
} from './rule-based-moderation.hook';

function hook(overrides: Partial<Record<string, unknown>> = {}) {
  const values: Record<string, unknown> = {
    'moderation.blocked_terms': ['casino bonus', 'scam'],
    'moderation.hold_terms': ['guaranteed win'],
    'moderation.max_links': 3,
    'moderation.duplicate_window_hours': 24,
    ...overrides,
  };
  const settings = {
    stringList: (k: string) => Promise.resolve(values[k] as string[]),
    number: (k: string) => Promise.resolve(values[k] as number),
  } as unknown as AppSettingsService;
  const counts = new Map<string, number>();
  const redis = {
    incr: (k: string) => {
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return Promise.resolve(n);
    },
    expire: () => Promise.resolve(1),
  } as unknown as Redis;
  return new RuleBasedModerationHook(settings, redis);
}

const ctx = { kind: 'post' as const, authorId: 'a1' };

describe('RuleBasedModerationHook (docs/06 §3.3)', () => {
  it('normalizes and matches whole terms only', () => {
    expect(normalizeForRules('  Free  CASINO!!! Bonus, now ')).toBe(
      'free casino bonus now',
    );
    expect(containsTerm('the class starts', 'ass')).toBe(false);
    expect(containsTerm('what an ass', 'ass')).toBe(true);
    expect(countLinks('see https://a.io and www.b.com or c.net')).toBe(3);
  });

  it('blocks on blocked terms, holds on hold terms', async () => {
    const h = hook();
    expect(await h.check('Best CASINO bonus here', ctx)).toBe('block');
    expect(await h.check('a guaranteed win in court', ctx)).toBe('hold');
    expect(await h.check('Plain legal advice about tickets', ctx)).toBe(
      'allow',
    );
  });

  it('holds mass links and repeated text from the same author', async () => {
    const h = hook();
    expect(await h.check('x https://a.io https://b.io https://c.io', ctx)).toBe(
      'hold',
    );
    expect(await h.check('Same text again', ctx)).toBe('allow');
    expect(await h.check('same TEXT again!', ctx)).toBe('hold');
    // Another author is a different key.
    expect(await h.check('Same text again', { ...ctx, authorId: 'a2' })).toBe(
      'allow',
    );
  });

  it('turns rules off with zero thresholds', async () => {
    const h = hook({
      'moderation.max_links': 0,
      'moderation.duplicate_window_hours': 0,
    });
    const text = 'https://a.io https://b.io https://c.io https://d.io';
    expect(await h.check(text, ctx)).toBe('allow');
    expect(await h.check(text, ctx)).toBe('allow');
  });
});
