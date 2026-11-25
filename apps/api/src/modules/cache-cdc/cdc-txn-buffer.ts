import { intentId, intentsFor, type CacheIntent } from './cdc-key-map';

/** The pgoutput messages this buffer reads (pg-logical-replication's
 * `Pgoutput.Message`, only the fields used). */
export interface PgoutputLike {
  tag: string;
  relation?: { schema: string; name: string };
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
  key?: Record<string, unknown> | null;
  commitTime?: bigint | number;
  commitEndLsn?: string | null;
}

/** A committed transaction ready to apply. */
export interface CdcBatch {
  intents: CacheIntent[];
  /** Exclusive WAL end of the transaction: what to acknowledge after. */
  endLsn: string | null;
  /** Commit time, ms since the epoch (lag = now - this). */
  commitMs: number;
  /** More distinct cache actions than the cap: the rest end with the TTL. */
  overflow: boolean;
}

/** Commit time of pgoutput (BigInt µs since the Unix epoch) in ms. */
export function commitMs(t: bigint | number | undefined): number {
  if (t === undefined) return Date.now();
  return typeof t === 'bigint' ? Number(t / 1000n) : Math.floor(t / 1000);
}

/**
 * Collects the cache actions of the transaction being decoded, row by row
 * and synchronously (no message is kept, only distinct actions), and hands
 * them over at COMMIT. A mass update of a big table can produce many
 * distinct actions: past [maxIntents] the rest are dropped and the batch is
 * marked `overflow` (those keys end with their own TTL, 1-5 minutes; the
 * in-request path is untouched) so the worker's memory stays bounded.
 */
export class CdcTxnBuffer {
  private intents = new Map<string, CacheIntent>();
  private open = false;
  private overflow = false;

  constructor(private readonly maxIntents = 200_000) {}

  /** True between BEGIN and COMMIT. */
  get inTransaction(): boolean {
    return this.open;
  }

  /** Feeds one decoded message; returns the batch on COMMIT. */
  push(msg: PgoutputLike): CdcBatch | null {
    switch (msg.tag) {
      case 'begin':
        this.intents = new Map();
        this.open = true;
        this.overflow = false;
        return null;
      case 'insert':
      case 'update':
      case 'delete': {
        const rel = msg.relation;
        if (!rel || rel.schema !== 'public') return null;
        const list = intentsFor({
          table: rel.name,
          op: msg.tag,
          new: msg.new ?? null,
          old: msg.old ?? msg.key ?? null,
        });
        for (const i of list) {
          const id = intentId(i);
          if (this.intents.has(id)) continue;
          if (this.intents.size >= this.maxIntents) {
            this.overflow = true;
            break;
          }
          this.intents.set(id, i);
        }
        return null;
      }
      case 'commit': {
        const batch: CdcBatch = {
          intents: [...this.intents.values()],
          endLsn: msg.commitEndLsn ?? null,
          commitMs: commitMs(msg.commitTime),
          overflow: this.overflow,
        };
        this.intents = new Map();
        this.open = false;
        this.overflow = false;
        return batch;
      }
      default:
        // relation / type / origin / truncate / message: nothing to drop
        // (TRUNCATE is not published).
        return null;
    }
  }
}
