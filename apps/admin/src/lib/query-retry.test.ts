import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import {
  QUERY_MAX_RETRIES,
  queryRetryDelay,
  shouldRetryQuery,
} from './query-retry';

describe('shouldRetryQuery', () => {
  it('retries network errors and 5xx', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(
      shouldRetryQuery(1, new ApiError(502, 'UPSTREAM_UNAVAILABLE', 'x')),
    ).toBe(true);
    expect(
      shouldRetryQuery(2, new ApiError(504, 'UPSTREAM_TIMEOUT', 'x')),
    ).toBe(true);
  });
  it('never retries a 4xx', () => {
    for (const status of [400, 401, 403, 404, 429]) {
      expect(shouldRetryQuery(0, new ApiError(status, 'X', 'x'))).toBe(false);
    }
  });
  it('stops after the limit', () => {
    expect(shouldRetryQuery(QUERY_MAX_RETRIES, new TypeError('x'))).toBe(false);
  });
});

describe('queryRetryDelay', () => {
  it('grows exponentially, is capped and jittered', () => {
    expect(queryRetryDelay(0, () => 1)).toBe(1000);
    expect(queryRetryDelay(0, () => 0)).toBe(500);
    expect(queryRetryDelay(2, () => 1)).toBe(4000);
    expect(queryRetryDelay(10, () => 1)).toBe(15_000);
    expect(queryRetryDelay(10, () => 0)).toBe(7500);
  });
});
