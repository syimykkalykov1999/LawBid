import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  MoveRecord,
  MoveState,
  MoveStatus,
  PreflightResult,
  emptyProgress,
} from './move-types';
import type { MapEntry, MoveStore } from './shard-move.runner';

type Row = {
  id: string;
  logical_shard: number;
  from_db: string;
  to_db: string;
  state: string;
  status: string;
  progress: Prisma.JsonValue;
  plan: Prisma.JsonValue | null;
  error: string | null;
  requested_by: string | null;
  heartbeat_at: Date | null;
  flipped_at: Date | null;
  leftover_db: string | null;
  cleanup_after: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function toRecord(r: Row): MoveRecord {
  return {
    id: r.id,
    logicalShard: r.logical_shard,
    fromDb: r.from_db,
    toDb: r.to_db,
    state: r.state as MoveState,
    status: r.status as MoveStatus,
    progress: {
      ...emptyProgress(),
      ...((r.progress as object) ?? {}),
    },
    plan: (r.plan as unknown as PreflightResult) ?? null,
    error: r.error,
    requestedBy: r.requested_by,
    heartbeatAt: r.heartbeat_at,
    flippedAt: r.flipped_at,
    leftoverDb: r.leftover_db,
    cleanupAfter: r.cleanup_after,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** `shard_moves` and `shard_map` on the primary database. */
export class PrismaMoveStore implements MoveStore {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.global();
  }

  async create(input: {
    logicalShard: number;
    fromDb: string;
    toDb: string;
    requestedBy: string | null;
  }): Promise<MoveRecord> {
    const r = await this.db.shardMove.create({
      data: {
        logical_shard: input.logicalShard,
        from_db: input.fromDb,
        to_db: input.toDb,
        requested_by: input.requestedBy,
        status: 'running',
        progress: emptyProgress() as unknown as Prisma.InputJsonValue,
      },
    });
    return toRecord(r);
  }

  async get(id: string): Promise<MoveRecord | null> {
    const r = await this.db.shardMove.findUnique({ where: { id } });
    return r ? toRecord(r) : null;
  }

  async update(id: string, patch: Partial<MoveRecord>): Promise<MoveRecord> {
    const data: Prisma.ShardMoveUncheckedUpdateInput = {};
    if (patch.state !== undefined) data.state = patch.state;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.progress !== undefined) {
      data.progress = patch.progress as unknown as Prisma.InputJsonValue;
    }
    if (patch.plan !== undefined) {
      data.plan = (patch.plan ??
        Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
    }
    if (patch.error !== undefined) data.error = patch.error;
    if (patch.heartbeatAt !== undefined) data.heartbeat_at = patch.heartbeatAt;
    if (patch.flippedAt !== undefined) data.flipped_at = patch.flippedAt;
    if (patch.leftoverDb !== undefined) data.leftover_db = patch.leftoverDb;
    if (patch.cleanupAfter !== undefined)
      data.cleanup_after = patch.cleanupAfter;
    const r = await this.db.shardMove.update({ where: { id }, data });
    return toRecord(r);
  }

  async activeFor(shard: number): Promise<MoveRecord | null> {
    const r = await this.db.shardMove.findFirst({
      where: {
        logical_shard: shard,
        status: { in: ['running', 'waiting', 'failed'] },
      },
      orderBy: { created_at: 'desc' },
    });
    return r ? toRecord(r) : null;
  }

  async mapOf(shard: number): Promise<MapEntry> {
    const r = await this.db.shardMap.findUnique({
      where: { logical_shard: shard },
    });
    return r
      ? { physicalDb: r.physical_db, state: r.state, version: r.version }
      : { physicalDb: 'primary', state: 'active', version: 0 };
  }

  async setMapState(shard: number, state: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE shard_map SET state = ${state}, updated_at = now()
       WHERE logical_shard = ${shard}`;
  }

  async flipMap(shard: number, toDb: string): Promise<number> {
    const rows = await this.db.$queryRaw<{ version: number }[]>`
      UPDATE shard_map
         SET physical_db = ${toDb}, state = 'active', updated_at = now(),
             version = (SELECT COALESCE(max(version), 0) + 1 FROM shard_map)
       WHERE logical_shard = ${shard}
       RETURNING version`;
    if (rows.length === 0) {
      throw new Error(`shard_map has no row for logical shard ${shard}`);
    }
    return rows[0].version;
  }

  /** Moves the operator can still act on, newest first. */
  async recent(limit = 30): Promise<MoveRecord[]> {
    const rows = await this.db.shardMove.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return rows.map((r) => toRecord(r));
  }

  async queued(): Promise<MoveRecord[]> {
    const rows = await this.db.shardMove.findMany({
      where: { status: 'running' },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((r) => toRecord(r));
  }

  async dueForCleanup(now: Date): Promise<MoveRecord[]> {
    const rows = await this.db.shardMove.findMany({
      where: {
        status: { in: ['waiting', 'rolled_back'] },
        leftover_db: { not: null },
        cleanup_after: { lte: now },
      },
      orderBy: { cleanup_after: 'asc' },
      take: 20,
    });
    return rows.map((r) => toRecord(r));
  }
}
