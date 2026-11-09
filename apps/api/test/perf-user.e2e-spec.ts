import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { queryTap, type TappedQuery } from '../src/prisma/query-tap';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import {
  judgeCost,
  planCost,
  seqScans,
  inflateStatisticsSql,
  paramLiterals,
  type PlanNode,
} from '../src/common/perf/query-plan-judge';

/**
 * Perf guard of the USER-FACING API (owner 2026-11-08: «as users and data
 * grow, the admin, the website and the app must not fall over or slow
 * down»). The admin twin is perf-admin.e2e-spec.ts; this one covers what the
 * app and the web call on every screen: feed, reels, stories, profiles,
 * posts and comments, chats and messages, groups and channels,
 * notifications, search, cases and bids, contacts sync, calls, uploads.
 *
 * Runs only with PERF_USER=1 against a database filled by the repo
 * generators (scripts/ops/admin-load-gen.sql, user-load-gen.sql,
 * social-load-gen.sql, loadtest/sql/loadtest-extra.sql,
 * loadtest/local-docker/licenses.sql; apps/api/scripts/perf-user-seed.sh).
 * For every endpoint it
 *  1. calls it PERF_ROUNDS times (after one cold call) and takes p95;
 *  2. records every SQL statement the request sent (Prisma query events,
 *     src/prisma/query-tap.ts) and fails on N+1: the same statement more
 *     than PERF_N1_MAX times in one request;
 *  3. EXPLAINs every recorded statement with its real parameters, with the
 *     planner statistics of every seeded table multiplied by
 *     PERF_INFLATE (default 100 and 1000: 100 000 seeded people look like
 *     10 M and 100 M people, 1 M messages like 100 M and 1 B), inside one
 *     transaction that is rolled back. Fails when a plan reads a big table
 *     (≥ 1 M rows after inflation) in sequence, or when its cost grows
 *     with the data (over PERF_COST_MAX at the biggest factor and more than
 *     twice its cost at the smallest: the page touches a share of a
 *     table, not a bounded number of rows), or is over PERF_COST_HARD_MAX
 *     at any size. `SELECT set_config(..)` sent before a statement in the
 *     same transaction is replayed before its EXPLAIN.
 * Fails when any endpoint's p95 is over PERF_BUDGET_MS (300).
 *
 *   PERF_USER=1 E2E_DATABASE_URL=postgresql://root:lawbid@localhost:5432/lawbid_perf \
 *     npx jest --config test/jest-perf-user.json --forceExit
 * PERF_OUT=<file.json> writes the full result (plans' problems, timings).
 */
const RUN = process.env.PERF_USER === '1';
/**
 * The perf client's User-Agent, unique to the run. Only requests carrying
 * it skip the rate limits (the global one and a route's own @Throttle:
 * search, tags, ice-servers allow 30/min and this suite makes 43 calls per
 * endpoint in under a minute). @nestjs/throttler's `ignoreUserAgents`,
 * fed from THROTTLE_IGNORE_USER_AGENT (src/throttler/throttle-limits.ts);
 * every other caller keeps every limit, so a 429 here is a real finding.
 */
const PERF_UA = `lawbid-perf-guard/${randomUUID()}`;
// Must be set before AppModule builds PrismaService / ThrottlerModule.
if (RUN) {
  process.env.PRISMA_QUERY_TAP = '1';
  process.env.THROTTLE_IGNORE_USER_AGENT = PERF_UA;
  // Reels are measured with the dev fake Bunny (no network): the flag
  // and the keys are what turns the route on, the SQL is the real one.
  process.env.DEV_FAKE_BUNNY = 'true';
  // Like the production API containers: background jobs run in the worker
  // (infra/modules/ecs), so their SQL never mixes with the requests'.
  process.env.JOBS_ENABLED = 'false';
}
// 40 warm calls: p95 is then the 2nd slowest, not the single slowest (one
// garbage-collection pause on a shared CI runner is not a slow endpoint).
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 40);
/** Uncached calls per endpoint (every app cache in Redis emptied before
 * each): what a page costs when its cache entry expired or was never
 * built. The median of them must stay under PERF_COLD_BUDGET_MS. */
const COLD_ROUNDS = Number(process.env.PERF_COLD_ROUNDS ?? 3);
const COLD_BUDGET_MS = Number(process.env.PERF_COLD_BUDGET_MS ?? 300);
const BUDGET_MS = Number(process.env.PERF_BUDGET_MS ?? 300);
const N1_MAX = Number(process.env.PERF_N1_MAX ?? 5);
const COST_MAX = Number(process.env.PERF_COST_MAX ?? 100_000);
const COST_HARD_MAX = Number(process.env.PERF_COST_HARD_MAX ?? 1_000_000);
const INFLATE = (process.env.PERF_INFLATE ?? '100,1000')
  .split(',')
  .map(Number)
  .filter((n) => n >= 1);
jest.setTimeout(30 * 60_000);

/**
 * Known plan problems that wait for an owner decision (printed, not
 * failed). Each names the statement it covers and where the decision is
 * written down; nothing else is ever waived.
 */
const WAIVERS: { sql: RegExp; problem: RegExp; why: string }[] = [
  {
    // People / attorney search by name, the typo ("loose") branches: with
    // 10M+ people the planner overrates how many names a typo arm matches
    // and picks a sequential scan that stops after NAME_SCAN_CAP matches;
    // for a typo nobody matches that reads every person. The built answer
    // at that size is the OpenSearch engine behind the search switch
    // (src/modules/search/engine). docs/perf/USER_API_PERF_GUARD_2026-11-08.md
    // «Needs owner decision».
    sql: /att_loose AS MATERIALIZED/,
    problem: /^(Seq Scan on users|plan cost)/,
    why: 'name search typo branch at 10M+ people: OpenSearch switch (owner decision)',
  },
];

type Actor = 'client' | 'attorney' | 'member' | 'subscriber' | 'bidder';
interface Endpoint {
  label: string;
  method?: 'get' | 'post';
  path: string;
  as: Actor;
  body?: () => object;
}

interface Fx {
  client: string;
  attorney: string;
  attorneyUsername: string;
  /** An attorney with a v4-shaped id (the /attorneys/:id routes validate it). */
  author: string;
  conversation: string;
  post: string;
  comment: string;
  caseId: string;
  bid: string;
  bidder: string;
  bidCase: string;
  member: string;
  group: string;
  subscriber: string;
  channel: string;
  tag: string;
}

// A v4-shaped id: the strict id validators of some routes reject the plain
// md5 ids of the older generators (loadtest/sql/loadtest-extra.sql).
const V4 = `~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]'`;

/**
 * The fixtures are the same rows in every run. loadtest-extra.sql gives
 * chats, posts, cases and bids RANDOM v4 ids (gen_random_uuid()), so
 * `ORDER BY id` picked a different attorney, post and case each run: on
 * 2026-11-09 one run measured a pending attorney (search cases returned
 * nothing, 1 statement) and another a verified one (22 statements), and
 * the case feed's plan costs moved with the attorney. People keep their
 * md5 ids from the generators, so every pick below orders by the people
 * involved (and created_at / title, which the generators derive from
 * their counters), never by a random id.
 */
async function fixtures(db: PrismaClient): Promise<Fx> {
  const one = async (sql: string): Promise<Record<string, string>> => {
    const rows = await db.$queryRawUnsafe<Record<string, string>[]>(sql);
    if (!rows[0]) throw new Error(`perf-user: no fixture for ${sql}`);
    return rows[0];
  };
  // A verified attorney: an unverified one may not search or see the
  // case feed (both return nothing), so nothing would be measured.
  const conv = await one(`
    SELECT c.id::text, c.attorney_id::text, c.client_id::text, ap.username
    FROM conversations c JOIN attorney_profiles ap ON ap.user_id = c.attorney_id
    WHERE c.id::text ${V4} AND c.last_message_id IS NOT NULL
      AND ap.verification_status = 'verified'
      AND EXISTS (SELECT 1 FROM calls k WHERE k.conversation_id = c.id)
    ORDER BY c.attorney_id, c.client_id, c.created_at LIMIT 1`);
  const author = await one(`
    SELECT ap.user_id::text FROM attorney_profiles ap
    WHERE ap.user_id::text ${V4} AND EXISTS (SELECT 1 FROM posts p WHERE p.author_id = ap.user_id)
    ORDER BY ap.user_id LIMIT 1`);
  const post = await one(`
    SELECT p.id::text FROM posts p WHERE p.id::text ${V4} AND p.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id)
    ORDER BY p.author_id, p.created_at LIMIT 1`);
  const comment = await one(`
    SELECT parent_comment_id::text AS id FROM comments
    WHERE parent_comment_id IS NOT NULL AND parent_comment_id::text ${V4}
    ORDER BY parent_comment_id LIMIT 1`);
  const kase = await one(`
    SELECT c.id::text, c.client_id::text FROM cases c
    WHERE c.id::text ${V4} AND EXISTS (SELECT 1 FROM bids b WHERE b.case_id = c.id)
    ORDER BY c.client_id, c.created_at, c.title LIMIT 1`);
  const bid = await one(`
    SELECT b.id::text, b.attorney_id::text, b.case_id::text
    FROM bids b JOIN cases c ON c.id = b.case_id
    WHERE b.id::text ${V4} AND b.case_id::text ${V4}
    ORDER BY b.attorney_id, c.client_id, c.created_at, c.title LIMIT 1`);
  const group = await one(`
    SELECT m.group_id::text, m.user_id::text FROM chat_group_members m
    WHERE m.left_at IS NULL ORDER BY m.group_id LIMIT 1`);
  const channel = await one(`
    SELECT s.channel_id::text, s.user_id::text FROM channel_subscriptions s
    ORDER BY s.channel_id LIMIT 1`);
  return {
    client: kase.client_id,
    attorney: conv.attorney_id,
    attorneyUsername: conv.username,
    author: author.user_id,
    conversation: conv.id,
    post: post.id,
    comment: comment.id,
    caseId: kase.id,
    bid: bid.id,
    bidder: bid.attorney_id,
    bidCase: bid.case_id,
    member: group.user_id,
    group: group.group_id,
    subscriber: channel.user_id,
    channel: channel.channel_id,
    tag: 'perftag1',
  };
}

function endpoints(f: Fx): Endpoint[] {
  const sha = () => randomUUID().replace(/-/g, '').padEnd(64, '0');
  return [
    // feed, reels, stories
    { label: 'feed', path: '/feed', as: 'client' },
    { label: 'reels', path: '/reels', as: 'client' },
    { label: 'stories tray', path: '/stories/tray', as: 'client' },
    {
      label: 'attorney suggestions',
      path: '/suggestions/attorneys',
      as: 'client',
    },
    // profile
    { label: 'me', path: '/users/me', as: 'client' },
    { label: 'me (attorney)', path: '/users/me', as: 'attorney' },
    {
      label: 'attorney profile',
      path: `/attorneys/${f.attorneyUsername}`,
      as: 'client',
    },
    {
      label: 'attorney posts',
      path: `/attorneys/${f.author}/posts`,
      as: 'client',
    },
    {
      label: 'attorney reviews summary',
      path: `/attorneys/${f.author}/reviews/summary`,
      as: 'client',
    },
    {
      label: 'attorney followers',
      path: `/attorneys/${f.author}/followers`,
      as: 'client',
    },
    // posts and comments
    { label: 'post', path: `/posts/${f.post}`, as: 'client' },
    { label: 'post comments', path: `/posts/${f.post}/comments`, as: 'client' },
    {
      label: 'comment replies',
      path: `/comments/${f.comment}/replies`,
      as: 'client',
    },
    { label: 'post likes', path: `/posts/${f.post}/likes`, as: 'client' },
    { label: 'tag posts', path: `/tags/${f.tag}/posts`, as: 'client' },
    { label: 'saved posts', path: '/saved-items/posts', as: 'client' },
    // chats
    { label: 'chats list', path: '/conversations', as: 'attorney' },
    { label: 'chat', path: `/conversations/${f.conversation}`, as: 'attorney' },
    {
      label: 'chat messages page',
      path: `/conversations/${f.conversation}/messages`,
      as: 'attorney',
    },
    {
      label: 'chat pins',
      path: `/conversations/${f.conversation}/pins`,
      as: 'attorney',
    },
    // groups and channels
    { label: 'groups list', path: '/groups', as: 'member' },
    { label: 'group', path: `/groups/${f.group}`, as: 'member' },
    {
      label: 'group messages page',
      path: `/groups/${f.group}/messages`,
      as: 'member',
    },
    { label: 'groups discover', path: '/groups/discover', as: 'member' },
    { label: 'channels list', path: '/channels', as: 'subscriber' },
    {
      label: 'channel posts',
      path: `/channels/${f.channel}/posts`,
      as: 'subscriber',
    },
    // notifications
    { label: 'notifications', path: '/notifications', as: 'client' },
    // search
    // Surnames, as people type them. The seed has only 12 first names, so
    // "sofia" matches 8 % of everyone and a LIMITed full scan is then the
    // planner's right answer; real names are a long tail.
    {
      label: 'search people',
      path: '/search/people?q=whitfield31',
      as: 'client',
    },
    { label: 'search posts', path: '/search/posts?q=landlord', as: 'client' },
    { label: 'search cases', path: '/search/cases?q=landlord', as: 'attorney' },
    {
      label: 'search attorneys',
      path: '/search/attorneys?q=goodman47',
      as: 'client',
    },
    { label: 'search suggest', path: '/search/suggest?q=vis', as: 'client' },
    // cases and bids
    { label: 'cases feed (attorney)', path: '/cases', as: 'attorney' },
    {
      label: 'case detail (attorney)',
      path: `/cases/${f.bidCase}`,
      as: 'bidder',
    },
    {
      label: 'case detail (owner)',
      path: `/users/me/cases/${f.caseId}`,
      as: 'client',
    },
    { label: 'case bids', path: `/cases/${f.caseId}/bids`, as: 'client' },
    {
      label: 'case comments',
      path: `/cases/${f.caseId}/comments`,
      as: 'client',
    },
    { label: 'my cases', path: '/users/me/cases', as: 'client' },
    { label: 'my bids', path: '/users/me/bids', as: 'attorney' },
    { label: 'bid', path: `/bids/${f.bid}`, as: 'bidder' },
    // contacts
    { label: 'contacts sync (read)', path: '/contacts/sync', as: 'client' },
    {
      label: 'contacts sync (upload 500)',
      method: 'post',
      path: '/contacts/sync',
      as: 'client',
      body: () => ({
        full: true,
        hashes: Array.from({ length: 500 }, (_, i) =>
          sha().slice(0, 56).concat(String(i).padStart(8, '0')),
        ),
      }),
    },
    // calls
    { label: 'call history', path: '/calls/history', as: 'attorney' },
    { label: 'ongoing calls', path: '/calls/ongoing', as: 'attorney' },
    { label: 'ice servers', path: '/calls/ice-servers', as: 'attorney' },
    // uploads
    {
      label: 'upload presign',
      method: 'post',
      path: '/files/presign',
      as: 'client',
      body: () => ({
        purpose: 'chat_attachment',
        mime: 'image/jpeg',
        sizeBytes: 250_000,
        sha256: sha(),
      }),
    },
  ];
}

interface Result {
  label: string;
  path: string;
  status: number;
  cold: number;
  /** The slowest statements of the slowest uncached call (ms, SQL). */
  coldSql: string[];
  p50: number;
  p95: number;
  max: number;
  queries: number;
  problems: string[];
}

(RUN ? describe : describe.skip)('User-facing API on a big database', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let raw: PrismaClient;
  let tokens: TokenService;
  let base = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    // A plain client for fixtures and EXPLAIN: not tapped, no extensions.
    raw = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await raw?.$disconnect();
    await app?.close();
  });

  const pct = (xs: number[], p: number) =>
    [...xs].sort((a, b) => a - b)[
      Math.min(xs.length - 1, Math.floor(xs.length * p))
    ];

  it('hot endpoints stay fast and index-only at 10M/100M rows', async () => {
    // Rate limits and the per-user search budget would throttle the run.
    for (const key of [
      'rate_limit.search_per_minute',
      'rate_limit.contacts_sync_per_hour',
    ]) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: 1_000_000 },
        update: { value: 1_000_000 },
      });
    }
    const redis = app.get<Redis>(REDIS_CLIENT);
    // The e2e Redis DB (1..15, never the dev DB 0): no cache of an earlier
    // run may hide an endpoint's SQL.
    await redis.flushdb();
    // Screens that are switched off today are measured as if they were on.
    for (const key of ['stories', 'video_posts']) {
      await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabled: true },
        update: { enabled: true },
      });
    }
    await app.get(FeatureFlagsService).invalidate();

    const f = await fixtures(raw);
    const roles: Record<string, 'client' | 'attorney'> = {};
    for (const r of await raw.$queryRawUnsafe<{ id: string; role: string }[]>(
      `SELECT id::text, role::text FROM users WHERE id = ANY($1::uuid[])`,
      [f.client, f.attorney, f.member, f.subscriber, f.bidder],
    )) {
      roles[r.id] = r.role === 'attorney' ? 'attorney' : 'client';
    }
    const auth = (id: string) => ({
      'User-Agent': PERF_UA,
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: id,
        role: roles[id] ?? 'client',
        sid: randomUUID(),
        verified: roles[id] === 'attorney',
        subscriptionStatus: roles[id] === 'attorney' ? 'active' : 'none',
      })}`,
    });
    const actors: Record<Actor, Record<string, string>> = {
      client: auth(f.client),
      attorney: auth(f.attorney),
      member: auth(f.member),
      subscriber: auth(f.subscriber),
      bidder: auth(f.bidder),
    };

    // Background jobs (outbox, schedulers) share the client: whatever they
    // send while no request runs is learnt here and not blamed on endpoints.
    const background = new Set<string>();
    let sink: TappedQuery[] | null = null;
    const off = queryTap.on((q) => {
      if (sink) sink.push(q);
      else background.add(q.query);
    });
    await new Promise((r) => setTimeout(r, 3000));
    // Warm the process itself (module code, the Prisma engine, the pool):
    // "uncached" means no app cache, not a process that just started.
    for (let k = 0; k < 5; k++) {
      await request(base).get('/api/v1/users/me').set(actors.client);
      await request(base).get('/api/v1/feed').set(actors.client);
    }

    const results: Result[] = [];
    // statement text -> first params seen, and the endpoints that sent it
    const statements = new Map<
      string,
      { params: string; labels: Set<string>; prelude: TappedQuery[] }
    >();
    for (const ep of endpoints(f)) {
      if (process.env.PERF_ONLY && !ep.label.includes(process.env.PERF_ONLY))
        continue;
      const times: number[] = [];
      // statement -> the rounds it was sent in (see the attribution below)
      const rounds = new Map<
        string,
        { params: string; rounds: Set<number>; prelude: TappedQuery[] }
      >();
      let status = 0;
      // every status that was not a success, with the first body seen
      const badStatuses = new Map<number, string>();
      const colds: number[] = [];
      let coldSql: string[] = [];
      let maxQueries = 0;
      const problems: string[] = [];
      const n1 = new Map<string, number[]>();
      const total = COLD_ROUNDS + ROUNDS;
      for (let i = 0; i < total; i++) {
        const isCold = i < COLD_ROUNDS;
        if (isCold) await redis.flushdb();
        const seen: TappedQuery[] = [];
        sink = seen;
        const t0 = process.hrtime.bigint();
        const req =
          ep.method === 'post'
            ? request(base)
                .post(`/api/v1${ep.path}`)
                .send(ep.body?.() ?? {})
            : request(base).get(`/api/v1${ep.path}`);
        const res = await req.set(actors[ep.as]);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        // late events of this request (the engine reports after the reply)
        await new Promise((r) => setImmediate(r));
        sink = null;
        status = res.status;
        if (isCold) {
          if (ms > Math.max(0, ...colds))
            coldSql = [...seen]
              .sort((a, b) => b.durationMs - a.durationMs)
              .slice(0, 3)
              .map(
                (q) =>
                  `${q.durationMs} ms ${q.query.replace(/\s+/g, ' ').slice(0, 140)}`,
              );
          colds.push(ms);
        } else times.push(ms);
        const mine = seen.filter((q) => !background.has(q.query));
        maxQueries = Math.max(maxQueries, mine.length);
        const repeats = new Map<string, number>();
        // `SELECT set_config(..., true)` before a statement in the same
        // transaction (search: statement_timeout, the trigram threshold,
        // planner settings) is replayed before its EXPLAIN.
        let prelude: TappedQuery[] = [];
        for (const q of mine) {
          if (/^\s*SELECT set_config\(/i.test(q.query)) {
            prelude.push(q);
            continue;
          }
          repeats.set(q.query, (repeats.get(q.query) ?? 0) + 1);
          const r = rounds.get(q.query);
          if (r) r.rounds.add(i);
          else
            rounds.set(q.query, {
              params: q.params,
              rounds: new Set([i]),
              prelude,
            });
          prelude = [];
        }
        for (const [sql, n] of repeats) {
          if (n > N1_MAX) n1.set(sql, [...(n1.get(sql) ?? []), n]);
        }
        // Any call that is not a success (a 429 from a limiter, a 500) was
        // not measured: its timing and SQL are not the endpoint's.
        if ((status < 200 || status >= 300) && !badStatuses.has(status)) {
          badStatuses.set(status, JSON.stringify(res.body).slice(0, 200));
        }
      }
      for (const [code, body] of badStatuses) {
        problems.push(`status ${code}: ${body}`);
      }
      // A statement belongs to the endpoint when the cold call sent it, or
      // when two or more calls did; one stray statement in one warm call is
      // a background job (billing snapshot, outbox) sharing the client.
      for (const [sql, r] of rounds) {
        if (![...r.rounds].some((k) => k < COLD_ROUNDS) && r.rounds.size < 2)
          continue;
        const s = statements.get(sql);
        if (s) s.labels.add(ep.label);
        else
          statements.set(sql, {
            params: r.params,
            labels: new Set([ep.label]),
            prelude: r.prelude,
          });
      }
      // N+1 is a property of the endpoint: the same statement repeated in
      // two or more of its calls (one burst in one call is a timer).
      for (const [sql, ns] of n1) {
        if (ns.length >= 2)
          problems.push(
            `N+1: one statement ${Math.max(...ns)}× in one request: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`,
          );
      }
      const cold = pct(colds, 0.5);
      if (cold > COLD_BUDGET_MS)
        problems.push(
          `uncached ${cold.toFixed(1)} ms > ${COLD_BUDGET_MS} ms (slowest SQL: ${coldSql.join(' | ')})`,
        );
      const p95 = pct(times, 0.95);
      if (p95 > BUDGET_MS)
        problems.push(`p95 ${p95.toFixed(1)} ms > ${BUDGET_MS} ms`);
      results.push({
        label: ep.label,
        path: ep.path,
        status,
        cold,
        coldSql,
        p50: pct(times, 0.5),
        p95,
        max: Math.max(...times),
        queries: maxQueries,
        problems,
      });
    }
    off();

    // EXPLAIN every statement at 10M / 100M rows (statistics inflated inside
    // a transaction that is rolled back: nothing is left behind).
    const planProblems = new Map<string, Set<string>>();
    const planDetail: { problem: string; sql: string; params: string }[] = [];
    const unexplained: string[] = [];
    // statement -> plan cost at each inflation factor
    const costs = new Map<string, Map<number, number>>();
    const waived: string[] = [];
    const flag = (sql: string, problem: string) => {
      const s = statements.get(sql);
      if (!s) return;
      const w = WAIVERS.find((x) => x.sql.test(sql) && x.problem.test(problem));
      if (w) {
        const note = `${[...s.labels].join(', ')}: ${problem} (waived: ${w.why})`;
        if (!waived.includes(note)) waived.push(note);
        return;
      }
      const msg = `${problem}: ${sql.replace(/\s+/g, ' ').slice(0, 220)}`;
      planDetail.push({ problem: msg, sql, params: s.params });
      for (const l of s.labels) {
        const set = planProblems.get(l) ?? new Set<string>();
        set.add(msg);
        planProblems.set(l, set);
      }
    };
    for (const factor of INFLATE) {
      await raw
        .$transaction(
          async (tx) => {
            for (const sql of inflateStatisticsSql(factor))
              await tx.$executeRawUnsafe(sql);
            const big = new Set(
              (
                await tx.$queryRawUnsafe<{ relname: string }[]>(
                  `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.reltuples >= 1000000`,
                )
              ).map((r) => r.relname),
            );
            let i = 0;
            for (const [sql, s] of statements) {
              if (!/^\s*(SELECT|WITH)\b/i.test(sql)) continue;
              i += 1;
              const name = `perf_q_${factor}_${i}`;
              await tx.$executeRawUnsafe(`SAVEPOINT perf_sp`);
              try {
                for (const [k, pre] of s.prelude.entries()) {
                  await tx.$executeRawUnsafe(
                    `PREPARE ${name}_p${k} AS ${pre.query}`,
                  );
                  await tx.$executeRawUnsafe(
                    `EXECUTE ${name}_p${k}${args(paramLiterals(pre.params))}`,
                  );
                }
                await tx.$executeRawUnsafe(`PREPARE ${name} AS ${sql}`);
                const out = await tx.$queryRawUnsafe<
                  { 'QUERY PLAN': { Plan: PlanNode }[] }[]
                >(
                  `EXPLAIN (FORMAT JSON) EXECUTE ${name}${args(paramLiterals(s.params))}`,
                );
                // back to the savepoint either way: the prelude's settings
                // must not leak into the next statement's plan
                await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT perf_sp`);
                const plan = out[0]['QUERY PLAN'][0].Plan;
                for (const p of seqScans(plan, big))
                  flag(sql, `${p} @×${factor}`);
                const c = costs.get(sql) ?? new Map<number, number>();
                c.set(factor, planCost(plan));
                costs.set(sql, c);
              } catch (e) {
                await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT perf_sp`);
                if (factor === INFLATE[0])
                  unexplained.push(
                    `${(e as Error).message.split('\n').pop()?.slice(0, 160)} :: ${sql.slice(0, 160)}`,
                  );
              }
            }
            // Roll the inflated statistics back.
            throw new RollbackSignal();
          },
          { timeout: 10 * 60_000, maxWait: 60_000 },
        )
        .catch((e: unknown) => {
          if (!(e instanceof RollbackSignal)) throw e;
        });
    }
    for (const [sql, c] of costs) {
      for (const p of judgeCost(c, COST_MAX, COST_HARD_MAX)) flag(sql, p);
    }
    for (const r of results) {
      for (const p of planProblems.get(r.label) ?? []) r.problems.push(p);
    }

    const f1 = (n: number) => n.toFixed(1);
    const rows = [
      '| endpoint | status | uncached ms | p50 | p95 | max | SQL/req | problems |',
      '|---|---|---|---|---|---|---|---|',
      ...results.map(
        (r) =>
          `| ${r.label} \`${r.path.replace(/[0-9a-f-]{36}/g, ':id')}\` | ${r.status} | ${f1(r.cold)} | ${f1(r.p50)} | ${f1(r.p95)} | ${f1(r.max)} | ${r.queries} | ${r.problems.length ? r.problems.join('<br>') : 'ok'} |`,
      ),
    ];
    console.log(`\n${rows.join('\n')}\n`);
    if (waived.length)
      console.log(
        `waived, waiting for the owner (${waived.length}):\n${waived.join('\n')}`,
      );
    if (unexplained.length)
      console.log(
        `statements that could not be EXPLAINed (${unexplained.length}):\n${unexplained.join('\n')}`,
      );
    if (process.env.PERF_OUT) {
      writeFileSync(
        process.env.PERF_OUT,
        JSON.stringify(
          {
            results,
            planDetail,
            waived,
            unexplained,
            statements: statements.size,
            costs: [...costs].map(([sql, c]) => ({
              labels: [...(statements.get(sql)?.labels ?? [])],
              sql: sql.replace(/\s+/g, ' ').slice(0, 160),
              cost: Object.fromEntries(c),
            })),
          },
          null,
          1,
        ),
      );
    }
    const failed = results.filter((r) => r.problems.length);
    expect(failed.map((r) => `${r.label}: ${r.problems.join(' | ')}`)).toEqual(
      [],
    );
  });
});

class RollbackSignal extends Error {}

const args = (list: string) => (list ? `(${list})` : '');
