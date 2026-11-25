import type Redis from 'ioredis';
import type { SwitchMode } from '../../common/app-settings/switch-mode';
import type { CdcBlocker } from './cdc-slot';

/**
 * C2: the status the worker's cache CDC writes every 30 s and the admin
 * light («Здоровье системы») reads. No replication import here, so the API
 * process can read it without loading the replication client.
 */
/** Redis key of the status the admin light reads (main Redis, 10 min). */
export const CDC_STATUS_KEY = 'ops:cache_cdc';
export const CDC_STATUS_TTL_SEC = 600;
export const CDC_TICK_MS = 30_000;

export type CdcDbState =
  /** Switch Выкл: nothing streams, our slot is removed. */
  | 'off'
  /** Авто and the database is not ready (wal_level, rights): waits. */
  | 'waiting'
  /** Вкл and the database is not ready: the owner step is missing. */
  | 'not_ready'
  /** This worker streams. */
  | 'streaming'
  /** This worker is connecting. */
  | 'starting'
  /** Another worker task holds the slot (one reader per slot). */
  | 'standby'
  /** A probe or the stream failed; retried every 30 s. */
  | 'error';

export interface CdcDbStatus {
  db: string;
  state: CdcDbState;
  blockers: CdcBlocker[];
  slotRetainedMb: number | null;
  slotBehindMb: number | null;
  lagSec: number | null;
  applied: number;
  actions: number;
  overflows: number;
  slotDrops: number;
  lastError: string | null;
}

export interface CdcStatus {
  at: string;
  mode: SwitchMode;
  maxSlotWalMb: number;
  lagAlarmSec: number;
  dbs: CdcDbStatus[];
}

/** Reads the last status for the admin light (null = never written). */
export async function readCdcStatus(redis: Redis): Promise<CdcStatus | null> {
  try {
    const raw = await redis.get(CDC_STATUS_KEY);
    return raw ? (JSON.parse(raw) as CdcStatus) : null;
  } catch {
    return null;
  }
}

export type CdcLight = 'green' | 'yellow' | 'red' | 'grey';

/**
 * The «Здоровье системы» colour. Grey: switched off, or Авто waiting for
 * the database (nothing is wrong, the in-request path works as before).
 * Yellow: Вкл without the owner step, a failing stream, a lag over the
 * alarm, a batch over the action cap, or a status older than 3 minutes (the
 * worker is silent). Red: the slot keeps more than 80 % of the WAL ceiling
 * (the guard is about to drop it; the disk is at risk if it cannot).
 * Never red for a cache miss alone: the TTLs bound every stale answer.
 */
export function cdcLight(status: CdcStatus | null, now = Date.now()): CdcLight {
  if (!status || status.mode === 'off') return 'grey';
  if (now - Date.parse(status.at) > 3 * 60_000) return 'yellow';
  const dbs = status.dbs;
  if (
    status.maxSlotWalMb > 0 &&
    dbs.some((d) => (d.slotRetainedMb ?? 0) > status.maxSlotWalMb * 0.8)
  ) {
    return 'red';
  }
  if (dbs.length === 0 || dbs.every((d) => d.state === 'waiting')) {
    return 'grey';
  }
  const bad = dbs.some(
    (d) =>
      d.state === 'error' ||
      d.state === 'not_ready' ||
      d.overflows > 0 ||
      (d.lagSec ?? 0) > status.lagAlarmSec,
  );
  return bad ? 'yellow' : 'green';
}
