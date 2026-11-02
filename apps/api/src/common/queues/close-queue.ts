import { withTimeout } from '../resilience/resilience';

/**
 * Closes a BullMQ queue on shutdown within a bound. `Queue.close()` first
 * waits for its connection to be ready; while Redis is away that wait has
 * no end, Nest would hang in onApplicationShutdown and ECS would SIGKILL the
 * task mid-drain (load test 2026-11-02, PR #606 «проверка Redis»). A close
 * that does not finish in [ms] is abandoned: the process is exiting anyway.
 */
export async function closeQueueBounded(
  queue: { name: string; close(): Promise<void> } | undefined,
  ms = 2000,
): Promise<void> {
  if (!queue) return;
  try {
    await withTimeout(`queue_close:${queue.name}`, ms, () => queue.close());
  } catch {
    // timed out or the connection is already gone: nothing left to flush
  }
}
