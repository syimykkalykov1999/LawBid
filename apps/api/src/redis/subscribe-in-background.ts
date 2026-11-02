import type Redis from 'ioredis';
import { withTimeout } from '../common/resilience/resilience';
import { pubSubClient } from './redis-connection';

/**
 * A pub/sub subscription that never holds the caller.
 *
 * Why (load test 2026-11-02, PR #606): with Redis away at boot the API never
 * opened its port — module-init hooks `await`ed `subscribe()`. A pub/sub
 * client keeps ioredis' offline queue on (pubSubClient): SUBSCRIBE waits for
 * the connection and is re-sent after every reconnect — right for a
 * subscriber, but the promise settles only when Redis is there. On ECS a
 * port that never opens is a health-check failure and a restart loop.
 *
 * What: create the client, wire the handler, send SUBSCRIBE in the
 * background; a SUBSCRIBE the server refuses (NOAUTH around a token
 * rotation, a node not ready) is re-sent on the next `ready`, because
 * ioredis only auto-resubscribes channels the server acknowledged.
 * `close()` drops a client that is not ready (QUIT would queue behind the
 * pending SUBSCRIBE and hang the shutdown) and bounds QUIT otherwise.
 */
export interface BackgroundSubscriber {
  close(): Promise<void>;
}

/** The part of an ioredis subscriber the helper uses (fakes in specs). */
export interface Subscriber {
  status?: string;
  on(event: 'message', fn: (channel: string, message: string) => void): unknown;
  once(event: 'ready', fn: () => void): unknown;
  subscribe(channel: string): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
}

export function backgroundSubscriber(
  redis: Redis | undefined,
  channel: string,
  onMessage: (channel: string, message: string) => void,
  warn: (message: string) => void,
): BackgroundSubscriber | undefined {
  if (!redis || typeof redis.duplicate !== 'function') return undefined;
  let sub: Subscriber;
  try {
    sub = pubSubClient(redis);
  } catch (error) {
    warn(`pub/sub client not created: ${String(error)}`);
    return undefined;
  }
  sub.on('message', onMessage);
  const attempt = (): void => {
    void sub.subscribe(channel).catch((error: unknown) => {
      warn(
        `subscribe ${channel} failed, retrying on reconnect: ${String(error)}`,
      );
      sub.once('ready', attempt);
    });
  };
  attempt();
  return { close: () => closeSubscriber(sub) };
}

/** See [backgroundSubscriber]: a not-ready client is dropped, a ready one
 * gets a bounded QUIT (a QUIT that hangs or fails ends in disconnect). */
export async function closeSubscriber(
  sub: Pick<Subscriber, 'status' | 'quit' | 'disconnect'>,
  quitTimeoutMs = 2000,
): Promise<void> {
  if (sub.status !== 'ready') {
    sub.disconnect();
    return;
  }
  try {
    await withTimeout('pubsub_quit', quitTimeoutMs, () => sub.quit());
  } catch {
    sub.disconnect();
  }
}
