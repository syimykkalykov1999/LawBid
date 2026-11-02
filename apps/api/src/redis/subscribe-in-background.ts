import type Redis from 'ioredis';

/**
 * Load test 2026-11-02 (PR #606, docs/perf/LOAD_RESILIENCE_2026-11-02.md
 * «проверка Redis»): with Redis away at boot the API never opened its
 * port — two module-init hooks `await`ed `subscribe()` on a pub/sub client.
 * Such a client keeps ioredis' offline queue on purpose (pubSubClient): the
 * SUBSCRIBE waits until the connection exists and is re-sent after every
 * reconnect, which is exactly what a subscriber needs — but it means the
 * promise resolves only when Redis is there, so boot must not wait for it.
 * On ECS a port that never opens fails the health check and the task is
 * replaced in a loop: a cache outage would become an API outage.
 *
 * The big players treat pub/sub subscriptions as background state that
 * converges (Socket.IO's Redis adapter does the same for its own
 * channels; RealtimeGateway already subscribes this way). This helper is
 * that one pattern: wire the handler, send SUBSCRIBE, log a failure, never
 * block the caller.
 */
export function subscribeInBackground(
  sub: Pick<Redis, 'on' | 'subscribe'>,
  channel: string,
  onMessage: (channel: string, message: string) => void,
  warn: (message: string) => void,
): void {
  sub.on('message', onMessage);
  void sub.subscribe(channel).then(
    () => undefined,
    (error: unknown) => warn(`subscribe ${channel} failed: ${String(error)}`),
  );
}
