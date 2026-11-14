import { describe, expect, it } from 'vitest';
import { listHref, queueFilterFrom } from './registry-conveyor';
import { QUEUE_LATE_KEY, QUEUE_WARN_KEY, waitThresholds, waitTone, waitToneTitle } from './verification-sla';

const H = 3600;

describe('verification queue waiting colour', () => {
  it('defaults: amber from 24 h, red from 48 h', () => {
    const t = waitThresholds(undefined);
    expect(t).toEqual({ warnHours: 24, lateHours: 48 });
    expect(waitTone(23 * H, t)).toBe('ok');
    expect(waitTone(24 * H, t)).toBe('warn');
    expect(waitTone(47 * H, t)).toBe('warn');
    expect(waitTone(48 * H, t)).toBe('late');
    expect(waitTone(null, t)).toBe('ok');
  });

  it('the thresholds come from the admin settings', () => {
    const t = waitThresholds([
      { key: QUEUE_WARN_KEY, value: 2, defaultValue: 24 },
      { key: QUEUE_LATE_KEY, value: null, defaultValue: 6 },
    ]);
    expect(t).toEqual({ warnHours: 2, lateHours: 6 });
    expect(waitTone(3 * H, t)).toBe('warn');
    expect(waitTone(6 * H, t)).toBe('late');
    expect(waitToneTitle('late', t)).toBe('Ждёт дольше 6 ч');
    expect(waitToneTitle('ok', t)).toBeUndefined();
  });

  it('a broken setting falls back to the default', () => {
    expect(waitThresholds([{ key: QUEUE_WARN_KEY, value: 'x' }, { key: QUEUE_LATE_KEY, value: -1 }])).toEqual({ warnHours: 24, lateHours: 48 });
  });
});

describe('card → list keeps the queue filter', () => {
  it('«К списку» goes back to the same tab and state', () => {
    const f = queueFilterFrom(new URLSearchParams('status=in_review&stateCode=ny'));
    expect(listHref(f)).toBe('/verification?status=in_review&stateCode=NY');
    expect(listHref({ status: '', stateCode: '' })).toBe('/verification');
  });
});
