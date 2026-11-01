import {
  CALL_POLL_TTL_SEC,
  callPollKey,
  signCallPoll,
  verifyCallPoll,
} from './call-poll-token';

/** Owner 2026-10-28: the ringing phone's «still ringing?» ticket. */
describe('call poll ticket', () => {
  const key = callPollKey('test-call-poll-pepper-at-least-32-chars-x');
  const now = 1_800_000_000_000;

  it('is valid for its own call until it expires', () => {
    const t = signCallPoll(key, { c: 'call-1', u: 'u1' }, now);
    expect(verifyCallPoll(key, t, 'call-1', now)).toMatchObject({
      c: 'call-1',
      u: 'u1',
    });
    expect(
      verifyCallPoll(key, t, 'call-1', now + (CALL_POLL_TTL_SEC - 1) * 1000),
    ).not.toBeNull();
    expect(
      verifyCallPoll(key, t, 'call-1', now + (CALL_POLL_TTL_SEC + 1) * 1000),
    ).toBeNull();
  });

  it('does not open another call', () => {
    const t = signCallPoll(key, { c: 'call-1', u: 'u1' }, now);
    expect(verifyCallPoll(key, t, 'call-2', now)).toBeNull();
  });

  it('refuses a forged or edited ticket and other keys', () => {
    const t = signCallPoll(key, { c: 'call-1', u: 'u1' }, now);
    const [v, payload, mac] = t.split('.');
    const edited = Buffer.from(
      JSON.stringify({ c: 'call-1', u: 'u2', e: now / 1000 + 999 }),
    ).toString('base64url');
    expect(
      verifyCallPoll(key, `${v}.${edited}.${mac}`, 'call-1', now),
    ).toBeNull();
    expect(
      verifyCallPoll(key, `${v}.${payload}.x${mac}`, 'call-1', now),
    ).toBeNull();
    expect(verifyCallPoll(key, 'garbage', 'call-1', now)).toBeNull();
    const other = callPollKey('another-pepper-at-least-32-characters-y');
    expect(verifyCallPoll(other, t, 'call-1', now)).toBeNull();
  });
});
