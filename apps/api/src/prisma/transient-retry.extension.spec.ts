import { transientRetryAttempts } from './transient-retry.extension';

describe('transientRetryAttempts', () => {
  it('defaults to 3, is configurable and can be switched off', () => {
    expect(transientRetryAttempts({})).toBe(3);
    expect(transientRetryAttempts({ DB_TRANSIENT_RETRIES: '5' })).toBe(5);
    expect(transientRetryAttempts({ DB_TRANSIENT_RETRIES: '0' })).toBe(0);
    expect(transientRetryAttempts({ DB_TRANSIENT_RETRIES: '99' })).toBe(6);
  });
});
