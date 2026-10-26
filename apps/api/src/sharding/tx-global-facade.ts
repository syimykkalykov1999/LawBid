import { delegateInfo } from './shard-delegates';
import { PER_DATABASE_MODELS } from './shard-manifest';

/**
 * Shard-ready step 7 (docs/architecture/SHARDING_READY.md §6 "Transactions"):
 * a transaction runs on ONE database, the one of the shard context. Code
 * written for one database freely mixes families inside it:
 *
 *   withTxRetry(prisma, async (tx) => {
 *     await tx.case.create(...);          // case family   -> shard database
 *     await tx.userConsent.create(...);   // GLOBAL family -> primary database
 *   });
 *
 * Once the shard database is not the primary one, `tx.userConsent` would hit
 * the SHARD database, where the user (and every other global row) does not
 * exist. This facade wraps the `tx` the callback receives, ONLY when the
 * transaction runs on a non-primary database: delegates of GLOBAL models are
 * answered by the primary client instead (outside the transaction, which
 * cannot span two databases).
 *
 *  - global READS (the user, settings, plans ...) become correct;
 *  - global WRITES become "global first": they commit at once on the primary
 *    database. The sharded rows of the same transaction may still roll back
 *    afterwards. That is the documented rule for money and permissions
 *    ("keep the write on the global DB first and reference it"). Writes that
 *    must be atomic with a sharded write and are safe to apply a moment
 *    later go through the outbox instead (`CrossFamilyOutbox.emit`).
 *
 * With one physical database this facade is never installed: the
 * transaction is exactly what it was.
 */
export type GlobalWriteObserver = (model: string, operation: string) => void;

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

export function withGlobalFacade<T extends object>(
  tx: T,
  primary: object,
  onGlobalWrite?: GlobalWriteObserver,
): T {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const info = typeof prop === 'string' ? delegateInfo(prop) : undefined;
      if (
        !info ||
        info.family !== 'global' ||
        PER_DATABASE_MODELS.has(info.model)
      ) {
        return Reflect.get(target, prop, receiver);
      }
      const delegate = (primary as Record<string, unknown>)[
        prop as string
      ] as Record<string, unknown>;
      return new Proxy(delegate, {
        get(d, op) {
          const value: unknown = Reflect.get(d, op);
          if (
            typeof value === 'function' &&
            typeof op === 'string' &&
            WRITE_OPERATIONS.has(op)
          ) {
            return (...args: unknown[]) => {
              onGlobalWrite?.(info.model, op);
              return (value as (...a: unknown[]) => unknown).apply(d, args);
            };
          }
          return typeof value === 'function'
            ? ((value as (...a: unknown[]) => unknown).bind(d) as unknown)
            : value;
        },
      });
    },
  });
}
