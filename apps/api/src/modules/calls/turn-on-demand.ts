import type Redis from 'ioredis';

/**
 * Owner 2026-11-02: our own coturn must cost nothing while Cloudflare works.
 * The EC2 box stands STOPPED (only its disk is paid for, no Elastic IP) and
 * the API starts it when it is really needed, then stops it again:
 *
 *  - NEEDED: a Cloudflare breaker is open (TURN or SFU), or `calls.transport`
 *    is `own` and no fixed own TURN address is configured. Every tick that
 *    sees the need stamps `lastNeeded`.
 *  - START: needed + the box is stopped -> StartInstances.
 *  - REGISTER: the box runs with a public address and its UDP 3478 answers a
 *    STUN Binding -> the address (`turn:<ip>:3478`) is kept in Redis for
 *    `GET /calls/ice-servers` (the secret stays where it is: Admin ->
 *    Integrations -> TURN `secret`, the same one the box reads from SSM).
 *  - STOP: not needed for [idleMs] (default 30 min) AND no call is running
 *    -> StopInstances, the address is forgotten.
 *
 * The admin switch `calls.own_turn.mode` rules over this: `auto` = all of the
 * above; `on` = the box is kept running always; `off` = never started, and
 * stopped at once when no call is running (no address is offered).
 *
 * Honest gap: from the start to the first STUN answer (about 1-2 minutes) new
 * calls get STUN only, which works on Wi-Fi and easy mobile networks but not
 * behind a strict (symmetric) NAT.
 *
 * Pure state machine: AWS, Redis, the relay check and the clock come in
 * through [TurnOnDemandPorts], so the tests need none of them.
 */
export type Ec2State =
  | 'pending'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'shutting-down'
  | 'terminated';

export interface TurnInstanceInfo {
  state: Ec2State;
  /** Public IPv4 while running (no Elastic IP: new at every start). */
  publicIp?: string;
}

export interface TurnInstancePort {
  describe(): Promise<TurnInstanceInfo>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Where the live address and the "last needed" stamp are kept. */
export interface TurnOnDemandStore {
  getAddress(): Promise<string | null>;
  setAddress(address: string | null): Promise<void>;
  getLastNeeded(): Promise<number | null>;
  setLastNeeded(ms: number): Promise<void>;
}

/** Admin switch `calls.own_turn.mode` (Выкл / Вкл / Авто). */
export type OwnTurnMode = 'auto' | 'on' | 'off';

export function parseOwnTurnMode(v: unknown): OwnTurnMode {
  return v === 'on' || v === 'off' ? v : 'auto';
}

export interface TurnOnDemandPorts {
  instance: TurnInstancePort;
  store: TurnOnDemandStore;
  mode(): Promise<OwnTurnMode>;
  /** A Cloudflare breaker is open, or own is forced without a fixed TURN. */
  needed(): Promise<boolean>;
  /** Calls that are ringing or active right now. */
  activeCalls(): Promise<number>;
  /** UDP 3478 of [ip] answers a STUN Binding. */
  relayAnswers(ip: string): Promise<boolean>;
  now(): number;
}

export type TurnTickAction =
  | 'started'
  | 'starting'
  | 'registered'
  | 'waiting'
  | 'kept'
  | 'stopped'
  | 'idle'
  | 'unavailable';

export const TURN_IDLE_MS = 30 * 60_000;
export const TURN_PORT = 3478;

export class TurnOnDemand {
  constructor(
    private readonly ports: TurnOnDemandPorts,
    private readonly idleMs: number = TURN_IDLE_MS,
  ) {}

  /** The address to offer to phones now, or null (stopped / still booting /
   * switched off in the admin). */
  async address(): Promise<string | null> {
    if ((await this.ports.mode()) === 'off') return null;
    return this.ports.store.getAddress();
  }

  /** One pass; safe to call often and from several API tasks. */
  async tick(): Promise<TurnTickAction> {
    const { instance, store } = this.ports;
    const now = (): number => this.ports.now();
    const info = await instance.describe();
    if (info.state === 'terminated' || info.state === 'shutting-down') {
      await store.setAddress(null);
      return 'unavailable';
    }
    const mode = await this.ports.mode();
    if (mode === 'off') return this.tickOff(info);
    // "on" = always needed (the box is kept running); "auto" = by the breaker.
    const needed = mode === 'on' || (await this.ports.needed());
    if (needed) await store.setLastNeeded(now());

    if (info.state === 'stopped') {
      await store.setAddress(null);
      if (!needed) return 'idle';
      await instance.start();
      return 'started';
    }
    if (info.state === 'stopping') {
      await store.setAddress(null);
      // The box must finish stopping before it can be started again.
      return needed ? 'waiting' : 'idle';
    }
    if (info.state === 'pending') return 'starting';

    // running
    const known = await store.getAddress();
    if (!info.publicIp) return 'waiting';
    const wanted = `turn:${info.publicIp}:${TURN_PORT}`;
    if (needed || known) {
      if (known !== wanted) {
        // A new address (or none yet): offered only once it answers.
        if (!(await this.ports.relayAnswers(info.publicIp))) {
          if (known) await store.setAddress(null);
          return 'waiting';
        }
        await store.setAddress(wanted);
        if (needed) return 'registered';
      }
    }
    if (needed) return 'kept';

    const last = (await store.getLastNeeded()) ?? 0;
    if (now() - last < this.idleMs) return 'kept';
    if ((await this.ports.activeCalls()) > 0) return 'kept';
    await instance.stop();
    await store.setAddress(null);
    return 'stopped';
  }

  /** Switched off: never start; stop at once when no call is running. */
  private async tickOff(info: TurnInstanceInfo): Promise<TurnTickAction> {
    const { instance, store } = this.ports;
    await store.setAddress(null);
    if (info.state === 'pending') return 'waiting'; // cannot be stopped yet
    if (info.state !== 'running') return 'idle';
    if ((await this.ports.activeCalls()) > 0) return 'kept';
    await instance.stop();
    return 'stopped';
  }
}

export const TURN_ADDR_KEY = 'calls:turn:ondemand:addr';
const ADDR_KEY = TURN_ADDR_KEY;
const NEEDED_KEY = 'calls:turn:ondemand:needed';

/** Redis (shared by all API tasks); in-process without a ready Redis. */
export class RedisTurnStore implements TurnOnDemandStore {
  private memAddr: string | null = null;
  private memNeeded: number | null = null;

  constructor(private readonly redis?: Redis) {}

  private get live(): Redis | null {
    return this.redis && this.redis.status === 'ready' ? this.redis : null;
  }

  async getAddress(): Promise<string | null> {
    const r = this.live;
    if (!r) return this.memAddr;
    return (await r.get(ADDR_KEY)) || null;
  }

  async setAddress(address: string | null): Promise<void> {
    this.memAddr = address;
    const r = this.live;
    if (!r) return;
    if (address) await r.set(ADDR_KEY, address, 'EX', 6 * 3600);
    else await r.del(ADDR_KEY);
  }

  async getLastNeeded(): Promise<number | null> {
    const r = this.live;
    if (!r) return this.memNeeded;
    const v = await r.get(NEEDED_KEY);
    return v ? Number(v) : null;
  }

  async setLastNeeded(ms: number): Promise<void> {
    this.memNeeded = ms;
    const r = this.live;
    if (r) await r.set(NEEDED_KEY, String(ms), 'EX', 24 * 3600);
  }
}
