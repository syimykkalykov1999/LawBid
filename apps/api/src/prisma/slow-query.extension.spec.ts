import { slowQueryThresholdMs } from './slow-query.extension';

describe('slowQueryThresholdMs', () => {
  it('defaults to 300 ms', () => {
    expect(slowQueryThresholdMs({})).toBe(300);
  });
  it('reads DB_SLOW_QUERY_MS; 0 switches it off', () => {
    expect(slowQueryThresholdMs({ DB_SLOW_QUERY_MS: '150' })).toBe(150);
    expect(slowQueryThresholdMs({ DB_SLOW_QUERY_MS: '0' })).toBe(0);
  });
  it('ignores garbage and negatives', () => {
    expect(slowQueryThresholdMs({ DB_SLOW_QUERY_MS: 'x' })).toBe(300);
    expect(slowQueryThresholdMs({ DB_SLOW_QUERY_MS: '-5' })).toBe(0);
  });
});
