import { fingerprintHash, normalizeSignal } from './fingerprint.util';
import { decideStatus, statusOfScore } from './fraud-decision';

const T = { reviewScore: 30, restrictScore: 60, banScore: 100 };
const base = {
  linkStatus: 'ok' as const,
  scoreStatus: 'ok' as const,
  score: 0,
  current: 'ok' as const,
  currentByStaff: false,
  clearedScore: null,
  auto: true,
};

describe('client fraud decision', () => {
  it('maps the score to a status by the thresholds', () => {
    expect(statusOfScore(0, T)).toBe('ok');
    expect(statusOfScore(30, T)).toBe('review');
    expect(statusOfScore(75, T)).toBe('restricted');
    expect(statusOfScore(100, T)).toBe('banned');
  });

  it('a match with a blocked account wins over a low score', () => {
    expect(decideStatus({ ...base, linkStatus: 'banned', score: 100 })).toBe(
      'banned',
    );
  });

  it('without automation a block only queues the account', () => {
    expect(
      decideStatus({ ...base, scoreStatus: 'banned', score: 120, auto: false }),
    ).toBe('review');
  });

  it('after a staff clear nothing happens until the score grows', () => {
    const cleared = { ...base, scoreStatus: 'restricted' as const };
    expect(decideStatus({ ...cleared, score: 70, clearedScore: 70 })).toBe(
      'ok',
    );
    expect(decideStatus({ ...cleared, score: 95, clearedScore: 70 })).toBe(
      'restricted',
    );
  });

  it('a ban stays until a person lifts it; staff decisions are not lowered', () => {
    expect(decideStatus({ ...base, current: 'banned' })).toBe('banned');
    expect(
      decideStatus({ ...base, current: 'restricted', currentByStaff: true }),
    ).toBe('restricted');
    expect(
      decideStatus({
        ...base,
        current: 'restricted',
        currentByStaff: true,
        scoreStatus: 'banned',
        score: 150,
      }),
    ).toBe('banned');
  });

  it('an automatic restriction is lifted when complaints age out', () => {
    expect(decideStatus({ ...base, current: 'restricted' })).toBe('ok');
  });
});

describe('fingerprints', () => {
  it('normalises e-mail aliases to one person', () => {
    expect(normalizeSignal('email', ' John.Doe+scam@GoogleMail.com ')).toBe(
      'johndoe@gmail.com',
    );
    expect(normalizeSignal('email', 'a.b+x@example.com')).toBe(
      'a.b@example.com',
    );
  });

  it('hashes with the secret and never returns the value', () => {
    const a = fingerprintHash('p'.repeat(32), 'phone', '+1 (555) 123-4567');
    const b = fingerprintHash('p'.repeat(32), 'phone', '+15551234567');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('5551234567');
    expect(fingerprintHash('q'.repeat(32), 'phone', '+15551234567')).not.toBe(
      a,
    );
    expect(fingerprintHash('p'.repeat(32), 'email', '+15551234567')).not.toBe(
      a,
    );
  });
});
