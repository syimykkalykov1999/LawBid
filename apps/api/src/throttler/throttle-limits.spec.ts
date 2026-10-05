import {
  ADMIN_THROTTLE_DEFAULT,
  ADMIN_THROTTLE_MAX,
  ADMIN_THROTTLE_MIN,
  adminThrottleLimit,
  userThrottleLimit,
} from './throttle-limits';

describe('throttle limits', () => {
  it('users stay at 100/min unless THROTTLE_LIMIT is set', () => {
    expect(userThrottleLimit(undefined)).toBe(100);
    expect(userThrottleLimit('abc')).toBe(100);
    expect(userThrottleLimit('300')).toBe(300);
  });

  it('admins use the setting, clamped to the allowed range', () => {
    expect(adminThrottleLimit(ADMIN_THROTTLE_DEFAULT, undefined)).toBe(600);
    expect(adminThrottleLimit(5, undefined)).toBe(ADMIN_THROTTLE_MIN);
    expect(adminThrottleLimit(1e9, undefined)).toBe(ADMIN_THROTTLE_MAX);
    expect(adminThrottleLimit(Number.NaN, undefined)).toBe(600);
  });

  it('ADMIN_THROTTLE_LIMIT overrides the setting', () => {
    expect(adminThrottleLimit(150, '900')).toBe(900);
    expect(adminThrottleLimit(150, '0')).toBe(150);
  });
});
