import { MOVE_STATES, MoveRecord } from './move-types';

/** What the admin screen gets for a move (no raw cursors). */
export interface MoveView {
  id: string;
  logicalShard: number;
  fromDb: string;
  toDb: string;
  state: string;
  status: string;
  percent: number;
  note: string;
  error: string | null;
  createdAt: string;
  flippedAt: string | null;
  cleanupAfter: string | null;
  heartbeatAt: string | null;
  verify: Record<string, unknown> | null;
}

/**
 * Progress 0..100: the copy is the long step (80 % of the bar, by rows
 * copied against the preflight count), the other steps are fixed marks.
 */
export function movePercent(m: MoveRecord): number {
  if (m.status === 'done' || m.status === 'waiting') return 100;
  if (m.status === 'rolled_back') return 0;
  const total = m.plan?.totalRows ?? 0;
  const copied = Object.values(m.progress.tables ?? {}).reduce(
    (n, t) => n + t.copied,
    0,
  );
  const copyShare = total > 0 ? Math.min(1, copied / total) : 0;
  switch (m.state) {
    case 'preflight':
      return 2;
    case 'copy':
      return Math.round(5 + copyShare * 75);
    default: {
      const idx = MOVE_STATES.indexOf(m.state);
      // catchup 85, freeze 90, verify 95, flip 98
      return Math.min(98, 80 + (idx - MOVE_STATES.indexOf('copy')) * 5);
    }
  }
}

export function moveView(m: MoveRecord): MoveView {
  return {
    id: m.id,
    logicalShard: m.logicalShard,
    fromDb: m.fromDb,
    toDb: m.toDb,
    state: m.state,
    status: m.status,
    percent: movePercent(m),
    note: m.progress.note ?? '',
    error: m.error,
    createdAt: m.createdAt.toISOString(),
    flippedAt: m.flippedAt?.toISOString() ?? null,
    cleanupAfter: m.cleanupAfter?.toISOString() ?? null,
    heartbeatAt: m.heartbeatAt?.toISOString() ?? null,
    verify: (m.progress.verify as unknown as Record<string, unknown>) ?? null,
  };
}
