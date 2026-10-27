import { AUTH_EVENT_TYPES, sloCountersFor } from './auth-event.service';

describe('sloCountersFor (S12-3, S12-13)', () => {
  it('counts sign-in outcomes for the login SLI', () => {
    expect(
      sloCountersFor(AUTH_EVENT_TYPES.PASSWORD_LOGIN_SUCCESS, true),
    ).toEqual(['loginOk']);
    expect(sloCountersFor(AUTH_EVENT_TYPES.OTP_VERIFY_SUCCESS, true)).toEqual([
      'loginOk',
    ]);
    expect(
      sloCountersFor(AUTH_EVENT_TYPES.PASSWORD_LOGIN_FAILED, false),
    ).toEqual(['loginFail', 'authFailed']);
  });

  it('feeds the abuse counters', () => {
    expect(sloCountersFor(AUTH_EVENT_TYPES.OTP_REQUESTED, true)).toEqual([
      'otpRequested',
    ]);
    expect(sloCountersFor(AUTH_EVENT_TYPES.OTP_LOCKED, false)).toEqual([
      'authFailed',
    ]);
    expect(
      sloCountersFor(AUTH_EVENT_TYPES.REFRESH_REUSE_DETECTED, false),
    ).toEqual(['authFailed']);
  });

  it('ignores everything else', () => {
    expect(sloCountersFor(AUTH_EVENT_TYPES.LOGOUT, true)).toEqual([]);
    expect(sloCountersFor(AUTH_EVENT_TYPES.TOKEN_REFRESHED, true)).toEqual([]);
  });
});
