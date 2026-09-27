import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  SOFT_DELETE_META,
  onlyDeleted,
  softDeleteExtension,
  withDeleted,
} from '../src/prisma/soft-delete.extension';
import { withTxRetry } from '../src/prisma/tx-retry.util';
import { IdentityService } from '../src/modules/auth/services/identity.service';

/**
 * docs/02_DATABASE.md §1.4: reads exclude soft-deleted rows by default via
 * the Prisma extension (not by hand), with an explicit opt-out. Real
 * CockroachDB, the DI-provided PrismaService (the same instance every
 * service gets), users / cases / posts / files / comments.
 */
describe('DB soft delete (e2e) — docs/02 §1.4', () => {
  // App boot + CockroachDB fixtures exceed Jest's 5 s default under load.
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  const raw = new PrismaClient(); // unfiltered view of the same DB
  const deletedAt = new Date('2026-01-01T00:00:00Z');
  const tag = randomUUID().slice(0, 8);

  let liveUser: { id: string };
  let deadUser: { id: string };
  let liveCase: { id: string };
  let deadCase: { id: string };
  let livePost: { id: string };
  let deadPost: { id: string };
  let liveFile: { id: string };
  let deadFile: { id: string };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.init();
    prisma = app.get(PrismaService);

    await raw.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const area = await raw.practiceArea.upsert({
      where: { code: 'soft_delete_e2e' },
      create: {
        code: 'soft_delete_e2e',
        name_en: 'Soft delete e2e',
        i18n_key: 'practice.soft_delete_e2e',
        sort: 0,
      },
      update: {},
    });

    liveUser = await raw.user.create({
      data: { role: 'client', first_name: `live-${tag}` },
    });
    deadUser = await raw.user.create({
      data: {
        role: 'client',
        first_name: `dead-${tag}`,
        status: 'deleted',
        deleted_at: deletedAt,
      },
    });
    const mkCase = (deleted: boolean) =>
      raw.case.create({
        data: {
          client_id: liveUser.id,
          title: `case-${tag}`,
          description: 'Soft delete e2e',
          practice_area_id: area.id,
          primary_state_code: 'NY',
          budget_mode: 'clarify_later',
          deleted_at: deleted ? deletedAt : null,
        },
      });
    liveCase = await mkCase(false);
    deadCase = await mkCase(true);
    const mkPost = (deleted: boolean) =>
      raw.post.create({
        data: {
          author_id: liveUser.id,
          body: `post-${tag}`,
          deleted_at: deleted ? deletedAt : null,
        },
      });
    livePost = await mkPost(false);
    deadPost = await mkPost(true);
    await raw.comment.createMany({
      data: [
        { post_id: livePost.id, author_id: liveUser.id, body: 'live' },
        {
          post_id: livePost.id,
          author_id: liveUser.id,
          body: 'dead',
          deleted_at: deletedAt,
        },
      ],
    });
    const mkFile = (deleted: boolean) =>
      raw.file.create({
        data: {
          owner_user_id: liveUser.id,
          purpose: 'post_image',
          s3_bucket: 'media',
          s3_key: `soft-delete/${tag}/${randomUUID()}`,
          mime: 'image/jpeg',
          size_bytes: 10n,
          sha256: 'x'.repeat(64),
          deleted_at: deleted ? deletedAt : null,
        },
      });
    liveFile = await mkFile(false);
    deadFile = await mkFile(true);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('default filtering', () => {
    it('findMany / findFirst / count exclude soft-deleted rows on every covered model', async () => {
      const users = await prisma.user.findMany({
        where: { first_name: { endsWith: tag } },
      });
      expect(users.map((u) => u.id)).toEqual([liveUser.id]);

      const cases = await prisma.case.findMany({
        where: { title: `case-${tag}` },
      });
      expect(cases.map((c) => c.id)).toEqual([liveCase.id]);

      expect(await prisma.post.count({ where: { body: `post-${tag}` } })).toBe(
        1,
      );
      expect(
        await prisma.file.findFirst({ where: { id: deadFile.id } }),
      ).toBeNull();
      expect(
        (
          await prisma.file.findMany({ where: { owner_user_id: liveUser.id } })
        ).map((f) => f.id),
      ).toEqual([liveFile.id]);
      expect(
        await prisma.comment.count({ where: { post_id: livePost.id } }),
      ).toBe(1);
    });

    it('findUnique returns null and findUniqueOrThrow throws P2025 for a soft-deleted row', async () => {
      expect(
        await prisma.user.findUnique({ where: { id: deadUser.id } }),
      ).toBeNull();
      await expect(
        prisma.case.findUniqueOrThrow({ where: { id: deadCase.id } }),
      ).rejects.toMatchObject({ code: 'P2025' });
      await expect(
        prisma.post.findFirstOrThrow({ where: { id: deadPost.id } }),
      ).rejects.toMatchObject({ code: 'P2025' });
      expect(
        (await prisma.post.findUniqueOrThrow({ where: { id: livePost.id } }))
          .id,
      ).toBe(livePost.id);
    });

    it('aggregate and groupBy only see live rows', async () => {
      const agg = await prisma.case.aggregate({
        where: { client_id: liveUser.id },
        _count: { _all: true },
      });
      expect(agg._count._all).toBe(1);
      const groups = await prisma.post.groupBy({
        by: ['author_id'],
        where: { author_id: liveUser.id },
        _count: { _all: true },
      });
      expect(groups).toEqual([{ author_id: liveUser.id, _count: { _all: 1 } }]);
    });

    it('nested to-many includes and relation counts only see live rows', async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: liveUser.id },
        include: {
          posts: true,
          files: true,
          cases_as_client: true,
          _count: { select: { posts: true, cases_as_client: true } },
        },
      });
      expect(user.posts.map((p) => p.id)).toEqual([livePost.id]);
      expect(user.files.map((f) => f.id)).toEqual([liveFile.id]);
      expect(user.cases_as_client.map((c) => c.id)).toEqual([liveCase.id]);
      expect(user._count).toEqual({ posts: 1, cases_as_client: 1 });

      const post = await prisma.post.findUniqueOrThrow({
        where: { id: livePost.id },
        select: { comments: { select: { body: true } }, _count: true },
      });
      expect(post.comments).toEqual([{ body: 'live' }]);
      expect(post._count.comments).toBe(1);
    });

    it('interactive transactions (withTxRetry) are filtered too', async () => {
      const seen = await withTxRetry(prisma, (tx) =>
        tx.case.findMany({ where: { client_id: liveUser.id } }),
      );
      expect(seen.map((c) => c.id)).toEqual([liveCase.id]);
    });
  });

  describe('opt-out', () => {
    it('withDeleted() returns live and soft-deleted rows', async () => {
      const cases = await prisma.case.findMany({
        where: withDeleted({ client_id: liveUser.id }),
        orderBy: { created_at: 'asc' },
      });
      expect(new Set(cases.map((c) => c.id))).toEqual(
        new Set([liveCase.id, deadCase.id]),
      );
      const dead = await prisma.user.findUniqueOrThrow({
        where: withDeleted({ id: deadUser.id }),
      });
      expect(dead.deleted_at).toEqual(deletedAt);
    });

    it('onlyDeleted() and an explicit deleted_at filter are honoured', async () => {
      const posts = await prisma.post.findMany({
        where: onlyDeleted({ author_id: liveUser.id }),
      });
      expect(posts.map((p) => p.id)).toEqual([deadPost.id]);
      const files = await prisma.file.findMany({
        where: {
          owner_user_id: liveUser.id,
          deleted_at: { lt: new Date('2027-01-01T00:00:00Z') },
        },
      });
      expect(files.map((f) => f.id)).toEqual([deadFile.id]);
    });

    it('rows are never physically deleted by the filter, and writes still reach them', async () => {
      expect(await raw.case.count({ where: { client_id: liveUser.id } })).toBe(
        2,
      );
      // A restore is a plain update — writes are not filtered.
      await prisma.file.update({
        where: { id: deadFile.id },
        data: { deleted_at: null },
      });
      expect(
        (await prisma.file.findUnique({ where: { id: deadFile.id } }))?.id,
      ).toBe(deadFile.id);
      await prisma.file.update({
        where: { id: deadFile.id },
        data: { deleted_at: deletedAt },
      });
    });
  });

  describe('auth still sees deleted accounts where it must', () => {
    it('social-login email collision includes a soft-deleted owner (users.email is unique)', async () => {
      const email = `soft-${tag}@example.com`;
      await raw.user.create({
        data: {
          role: 'client',
          email,
          email_verified_at: new Date(),
          deleted_at: deletedAt,
          status: 'deleted',
        },
      });
      const identity = app.get(IdentityService);
      const result = await identity.findOrCreateForSocial(
        'google',
        `google-sub-${tag}`,
        email,
        undefined,
        undefined,
      );
      expect(result).toMatchObject({ collision: true });
    });

    it('OTP login of a soft-deleted account still answers ACCOUNT_DELETED', async () => {
      const phone = '+12025558101';
      await raw.user.create({
        data: {
          status: 'deleted',
          deleted_at: deletedAt,
          phone_e164: phone,
          phone_verified_at: new Date(),
          identifiers: {
            create: {
              provider: 'phone',
              provider_uid: phone,
              verified_at: new Date(),
            },
          },
        },
      });
      const api = request(app.getHttpServer());
      await api
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier: phone })
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          channel: 'phone',
          identifier: phone,
          code: '000000',
          deviceInfo: { deviceId: 'soft-delete-e2e' },
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DELETED');
    });

    it('refresh keeps working for a live session of a soft-deleted user row (opt-out, no 500)', async () => {
      const phone = '+12025558102';
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier: phone })
        .expect(200);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          channel: 'phone',
          identifier: phone,
          code: '000000',
          deviceInfo: { deviceId: 'soft-delete-e2e-2' },
        })
        .expect(201);
      const ident = await raw.userIdentifier.findUniqueOrThrow({
        where: {
          provider_provider_uid: { provider: 'phone', provider_uid: phone },
        },
      });
      await raw.user.update({
        where: { id: ident.user_id },
        data: { deleted_at: new Date() },
      });
      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: login.body.data.refreshToken,
          deviceInfo: { deviceId: 'soft-delete-e2e-2' },
        });
      expect(refreshed.status).toBe(201);
    });
  });

  it('every model with deleted_at (from the DMMF) is filtered at the SQL level', async () => {
    const queries: string[] = [];
    const logged = new PrismaClient({
      log: [{ emit: 'event', level: 'query' }],
    });
    logged.$on('query', (e) => queries.push(e.query));
    const client = logged.$extends(softDeleteExtension());
    const models = [...SOFT_DELETE_META.models];
    expect(models.length).toBeGreaterThanOrEqual(5);
    try {
      for (const model of models) {
        const delegate = (client as unknown as Record<string, unknown>)[
          model.charAt(0).toLowerCase() + model.slice(1)
        ] as { count: () => Promise<number> };
        queries.length = 0;
        await delegate.count();
        const table = Prisma.dmmf.datamodel.models.find(
          (m) => m.name === model,
        )?.dbName;
        expect(queries.join('\n')).toContain(`"${table}"."deleted_at" IS NULL`);
      }
    } finally {
      await logged.$disconnect();
    }
  });
});
