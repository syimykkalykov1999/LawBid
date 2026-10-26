import type { AddressInfo, Server } from 'node:net';
import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { SearchIndexerService } from '../src/modules/search/search-indexer.service';
import { SwitchingSearchProvider } from '../src/modules/search/search-switch.provider';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-24 (search-ready): the whole pipeline on a real database
 * and a tiny fake engine over HTTP — the outbox triggers (nothing written
 * while the switch is off, one event per searchable change, none for a
 * counter), the indexer (drain, retry, prune), the resumable reindex, and
 * the three modes of `search.engine`.
 */
jest.setTimeout(120_000);

interface Fake {
  url: string;
  docs: Map<string, Record<string, unknown>>;
  searches: number;
  fail: boolean;
  close: () => Promise<void>;
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Read alias, write alias and physical name all mean `<prefix>-<entity>-v1`. */
function canon(i: string): string {
  return i.replace(/-write$/, '').replace(/-v\d+$/, '') + '-v1';
}

async function fakeEngine(): Promise<Fake> {
  const fake: Fake = {
    url: '',
    docs: new Map(),
    searches: 0,
    fail: false,
    close: () => Promise.resolve(),
  };
  const indexes = new Set<string>();
  const server = createServer((req, res) => {
    void (async () => {
      const raw = await body(req);
      const json = (status: number, o: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(o));
      };
      const url = req.url ?? '/';
      if (fake.fail && url !== '/') return json(500, { error: 'down' });
      if (url === '/') return json(200, { version: 'fake' });
      // Alias-based layout: the fake keeps ONE index per entity (-v1); the
      // aliases are mapped onto it by canon().
      if (url.startsWith('/_cat/')) return json(200, []);
      if (url === '/_aliases') return json(200, { acknowledged: true });
      if (url === '/_bulk') {
        const lines = raw.trim().split('\n');
        const items: unknown[] = [];
        for (let i = 0; i < lines.length; i++) {
          const act = JSON.parse(lines[i]) as Record<
            string,
            { _index: string; _id: string }
          >;
          if (act.index) {
            fake.docs.set(
              `${canon(act.index._index)}/${act.index._id}`,
              JSON.parse(lines[++i]) as Record<string, unknown>,
            );
            items.push({ index: { status: 200 } });
          } else {
            const had = fake.docs.delete(
              `${canon(act.delete._index)}/${act.delete._id}`,
            );
            items.push({ delete: { status: had ? 200 : 404 } });
          }
        }
        return json(200, { errors: false, items });
      }
      if (req.method === 'HEAD') {
        res.writeHead(indexes.has(url.slice(1)) ? 200 : 404);
        return res.end();
      }
      if (req.method === 'PUT') {
        indexes.add(url.slice(1));
        return json(200, { acknowledged: true });
      }
      if (url.endsWith('/_search')) {
        fake.searches++;
        const index = canon(url.slice(1, -'/_search'.length));
        const hits = [...fake.docs.keys()]
          .filter((k) => k.startsWith(`${index}/`))
          .map((k) => ({ _id: k.slice(index.length + 1) }));
        return json(200, { hits: { hits } });
      }
      return json(404, {});
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise((r) => server.close(() => r()));
  return fake;
}

describe('search.engine switch, outbox and indexer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let indexer: SearchIndexerService;
  let router: SwitchingSearchProvider;
  let fake: Fake;
  let base = '';

  const setEngine = async (v: 'postgres' | 'shadow' | 'engine') => {
    await prisma.appConfig.upsert({
      where: { key: 'search.engine' },
      create: { key: 'search.engine', value: v },
      update: { value: v },
    });
    await redis.del('config:app_config');
  };
  const outbox = () =>
    prisma.$queryRaw<{ entity: string; entity_id: string }[]>`
      SELECT entity, entity_id::TEXT AS entity_id FROM search_outbox ORDER BY id`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    fake = await fakeEngine();
    process.env.OPENSEARCH_URL = fake.url;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    indexer = app.get(SearchIndexerService);
    router = app.get(SwitchingSearchProvider);
    await prisma.$executeRaw`DELETE FROM search_outbox`;
    await prisma.searchIndexState.deleteMany();
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: 'search.engine' } });
    await redis.del('config:app_config');
    await prisma.$executeRaw`DELETE FROM search_outbox`;
    await app.close();
    await fake.close();
    delete process.env.OPENSEARCH_URL;
  });

  const as = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });

  it('writes nothing to the outbox while the switch is off', async () => {
    await setEngine('postgres');
    const author = await prisma.user.create({ data: { role: 'client' } });
    await prisma.post.create({
      data: { author_id: author.id, body: 'quiet off post' },
    });
    await prisma.tag.create({ data: { tag_lower: `off${Date.now()}` } });
    expect(await outbox()).toEqual([]);
  });

  it('writes one event per searchable change, none for a counter', async () => {
    await setEngine('shadow');
    const author = await prisma.user.create({ data: { role: 'client' } });
    const before = (await outbox()).length;
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'outbox probe body' },
    });
    expect((await outbox()).length).toBe(before + 1);

    await prisma.post.update({
      where: { id: post.id },
      data: { like_count: 5 },
    });
    expect((await outbox()).length).toBe(before + 1); // counter: no event

    await prisma.post.update({
      where: { id: post.id },
      data: { body: 'outbox probe body, edited' },
    });
    expect((await outbox()).length).toBe(before + 2);

    await prisma.post.delete({ where: { id: post.id } });
    const rows = (await outbox()).slice(before);
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.entity === 'post' && r.entity_id === post.id),
    ).toBe(true);
  });

  it('drains into the engine (index, then delete), idempotently', async () => {
    await setEngine('shadow');
    await prisma.$executeRaw`DELETE FROM search_outbox`;
    const author = await prisma.user.create({ data: { role: 'client' } });
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'drain me please' },
    });
    const key = `lawbid-post-v1/${post.id}`;
    // Two events for one post are coalesced into one document write.
    await prisma.post.update({
      where: { id: post.id },
      data: { body: 'drain me please now' },
    });
    // post insert + update (+ the author's own person event)
    expect((await indexer.drain()).done).toBeGreaterThanOrEqual(2);
    expect(fake.docs.get(key)?.body).toBe('drain me please now');
    expect(await outbox()).toEqual([]);

    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'hidden' },
    });
    await indexer.drain();
    expect(fake.docs.has(key)).toBe(false);
    // Replaying an event changes nothing.
    await prisma.$executeRaw`
      INSERT INTO search_outbox (entity, entity_id) VALUES ('post', ${post.id}::UUID)`;
    expect((await indexer.drain()).failed).toBe(0);
    expect(fake.docs.has(key)).toBe(false);
  });

  it('keeps events and retries later when the engine is down', async () => {
    await setEngine('shadow');
    await prisma.$executeRaw`DELETE FROM search_outbox`;
    const author = await prisma.user.create({ data: { role: 'client' } });
    await prisma.post.create({
      data: { author_id: author.id, body: 'engine is down now' },
    });
    fake.fail = true;
    const res = await indexer.drain();
    fake.fail = false;
    expect(res.done).toBe(0);
    expect(res.failed).toBeGreaterThanOrEqual(1);
    const [row] = await prisma.$queryRaw<
      { attempts: number; last_error: string | null; later: boolean }[]
    >`SELECT attempts, last_error, next_attempt_at > now() AS later
      FROM search_outbox WHERE entity = 'post'`;
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBeTruthy();
    expect(row.later).toBe(true);
    // Not due yet: nothing is taken twice.
    expect((await indexer.drain()).done).toBe(0);
    await prisma.$executeRaw`UPDATE search_outbox SET next_attempt_at = now()`;
    expect((await indexer.drain()).done).toBeGreaterThanOrEqual(1);
    expect(await outbox()).toEqual([]);
  });

  it('empties the outbox when the switch goes back to postgres', async () => {
    await prisma.$executeRaw`
      INSERT INTO search_outbox (entity, entity_id) VALUES ('post', gen_random_uuid())`;
    await setEngine('postgres');
    const res = await indexer.tick();
    expect(res.on).toBe(false);
    expect(await outbox()).toEqual([]);
  });

  it('reindex is resumable and fills every entity', async () => {
    await setEngine('shadow');
    const author = await prisma.user.create({ data: { role: 'client' } });
    const stem = `rx${randomUUID().slice(0, 6)}`;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await prisma.post.create({
        data: { author_id: author.id, body: `${stem} reindex ${i}` },
      });
      ids.push(p.id);
    }
    await indexer.resetReindex();
    // One tiny step, then resume: the checkpoint carries on.
    const first = await indexer.reindex({ batch: 2, budgetMs: 1 });
    const again = await indexer.reindex({ batch: 2 });
    expect(again.done).toBe(true);
    expect(again.indexed).toBeGreaterThanOrEqual(first.indexed);
    for (const id of ids) {
      expect(fake.docs.has(`lawbid-post-v1/${id}`)).toBe(true);
    }
    // Finished at this mapping version: another call does nothing.
    const n = fake.docs.size;
    await indexer.reindex();
    expect(fake.docs.size).toBe(n);
  });

  it('modes: postgres never asks the engine, shadow shows Postgres, engine falls back', async () => {
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const author = await prisma.user.create({ data: { role: 'client' } });
    const stem = `zq${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const post = await prisma.post.create({
      data: { author_id: author.id, body: `${stem} unique words here` },
    });
    await indexer.drain().catch(() => undefined);
    const find = async (q: string) => {
      const r = await request(base)
        .get('/api/v1/search/posts')
        .query({ q })
        .set(as(viewer.id));
      expect(r.status).toBe(200);
      return r.body.data as { id: string }[];
    };

    await setEngine('postgres');
    const s0 = fake.searches;
    const fromPg = await find(stem);
    expect(fromPg.map((x) => x.id)).toContain(post.id);
    expect(fake.searches).toBe(s0);

    await setEngine('shadow');
    const fromShadow = await find(`${stem} unique`);
    await router.idle();
    expect(fromShadow.map((x) => x.id)).toContain(post.id);
    expect(fake.searches).toBeGreaterThan(s0);

    // engine: the fake engine says "everything in the index"; Postgres
    // still decides, so the post is found and nothing foreign appears.
    await setEngine('engine');
    const fromEngine = await find(`${stem} words`);
    expect(fromEngine.map((x) => x.id)).toContain(post.id);

    // engine down: the request still succeeds, answered by Postgres.
    fake.fail = true;
    const fallbacks = router.stats.fallbacks;
    const whileDown = await find(`${stem} here`);
    fake.fail = false;
    expect(whileDown.map((x) => x.id)).toContain(post.id);
    expect(router.stats.fallbacks).toBeGreaterThan(fallbacks);
  });
});
