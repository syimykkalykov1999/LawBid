import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { shardContext } from '../src/sharding/shard-context';
import {
  ClientActivityService,
  RESPONSE_MIN_SAMPLES,
  RESPONSE_WINDOW_DAYS,
  responseSamplesSql,
} from '../src/modules/cases/services/client-activity.service';

/**
 * Row 71 (1B load test 2026-11-13): the «Отвечает за день» samples query was
 * rewritten (correlated MIN -> LEFT JOIN LATERAL .. LIMIT 1) for speed. This
 * suite proves the output did not change: random case chats (runs of
 * attorney messages, system messages without a sender, deleted messages,
 * equal timestamps, messages older than the window, unanswered questions)
 * go through the OLD query, copied here verbatim from main bf1c12ad7, and
 * through the new one; every sample row and the final verdict per client
 * must be the same.
 */
jest.setTimeout(180_000);

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

/** The samples CTE body as it was on main bf1c12ad7 (the reference). */
function oldSamplesSql(ids: string[], since: Date) {
  return Prisma.sql`
        SELECT cv.client_id,
               EXTRACT(EPOCH FROM (
                 (SELECT MIN(r.created_at) FROM messages r
                   WHERE r.conversation_id = m.conversation_id
                     AND r.sender_id = cv.client_id
                     AND r.created_at > m.created_at AND r.deleted_at IS NULL)
                 - m.created_at)) AS secs,
               m.created_at AS asked_at
        FROM conversations cv
        JOIN messages m ON m.conversation_id = cv.id
                       AND m.sender_id = cv.attorney_id
        WHERE cv.client_id = ANY(${ids}::UUID[]) AND cv.case_id IS NOT NULL
          AND m.created_at > ${since} AND m.deleted_at IS NULL
          AND COALESCE((SELECT p.sender_id FROM messages p
                         WHERE p.conversation_id = m.conversation_id
                           AND p.created_at < m.created_at
                         ORDER BY p.created_at DESC LIMIT 1),
                       cv.client_id) <> cv.attorney_id
        UNION ALL
        SELECT c.client_id,
               EXTRACT(EPOCH FROM (
                 LEAST(
                   (SELECT MIN(o.created_at) FROM bid_offers o
                     WHERE o.bid_id = b.id AND o.from_role = 'client'),
                   CASE WHEN b.status IN ('accepted', 'rejected_by_client')
                        THEN b.updated_at END)
                 - b.created_at)) AS secs,
               b.created_at AS asked_at
        FROM bids b JOIN cases c ON c.id = b.case_id
        WHERE c.client_id = ANY(${ids}::UUID[])
          AND b.created_at > ${since}
          AND b.status IN ('active', 'accepted', 'rejected_by_client',
                           'failed_negotiation')`;
}

function verdictSql(samples: Prisma.Sql, day: Date) {
  return Prisma.sql`
      WITH samples AS (${samples}),
      timed AS (
        SELECT client_id,
               CASE WHEN secs IS NOT NULL THEN secs
                    WHEN asked_at < ${day} THEN 1e12 END AS secs
        FROM samples
      )
      SELECT client_id::TEXT AS client_id FROM timed
      WHERE secs IS NOT NULL
      GROUP BY client_id
      HAVING COUNT(*) >= ${RESPONSE_MIN_SAMPLES}
         AND percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) <= 86400`;
}

/** mulberry32: a fixed seed keeps the data the same on every run. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Client activity samples: the LATERAL rewrite returns what the old query did (row 71)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: ClientActivityService;
  let leafId = '';
  const clientIds: string[] = [];
  const caseIds: string[] = [];
  /** Two-database mode: the case family lives on the shard database; the
   * feed reads it in the request's shard context, so do the same here. */
  const inShard = <T>(fn: () => Promise<T>): Promise<T> =>
    shardContext.runForCase(caseIds[0], fn);
  const now = new Date();
  const since = new Date(now.getTime() - RESPONSE_WINDOW_DAYS * DAY);
  const day = new Date(now.getTime() - DAY);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(ClientActivityService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_resp_cat' },
      create: {
        code: 'e2e_resp_cat',
        name_en: 'Resp cat',
        i18n_key: 'practice.e2e_resp_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_resp_cat.leaf' },
      create: {
        code: 'e2e_resp_cat.leaf',
        parent_id: cat.id,
        name_en: 'Resp leaf',
        i18n_key: 'practice.e2e_resp_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;

    const rnd = prng(71);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
    for (let c = 0; c < 40; c += 1) {
      const client = await prisma.user.create({ data: { role: 'client' } });
      clientIds.push(client.id);
      const chats = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < chats; k += 1) {
        const attorney = await prisma.user.create({
          data: { role: 'attorney' },
        });
        const kase = await prisma.case.create({
          data: {
            client_id: client.id,
            title: 'Truck crash on the highway, need help',
            description:
              'A truck hit my car on the highway last month, no payout.',
            practice_area_id: leafId,
            primary_state_code: 'NY',
            budget_mode: 'clarify_later',
            status: 'open',
          },
        });
        caseIds.push(kase.id);
        const conv = await prisma.conversation.create({
          data: {
            client_id: client.id,
            attorney_id: attorney.id,
            case_id: kase.id,
            status: 'active',
            participants: {
              create: [{ user_id: client.id }, { user_id: attorney.id }],
            },
          },
        });
        // Fast clients answer in minutes, slow ones in days; some chats
        // start before the 30-day window.
        const pace = pick([5 * MIN, 3 * 60 * MIN, 2 * DAY]);
        let t = now.getTime() - (20 + rnd() * 20) * DAY;
        const rows: Prisma.MessageCreateManyInput[] = [];
        const n = 4 + Math.floor(rnd() * 36);
        for (let i = 0; i < n; i += 1) {
          // One in eight shares the previous timestamp (ties).
          if (i === 0 || rnd() >= 0.125) t += rnd() * pace * 2;
          if (t > now.getTime() - MIN) break;
          const r = rnd();
          const sender = r < 0.45 ? attorney.id : r < 0.85 ? client.id : null;
          rows.push({
            conversation_id: conv.id,
            sender_id: sender,
            type: sender ? 'text' : 'system',
            body_original: 'hello',
            body_display: 'hello',
            client_message_id: randomUUID(),
            created_at: new Date(t),
            deleted_at: rnd() < 0.1 ? new Date(t + MIN) : null,
          });
        }
        if (rows.length > 0) await prisma.message.createMany({ data: rows });
      }
    }
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.del(...clientIds.map((id) => `case:resp24:${id}`));
  });

  afterAll(async () => {
    await app.close();
  });

  const norm = (
    rows: { client_id: string; secs: Prisma.Decimal | null; asked_at: Date }[],
  ) =>
    rows
      .map(
        (r) =>
          `${r.client_id}|${r.secs === null ? 'null' : r.secs.toString()}|${r.asked_at.toISOString()}`,
      )
      .sort();

  it('every sample row is the same', async () => {
    type Row = {
      client_id: string;
      secs: Prisma.Decimal | null;
      asked_at: Date;
    };
    const before = await inShard(() =>
      prisma.$queryRaw<Row[]>(oldSamplesSql(clientIds, since)),
    );
    const after = await inShard(() =>
      prisma.$queryRaw<Row[]>(responseSamplesSql(clientIds, since)),
    );
    // The data must exercise both branches: answered and unanswered.
    expect(before.length).toBeGreaterThan(100);
    expect(before.some((r) => r.secs === null)).toBe(true);
    expect(before.some((r) => r.secs !== null)).toBe(true);
    expect(norm(after)).toEqual(norm(before));
  });

  it('the verdict per client is the same, and both answers occur', async () => {
    const old = await inShard(() =>
      prisma.$queryRaw<{ client_id: string }[]>(
        verdictSql(oldSamplesSql(clientIds, since), day),
      ),
    );
    const expected = new Set(old.map((r) => r.client_id));
    expect(expected.size).toBeGreaterThan(0);
    expect(expected.size).toBeLessThan(clientIds.length);
    const got = await inShard(() => service.respondsWithinDay(clientIds, now));
    expect([...got].sort()).toEqual([...expected].sort());
  });
});
