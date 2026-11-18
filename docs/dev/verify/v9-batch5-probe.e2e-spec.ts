/**
 * Проверка 17.11, пачка 5 (поиск, чаты, комментарии — второй проход).
 * Живые HTTP-запросы к API внутри набора, настоящие Postgres и Redis Мака.
 * Запуск: docs/dev/verify/v9-run.sh v9-batch5-probe — строки "V9 <номер> {...}".
 */
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { AccountAnonymizationService } from '../src/modules/privacy/account-anonymization.service';
import { ensurePostPractices } from './support/post-practices';

jest.setTimeout(300_000);
type Auth = Record<string, string>;
const log = (id: string, o: unknown) => process.stdout.write(`V9 ${id} ${JSON.stringify(o)}\n`);

describe('verify batch 5 probe 17.11', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const api = () => request(base);
  const flush = () => app.get(CounterAggregator).flush();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await ensurePostPractices(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  async function user(role: 'client' | 'attorney', handle?: string) {
    const u = await prisma.user.create({ data: { role, first_name: 'V', last_name: 'Five' } });
    if (role === 'attorney') {
      const username = handle ?? `v95${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: { user_id: u.id, username, username_lower: username, languages: ['en'], verification_status: 'verified' },
      });
    }
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } as Auth };
  }

  it('S1 type-ahead: no deleted / suspended attorneys, no one blocked', async () => {
    const tag = `zq${randomUUID().slice(0, 6)}`;
    const live = await user('attorney', `${tag}live`);
    const gone = await user('attorney', `${tag}gone`);
    const susp = await user('attorney', `${tag}susp`);
    const blocker = await user('attorney', `${tag}blck`);
    const viewer = await user('client');
    await prisma.user.update({ where: { id: gone.id }, data: { deleted_at: new Date(), status: 'deleted' } });
    await prisma.user.update({ where: { id: susp.id }, data: { status: 'suspended' } });
    await prisma.userBlock.create({ data: { blocker_id: blocker.id, blocked_id: viewer.id } });
    const r = await api().get('/api/v1/search/suggest').query({ q: tag }).set(viewer.auth).expect(200);
    const people = (r.body.data as { kind: string; text: string }[])
      .filter((x) => x.kind === 'person')
      .map((x) => x.text)
      .sort();
    log('S1', { people });
    expect(people).toEqual([`${tag}live`]);
    void live;
  });

  it('C7 an account deleted for good takes its comments and their counts with it', async () => {
    const att = await user('attorney');
    const fan = await user('client');
    const other = await user('client');
    const post = await api()
      .post('/api/v1/posts')
      .set(att.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'P', practiceCode: 'family_law', body: 'b' })
      .expect(201);
    const postId = post.body.data.id as string;
    const top = await api().post(`/api/v1/posts/${postId}/comments`).set(fan.auth).send({ body: 'mine' }).expect(201);
    await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(other.auth)
      .send({ body: 'reply', parentCommentId: top.body.data.id })
      .expect(201);
    await api().post(`/api/v1/posts/${postId}/comments`).set(other.auth).send({ body: 'stays' }).expect(201);
    await flush();
    const before = (await api().get(`/api/v1/posts/${postId}`).set(att.auth)).body.data.commentCount;
    await app.get(AccountAnonymizationService).anonymize(fan.id);
    await flush();
    const after = (await api().get(`/api/v1/posts/${postId}`).set(att.auth)).body.data.commentCount;
    const shown = (await api().get(`/api/v1/posts/${postId}/comments`).set(att.auth)).body.data.length;
    const liveRows = await prisma.comment.count({ where: { post_id: postId, deleted_at: null } });
    log('C7', { before, after, shown, liveRows });
    expect([before, after, shown, liveRows]).toEqual([3, 1, 1, 1]);
  });
});
