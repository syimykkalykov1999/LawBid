import type Redis from 'ioredis';
import { pipeline } from '../../redis/redis-cluster-safe';
import {
  ACCEPT_LUA,
  CANCEL_LUA,
  CAS_LUA,
  CLAIM_LUA,
  END_CALL_LUA,
  FREE_LAWYER_LUA,
  GO_OFFLINE_LUA,
  LAWYER_OFF_LUA,
  LAWYER_ON_LUA,
  MATCH_REQUEST_LUA,
  NOTIFY_PICK_LUA,
  PAIR_BUCKET_LUA,
  RELEASE_LUA,
} from './hotline-match.lua';
import { sortedSetLength, sortedSetRank } from './vendor/jambonz-queue';

/** All hotline keys share the `{hl}` hash tag: one Valkey slot, so every
 * script and pipeline below is cluster-safe (redis-lua-slots.spec.ts). Tests
 * pass their own tagged prefix. */
export const HOTLINE_PREFIX = 'hl:{hl}';

/** One filter bucket: licensed state × qualification × language. */
export const bucketOf = (state: string, practice: string, lang: string) =>
  `${state}~${practice}~${lang}`;

/** Audit 17.11 #6: every attorney on the line is also in his own private
 * bucket, the only queue of a client's «Перезвонить» to him. */
export const callbackBucket = (attorneyId: string) => `cb~${attorneyId}`;

export class HotlineKeys {
  constructor(readonly p: string = HOTLINE_PREFIX) {}
  get lst(): string {
    return `${this.p}:lst`;
  }
  get alive(): string {
    return `${this.p}:alive`;
  }
  get rst(): string {
    return `${this.p}:rst`;
  }
  get off(): string {
    return `${this.p}:off`;
  }
  get rqd(): string {
    return `${this.p}:rqd`;
  }
  get dl(): string {
    return `${this.p}:dl`;
  }
  get rcl(): string {
    return `${this.p}:rcl`;
  }
  /** Open «Адвокат на линии» notices: req → claim expiry. */
  get ntf(): string {
    return `${this.p}:ntf`;
  }
  /** req → "offsetMin,startMin,endMin" (night window, client's clock). */
  get nq(): string {
    return `${this.p}:nq`;
  }
  /** req → notices sent. */
  get natt(): string {
    return `${this.p}:natt`;
  }
  /** Waiting clients' heartbeats: req → expiry (offline entries: the
   * subscription's end). */
  get calive(): string {
    return `${this.p}:calive`;
  }
  /** Connected calls' heartbeats (either side): req → expiry. */
  get conn(): string {
    return `${this.p}:conn`;
  }
  /** Connected calls with a real 1:1 call: req → next sync with it. */
  get callsync(): string {
    return `${this.p}:callsync`;
  }
  /** Paused attorneys: lawyer → until. */
  get pause(): string {
    return `${this.p}:pause`;
  }
  /** Buckets to look at in the next sweep (pair + notify): bucket → due. */
  get dirty(): string {
    return `${this.p}:dirty`;
  }
  /** Counter keys somebody watches: key → expiry. */
  get watch(): string {
    return `${this.p}:watch`;
  }
  /** Last banded counters pushed: key → "lawyers|clients". */
  get cnt(): string {
    return `${this.p}:cnt`;
  }
  /** Every bucket that ever had somebody (admin view). */
  get buckets(): string {
    return `${this.p}:buckets`;
  }
  /** The sweeper's leader lock. */
  get tick(): string {
    return `${this.p}:tick`;
  }
  get lastCounters(): string {
    return `${this.p}:tick:counters`;
  }
  /** Set while the switch is off (the sweeper saw it): the first pass after
   * it syncs the calls before any is closed as lost (audit 17.11 #2). */
  get offSince(): string {
    return `${this.p}:tick:off`;
  }
  /** Online waiters (s / q, not «Сообщите мне»): req → since when (ms), for
   * `hotline.queue_max_wait_sec` (audit 17.11 #8). */
  get qwait(): string {
    return `${this.p}:qwait`;
  }
  bucket = (b: string) => `${this.p}:b:${b}`;
  queue = (b: string) => `${this.p}:q:${b}`;
  /** Attorneys on the line in a bucket (busy too) — the counters. */
  bucketLawyers = (b: string) => `${this.p}:bl:${b}`;
  langLawyers = (l: string) => `${this.p}:ll:${l}`;
  langClients = (l: string) => `${this.p}:lq:${l}`;
  lawyer = (id: string) => `${this.p}:lw:${id}`;
  /** His live line sockets (one per device): socket id → expiry (ms).
   * `hotline:away` from one device takes him off only when no other is
   * left (verify 17.11 H5). */
  lineSocks = (id: string) => `${this.p}:lsk:${id}`;
  /** Trial bookkeeping (first «Ожидать звонки», minutes talked); lives
   * `hotline.trial_memory_days` from the last use. */
  trial = (id: string) => `${this.p}:lwt:${id}`;
  /** The attorney's line choice kept after a dropped socket / lost heartbeat
   * (audit 17.11 #3): `POST /hotline/line/resume` puts him back. */
  saved = (id: string) => `${this.p}:lws:${id}`;
  /** Disclosures this person confirmed («Понятно»): field role|version. */
  ack = (id: string) => `${this.p}:ack:${id}`;
  /** Every «Адвокат на линии» token issued for a request (an older notice
   * works too, audit 17.11 #10). */
  tokens = (req: string) => `${this.p}:tok:${req}`;
  /** One «Взять» opens the call; a second waits for it (audit 17.11 #5). */
  callLock = (req: string) => `${this.p}:clk:${req}`;
  /** «Предложить дело» lock: one case per call (double tap). */
  caseLock = (req: string) => `${this.p}:csk:${req}`;
  request = (id: string) => `${this.p}:rq:${id}`;
  client = (id: string) => `${this.p}:cl:${id}`;
  rate = (id: string, hour: number) => `${this.p}:rl:${id}:${hour}`;
  conflict = (lawyer: string, client: string) =>
    `${this.p}:cf:${lawyer}:${client}`;
  agg = (hour: string) => `${this.p}:agg:${hour}`;
}

type Pair = [string, string];

function pair(raw: unknown): Pair {
  const a = Array.isArray(raw) ? raw : [];
  return [String(a[0] ?? ''), String(a[1] ?? '')];
}

/** Thin, typed wrapper of the matching scripts; no business rules here. */
export class HotlineStore {
  constructor(
    private readonly redis: Redis,
    readonly k: HotlineKeys = new HotlineKeys(),
  ) {}

  private fixed(): string[] {
    const k = this.k;
    return [k.lst, k.alive, k.rst, k.off, k.rqd, k.dl, k.rcl];
  }

  private async run(lua: string, keys: string[], args: (string | number)[]) {
    return this.redis.eval(lua, keys.length, ...keys, ...args.map(String));
  }

  lawyerOn(lw: string, expiry: number, accepting: boolean): Promise<string> {
    return this.run(
      LAWYER_ON_LUA,
      [this.k.lst, this.k.alive],
      [lw, expiry, accepting ? 1 : 0],
    ).then(String);
  }

  async lawyerOff(lw: string): Promise<Pair> {
    return pair(
      await this.run(LAWYER_OFF_LUA, [this.k.lst, this.k.alive], [lw]),
    );
  }

  /** Heartbeat: true while the attorney is still on the line. */
  async touchLawyer(lw: string, expiry: number): Promise<boolean> {
    const n = await this.redis.zadd(this.k.alive, 'XX', 'CH', expiry, lw);
    return Number(n) > 0;
  }

  async lawyerState(lw: string): Promise<string | null> {
    return this.redis.hget(this.k.lst, lw);
  }

  async requestState(req: string): Promise<string | null> {
    return this.redis.hget(this.k.rst, req);
  }

  async cas(lw: string, from: string, to: string): Promise<boolean> {
    return Number(await this.run(CAS_LUA, [this.k.lst], [lw, from, to])) === 1;
  }

  async free(
    lw: string,
    buckets: string[],
    now: number,
    deadline: number,
    idleScore: number,
  ): Promise<Pair> {
    const keys = [
      ...this.fixed(),
      ...buckets.map(this.k.bucket),
      ...buckets.map(this.k.queue),
    ];
    return pair(
      await this.run(FREE_LAWYER_LUA, keys, [
        lw,
        now,
        deadline,
        buckets.length,
        idleScore,
      ]),
    );
  }

  async match(
    req: string,
    buckets: string[],
    now: number,
    deadline: number,
    created: number,
    maxQueue: number,
  ): Promise<Pair> {
    const keys = [
      ...this.fixed(),
      ...buckets.map(this.k.bucket),
      ...buckets.map(this.k.queue),
    ];
    return pair(
      await this.run(MATCH_REQUEST_LUA, keys, [
        req,
        now,
        deadline,
        buckets.length,
        created,
        maxQueue,
      ]),
    );
  }

  /** Batch pairing of one bucket; returns [req, lawyer] pairs. */
  async pairBucket(
    bucket: string,
    now: number,
    deadline: number,
    limit: number,
  ): Promise<Pair[]> {
    const raw = (await this.run(
      PAIR_BUCKET_LUA,
      [...this.fixed(), this.k.bucket(bucket), this.k.queue(bucket)],
      [now, deadline, limit],
    )) as string[];
    const out: Pair[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) out.push([raw[i], raw[i + 1]]);
    return out;
  }

  async accept(req: string, lw: string, now: number): Promise<string> {
    return String(
      await this.run(
        ACCEPT_LUA,
        [this.k.lst, this.k.rst, this.k.dl],
        [req, lw, now],
      ),
    );
  }

  async release(
    req: string,
    lw: string,
    mode: 'declined' | 'timeout' | 'conflict' | 'offline',
    rqdExpiry: number,
  ): Promise<string> {
    return String(
      await this.run(
        RELEASE_LUA,
        [this.k.lst, this.k.rst, this.k.dl, this.k.rqd],
        [req, lw, mode, rqdExpiry],
      ),
    );
  }

  async endCall(req: string, lw: string, next: 'i' | 'n' | 'x') {
    return String(
      await this.run(END_CALL_LUA, [this.k.lst, this.k.rst], [req, lw, next]),
    );
  }

  async cancel(req: string, buckets: string[]): Promise<Pair> {
    const k = this.k;
    return pair(
      await this.run(
        CANCEL_LUA,
        [k.lst, k.rst, k.dl, k.off, k.ntf, ...buckets.map(k.queue)],
        [req, buckets.length],
      ),
    );
  }

  async goOffline(req: string): Promise<boolean> {
    return (
      Number(
        await this.run(GO_OFFLINE_LUA, [this.k.rst, this.k.off], [req]),
      ) === 1
    );
  }

  async claim(req: string): Promise<boolean> {
    return (
      Number(
        await this.run(CLAIM_LUA, [this.k.rst, this.k.off, this.k.ntf], [req]),
      ) === 1
    );
  }

  async isOffline(req: string): Promise<boolean> {
    return (await this.redis.sismember(this.k.off, req)) === 1;
  }

  async notifyPick(
    bucket: string,
    now: number,
    pct: number,
    claimExpiry: number,
    budget: number,
  ): Promise<{ free: number; outstanding: number; picked: string[] }> {
    const k = this.k;
    const raw = (await this.run(
      NOTIFY_PICK_LUA,
      [
        k.lst,
        k.alive,
        k.rst,
        k.off,
        k.ntf,
        k.nq,
        k.natt,
        k.bucket(bucket),
        k.queue(bucket),
      ],
      [now, pct, claimExpiry, budget],
    )) as (string | number)[];
    return {
      free: Number(raw[0] ?? 0),
      outstanding: Number(raw[1] ?? 0),
      picked: raw.slice(2).map(String),
    };
  }

  /** jambonz pattern: the queue's length and a member's place (0-based). */
  queueLength(bucket: string): Promise<number> {
    return sortedSetLength(this.redis, this.k.queue(bucket));
  }

  queueRank(bucket: string, req: string): Promise<number | null> {
    return sortedSetRank(this.redis, this.k.queue(bucket), req);
  }

  /** Cleanup after a reservation: the attorney leaves his other buckets,
   * the request its other queues (the scripts already skip them by state). */
  async dropLawyerFromBuckets(lw: string, buckets: string[]): Promise<void> {
    if (buckets.length === 0) return;
    const p = pipeline(this.redis);
    for (const b of buckets) p.zrem(this.k.bucket(b), lw);
    await p.exec();
  }

  async dropRequestFromQueues(req: string, buckets: string[]): Promise<void> {
    if (buckets.length === 0) return;
    const p = pipeline(this.redis);
    for (const b of buckets) p.zrem(this.k.queue(b), req);
    await p.exec();
  }

  /** Counters membership of an attorney (busy ones count as «на линии»). */
  async setLawyerMembership(
    lw: string,
    add: { buckets: string[]; langs: string[] },
    remove: { buckets: string[]; langs: string[] },
  ): Promise<void> {
    const p = pipeline(this.redis);
    for (const b of remove.buckets) {
      p.srem(this.k.bucketLawyers(b), lw);
      p.zrem(this.k.bucket(b), lw);
    }
    for (const l of remove.langs) p.srem(this.k.langLawyers(l), lw);
    for (const b of add.buckets) {
      p.sadd(this.k.bucketLawyers(b), lw);
      // a private «Перезвонить» queue is not a filter the admin lists
      if (!b.startsWith('cb~')) p.sadd(this.k.buckets, b);
    }
    for (const l of add.langs) p.sadd(this.k.langLawyers(l), lw);
    await p.exec();
  }

  async setClientLangs(req: string, langs: string[], on: boolean) {
    if (langs.length === 0) return;
    const p = pipeline(this.redis);
    for (const l of langs) {
      if (on) p.sadd(this.k.langClients(l), req);
      else p.srem(this.k.langClients(l), req);
    }
    await p.exec();
  }
}
