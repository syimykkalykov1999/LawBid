import {
  LogicalReplicationService,
  PgoutputPlugin,
} from 'pg-logical-replication';
import { CDC_PUBLICATION } from './cdc-key-map';
import type { CdcInvalidator } from './cdc-invalidator';
import { CDC_SLOT, cdcClientConfig } from './cdc-slot';
import {
  CdcTxnBuffer,
  type CdcBatch,
  type PgoutputLike,
} from './cdc-txn-buffer';

export type CdcStreamState = 'starting' | 'streaming' | 'stopped';

export interface CdcStreamStats {
  state: CdcStreamState;
  /** Committed transactions applied since the start. */
  applied: number;
  /** Cache actions run since the start. */
  actions: number;
  /** Batches over the action cap (their extra keys end with the TTL). */
  overflows: number;
  /** Commit → Redis delay of the last applied transaction, seconds. */
  lastLagSec: number | null;
  /** Age of the oldest committed transaction not yet applied, seconds. */
  pendingLagSec: number;
  lastMessageAt: number | null;
  lastError: string | null;
}

/**
 * One logical replication stream of one database (pgoutput over
 * pg-logical-replication, MIT, https://github.com/kibae/pg-logical-replication).
 *
 * At-least-once: the WAL position is acknowledged only after the Redis
 * actions of that transaction ran (`acknowledge.auto = false`, no timer
 * that would acknowledge what was merely received). Row messages are
 * folded into the open transaction synchronously; only COMMIT queues an
 * async apply, one after another. Idle keepalives move the slot forward
 * when nothing is in flight, so WAL of unpublished tables is not kept.
 */
export class CdcStream {
  private service: LogicalReplicationService | null = null;
  private readonly buffer: CdcTxnBuffer;
  private chain: Promise<void> = Promise.resolve();
  /** Commit times of the transactions queued but not applied yet. */
  private readonly pending: number[] = [];
  /** Last WAL end acknowledged after its actions ran. */
  private lastAcked: string | null = null;
  private stats: CdcStreamStats = {
    state: 'stopped',
    applied: 0,
    actions: 0,
    overflows: 0,
    lastLagSec: null,
    pendingLagSec: 0,
    lastMessageAt: null,
    lastError: null,
  };

  constructor(
    private readonly url: string,
    private readonly invalidator: CdcInvalidator,
    private readonly onError: (e: unknown) => void,
    maxIntents?: number,
  ) {
    this.buffer = new CdcTxnBuffer(maxIntents);
  }

  snapshot(now = Date.now()): CdcStreamStats {
    return {
      ...this.stats,
      pendingLagSec:
        this.pending.length === 0
          ? 0
          : Math.max(0, Math.round((now - this.pending[0]) / 1000)),
    };
  }

  get running(): boolean {
    return this.stats.state !== 'stopped';
  }

  /** Starts streaming; resolves once START_REPLICATION was sent (the
   * replication itself runs until stop() or an error). */
  start(): void {
    if (this.running) return;
    this.stats = { ...this.stats, state: 'starting', lastError: null };
    const service = new LogicalReplicationService(cdcClientConfig(this.url), {
      acknowledge: { auto: false, timeoutSeconds: 0 },
    });
    this.service = service;
    service.on('start', () => {
      this.stats.state = 'streaming';
    });
    service.on('data', (_lsn: string, msg: PgoutputLike) => this.onData(msg));
    service.on(
      'heartbeat',
      (lsn: string, _ts: number, shouldRespond: boolean) =>
        void this.onHeartbeat(lsn, shouldRespond),
    );
    service.on('error', (e: Error) => this.fail(e));
    const plugin = new PgoutputPlugin({
      protoVersion: 1,
      publicationNames: [CDC_PUBLICATION],
    });
    service.subscribe(plugin, CDC_SLOT).catch((e: unknown) => this.fail(e));
  }

  async stop(): Promise<void> {
    const s = this.service;
    this.service = null;
    this.stats.state = 'stopped';
    this.pending.length = 0;
    if (s) await s.destroy().catch(() => undefined);
  }

  /** Test seam and the library's 'data' event. */
  onData(msg: PgoutputLike): void {
    this.stats.lastMessageAt = Date.now();
    const batch = this.buffer.push(msg);
    if (batch) this.enqueue(batch);
  }

  private enqueue(batch: CdcBatch): void {
    this.pending.push(batch.commitMs);
    this.chain = this.chain.then(async () => {
      if (!this.service) return; // stopped: the WAL is decoded again later
      try {
        const n = await this.invalidator.apply(batch.intents);
        this.stats.applied++;
        this.stats.actions += n;
        if (batch.overflow) this.stats.overflows++;
        this.stats.lastLagSec = Math.max(
          0,
          Math.round((Date.now() - batch.commitMs) / 1000),
        );
        if (batch.endLsn) {
          await this.service?.acknowledge(batch.endLsn);
          this.lastAcked = batch.endLsn;
        }
      } catch (e) {
        // Not acknowledged: after the reconnect PostgreSQL sends it again.
        this.fail(e);
      } finally {
        this.pending.shift();
      }
    });
  }

  private async onHeartbeat(lsn: string, shouldRespond: boolean) {
    this.stats.lastMessageAt = Date.now();
    if (!this.service) return;
    // Nothing decoded and not applied: everything up to [lsn] is done.
    if (this.pending.length === 0 && !this.buffer.inTransaction) {
      await this.service.acknowledge(lsn, false).catch(() => undefined);
      this.lastAcked = lsn;
    } else if (shouldRespond) {
      // Busy: answer the keepalive without moving the position past what
      // was applied (PostgreSQL never moves a slot backwards).
      await this.service
        .acknowledge(this.lastAcked ?? '0/0', false)
        .catch(() => undefined);
    }
  }

  private fail(e: unknown): void {
    // The library reports one failure twice (the 'error' event and the
    // rejected subscribe()): report it once.
    if (!this.service && this.stats.lastError) return;
    this.stats.lastError = e instanceof Error ? e.message : String(e);
    void this.stop();
    this.onError(e);
  }
}
