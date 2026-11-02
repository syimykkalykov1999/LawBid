import {
  createRedisClient,
  pubSubClient,
  requestPathOptions,
  waitForReady,
} from './redis-connection';

/** Real Redis Cluster (REDIS_CLUSTER_TEST_URL=redis://127.0.0.1:7001, three
 * masters with cluster-enabled yes); skipped without it. */
const URL_ = process.env.REDIS_CLUSTER_TEST_URL;
(URL_ ? describe : describe.skip)('cluster mode against a live cluster', () => {
  it('pub/sub clone of the request client queues commands and delivers', async () => {
    const env = { REDIS_CLUSTER: 'true' };
    const client = createRedisClient(
      URL_ as string,
      requestPathOptions(1000),
      env,
    );
    await waitForReady(client, 10_000);
    expect(
      (client as unknown as { options: { enableOfflineQueue: boolean } })
        .options.enableOfflineQueue,
    ).toBe(false);
    const sub = pubSubClient(client);
    try {
      expect(
        (sub as unknown as { options: { enableOfflineQueue: boolean } }).options
          .enableOfflineQueue,
      ).toBe(true);
      const got = new Promise<string>((resolve) =>
        sub.on('smessage', (_c: string, m: string) => resolve(m)),
      );
      await (
        sub as unknown as { ssubscribe(c: string): Promise<unknown> }
      ).ssubscribe('{t}chan');
      await (
        client as unknown as {
          spublish(c: string, m: string): Promise<unknown>;
        }
      ).spublish('{t}chan', 'hi');
      await expect(got).resolves.toBe('hi');
    } finally {
      sub.disconnect();
      client.disconnect();
    }
  }, 30_000);
});
