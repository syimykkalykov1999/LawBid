/**
 * Load test 2026-11-02 (PR #606 «проверка Redis на стенде»): with Redis
 * away at boot the API never opened its port — two module-init hooks
 * `await`ed `subscribe()` on a pub/sub client. Such a client keeps ioredis'
 * offline queue on purpose (pubSubClient): the SUBSCRIBE waits until the
 * connection exists and is re-sent after every reconnect, which is exactly
 * what a subscriber needs — but it means the promise resolves only when
 * Redis is there, so boot must not wait for it. On ECS a port that never
 * opens fails the health check and the task is replaced in a loop: a cache
 * outage would become an API outage.
 *
 * The big players treat pub/sub subscriptions as background state that
 * converges (Socket.IO's Redis adapter does the same for its own channels;
 * RealtimeGateway subscribes to session:revoked this way). This helper is
 * that one pattern: wire the handler, send SUBSCRIBE, and if Redis refuses
 * it (NOAUTH around a token rotation, a cluster node not ready) try again
 * on the next `ready` — never block the caller.
 */
/** The part of an ioredis subscriber the helper uses (fakes in specs). */
export interface Subscriber {
  on(event: 'message', fn: (channel: string, message: string) => void): unknown;
  once(event: 'ready', fn: () => void): unknown;
  subscribe(channel: string): Promise<unknown>;
}

export function subscribeInBackground(
  sub: Subscriber,
  channel: string,
  onMessage: (channel: string, message: string) => void,
  warn: (message: string) => void,
): void {
  sub.on('message', onMessage);
  const attempt = (): void => {
    void sub.subscribe(channel).then(
      () => undefined,
      (error: unknown) => {
        warn(
          `subscribe ${channel} failed, retrying on reconnect: ${String(error)}`,
        );
        sub.once('ready', attempt);
      },
    );
  };
  attempt();
}

/**
 * Closes a pub/sub client on shutdown. `quit()` is a command: while the
 * connection is down it would wait in the offline queue behind the pending
 * SUBSCRIBE and the shutdown would hang (Nest awaits onModuleDestroy, ECS
 * would SIGKILL the task with its sockets). A client that is not ready is
 * dropped at once; a ready one gets a bounded QUIT.
 */
export async function closeSubscriber(
  sub: { quit(): Promise<unknown>; disconnect(): void; status?: string },
  quitTimeoutMs = 2000,
): Promise<void> {
  if (sub.status !== 'ready') {
    sub.disconnect();
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sub.quit(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          sub.disconnect();
          resolve();
        }, quitTimeoutMs);
      }),
    ]);
  } catch {
    sub.disconnect();
  } finally {
    clearTimeout(timer);
  }
}
