import { accountLevel, toMode } from './auto-moderation.service';
import { levelFor } from './strikes.service';
import { decide, pickTop } from './text-detector.service';

describe('automatic account ladder', () => {
  const t = { limitAt: 6, tempAt: 10, suspendAt: 15 };

  it('steps up with the score', () => {
    expect(accountLevel(5.9, t)).toBeNull();
    expect(accountLevel(6, t)).toBe('account_limit');
    expect(accountLevel(10, t)).toBe('account_suspend_temp');
    expect(accountLevel(15, t)).toBe('account_suspend');
  });

  it('a step with a threshold of 0 is off', () => {
    expect(
      accountLevel(100, { limitAt: 0, tempAt: 0, suspendAt: 0 }),
    ).toBeNull();
    expect(accountLevel(100, { limitAt: 6, tempAt: 0, suspendAt: 0 })).toBe(
      'account_limit',
    );
  });

  it('three sock-puppet reports (weight ~0.1) are nowhere near the first step', () => {
    expect(accountLevel(0.1 + 0 /* strikes */, t)).toBeNull();
  });

  it('unknown mode words fall back to off', () => {
    expect(toMode('enforce')).toBe('enforce');
    expect(toMode('shadow')).toBe('shadow');
    expect(toMode('whatever')).toBe('off');
  });
});

describe('strike ladder', () => {
  const t = { cooldownAt: 3, limitedAt: 5, suspendAt: 8 };
  it('maps points to the highest step reached', () => {
    expect(levelFor(2, t)).toBe('none');
    expect(levelFor(3, t)).toBe('cooldown');
    expect(levelFor(5, t)).toBe('limited');
    expect(levelFor(8, t)).toBe('suspended');
  });
  it('a zero threshold switches the step off', () => {
    expect(levelFor(50, { cooldownAt: 0, limitedAt: 0, suspendAt: 0 })).toBe(
      'none',
    );
  });
});

describe('text classifier decisions', () => {
  it('picks the highest score among the chosen categories only', () => {
    expect(
      pickTop({ violence: 0.99, harassment: 0.4, hate: 0.6 }, [
        'harassment',
        'hate',
      ]),
    ).toEqual({ category: 'hate', score: 0.6 });
    expect(pickTop({ violence: 0.99 }, ['hate'])).toBeNull();
  });
  it('holds above hold_at, blocks above block_at, otherwise allows', () => {
    expect(decide(0.5, 0.7, 0.97)).toBe('allow');
    expect(decide(0.7, 0.7, 0.97)).toBe('hold');
    expect(decide(0.98, 0.7, 0.97)).toBe('block');
  });
});
