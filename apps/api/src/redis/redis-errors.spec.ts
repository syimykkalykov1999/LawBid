import { isRedisInfraError } from './redis-errors';

describe('isRedisInfraError', () => {
  it('recognises ioredis connection errors, not command errors', () => {
    const allFailed = new Error('Failed to refresh slots cache.');
    allFailed.name = 'ClusterAllFailedError';
    const retries = new Error('Reached the max retries per request limit');
    retries.name = 'MaxRetriesPerRequestError';
    for (const e of [
      new Error('Command timed out'),
      retries,
      allFailed,
      new Error(
        "Stream isn't writeable and enableOfflineQueue options is false",
      ),
      new Error("Cluster isn't ready and enableOfflineQueue options is false"),
      new Error('Connection is closed.'),
    ]) {
      expect(isRedisInfraError(e)).toBe(true);
    }
    expect(isRedisInfraError(new Error('ERR unknown command'))).toBe(false);
    expect(isRedisInfraError('Command timed out')).toBe(false);
  });
});
