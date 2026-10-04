import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { withDeleted } from '../src/prisma/soft-delete.extension';
import { adminSession } from './support/admin-login';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-04: bulk moderation (posts, comments, reviews, videos,
 * sticker packs — many ids, one reason, authors notified, one audit row per
 * batch, list filters by author / dates) and broadcasts to any set of states.
 */
jest.setTimeout(120_000);

describe('Bulk moderation + broadcast states (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const REASON = 'Spam campaign cleanup';

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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  const user = (role: 'attorney' | 'client', first: string) =>
    prisma.user.create({
      data: { role, first_name: first, last_name: 'Bulk', status: 'active' },
    });

  const notices = (userId: string) =>
    prisma.notification.count({
      where: { user_id: userId, type: 'moderation_notice' },
    });

  async function practiceId() {
    const pa = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    return pa.id;
  }

  it('lists filter by author and dates; bulk remove / hide / restore posts and comments', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const spammer = await user('attorney', 'Spammer');
    const other = await user('attorney', 'Other');
    const pa = await practiceId();
    const mk = (author: string, title: string) =>
      prisma.post.create({
        data: {
          author_id: author,
          title,
          body: 'Buy now',
          practice_area_id: pa,
        },
      });
    const p1 = await mk(spammer.id, 'Spam 1');
    const p2 = await mk(spammer.id, 'Spam 2');
    const p3 = await mk(spammer.id, 'Spam 3');
    const keep = await mk(other.id, 'Fine post');

    // Author filter: only the spammer's posts.
    const byAuthor = await api()
      .get(`/api/v1/admin/content/posts?authorId=${spammer.id}`)
      .set(admin.auth)
      .expect(200);
    expect(
      (byAuthor.body.data as { id: string }[]).map((p) => p.id).sort(),
    ).toEqual([p1.id, p2.id, p3.id].sort());
    // A window in the past finds none of them.
    await api()
      .get(
        `/api/v1/admin/content/posts?authorId=${spammer.id}&to=2020-01-01T00:00:00.000Z`,
      )
      .set(admin.auth)
      .expect(200)
      .expect((r) => expect(r.body.data).toHaveLength(0));
    await api()
      .get('/api/v1/admin/content/posts?from=not-a-date')
      .set(admin.auth)
      .expect(400);

    // Remove two posts at once (+ an unknown id): authors told, one audit row.
    const missing = randomUUID();
    const removed = await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'remove',
        type: 'post',
        ids: [p1.id, p2.id, missing],
        reason: REASON,
      })
      .expect(200);
    expect([...(removed.body.data.done as string[])].sort()).toEqual(
      [p1.id, p2.id].sort(),
    );
    expect(removed.body.data.skipped).toEqual([
      { id: missing, reason: 'not_found' },
    ]);
    expect(await prisma.post.findUnique({ where: { id: p1.id } })).toBeNull();
    expect(await notices(spammer.id)).toBe(2);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: keep.id } })).status,
    ).toBe('published');
    const audit = await prisma.auditLog.findMany({
      where: { admin_id: admin.userId, action: 'admin.content.bulk_remove' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].after).toMatchObject({
      reason: REASON,
      requested: 3,
      done: expect.arrayContaining([p1.id, p2.id]) as unknown,
    });

    // Removing again skips (already removed) and notifies nobody twice.
    const again = await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({ action: 'remove', type: 'post', ids: [p1.id], reason: REASON })
      .expect(200);
    expect(again.body.data.skipped).toEqual([
      { id: p1.id, reason: 'invalid_state' },
    ]);
    expect(await notices(spammer.id)).toBe(2);

    // Hide one, then restore everything that moderation took down.
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({ action: 'hide', type: 'post', ids: [p3.id], reason: REASON })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toEqual([p3.id]));
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: p3.id } })).status,
    ).toBe('hidden');
    const restored = await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'restore',
        type: 'post',
        ids: [p1.id, p3.id],
        reason: 'Appeal accepted by the team',
      })
      .expect(200);
    expect([...(restored.body.data.done as string[])].sort()).toEqual(
      [p1.id, p3.id].sort(),
    );
    const back = await prisma.post.findUniqueOrThrow({
      where: withDeleted({ id: p1.id }),
    });
    expect(back.status).toBe('published');
    expect(back.deleted_at).toBeNull();

    // Comments: remove two, the post's counter follows.
    const c1 = await prisma.comment.create({
      data: { post_id: keep.id, author_id: spammer.id, body: 'spam 1' },
    });
    const c2 = await prisma.comment.create({
      data: { post_id: keep.id, author_id: spammer.id, body: 'spam 2' },
    });
    await prisma.post.update({
      where: { id: keep.id },
      data: { comment_count: 2 },
    });
    const listed = await api()
      .get(`/api/v1/admin/content/comments?authorId=${spammer.id}`)
      .set(admin.auth)
      .expect(200);
    expect(
      (listed.body.data as { id: string }[]).map((c) => c.id).sort(),
    ).toEqual([c1.id, c2.id].sort());
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'remove',
        type: 'comment',
        ids: [c1.id, c2.id],
        reason: REASON,
      })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toHaveLength(2));
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: keep.id } }))
        .comment_count,
    ).toBe(0);
  });

  it('bulk hides and restores reviews of attorneys and of clients', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const attorney = await user('attorney', 'Rated');
    const clientA = await user('client', 'Angry');
    const clientB = await user('client', 'Calm');
    const r1 = await prisma.review.create({
      data: {
        client_id: clientA.id,
        attorney_id: attorney.id,
        rating: 1,
        body: 'bad',
      },
    });
    const r2 = await prisma.review.create({
      data: {
        client_id: clientB.id,
        attorney_id: attorney.id,
        rating: 2,
        body: 'meh',
      },
    });
    const list = await api()
      .get(`/api/v1/admin/content/reviews?authorId=${clientA.id}`)
      .set(admin.auth)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      id: r1.id,
      clientId: clientA.id,
      attorneyId: attorney.id,
    });

    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'hide',
        type: 'review',
        ids: [r1.id, r2.id],
        reason: REASON,
      })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toHaveLength(2));
    expect(
      await prisma.review.count({
        where: { id: { in: [r1.id, r2.id] }, status: 'hidden' },
      }),
    ).toBe(2);
    expect(await notices(clientA.id)).toBe(1);
    expect(await notices(clientB.id)).toBe(1);

    // Reviews are hidden, never removed in bulk.
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({ action: 'remove', type: 'review', ids: [r1.id], reason: REASON })
      .expect(400);

    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'restore',
        type: 'review',
        ids: [r1.id, r2.id],
        reason: 'Reviewed again by the team',
      })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toHaveLength(2));

    const cr = await prisma.clientReview.create({
      data: { attorney_id: attorney.id, client_id: clientA.id, rating: 1 },
    });
    await api()
      .get(`/api/v1/admin/content/client-reviews?authorId=${attorney.id}`)
      .set(admin.auth)
      .expect(200)
      .expect((r) =>
        expect((r.body.data as { id: string }[]).map((x) => x.id)).toEqual([
          cr.id,
        ]),
      );
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'hide',
        type: 'client_review',
        ids: [cr.id],
        reason: REASON,
      })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toEqual([cr.id]));
    expect(
      (await prisma.clientReview.findUniqueOrThrow({ where: { id: cr.id } }))
        .status,
    ).toBe('hidden');
  });

  it('bulk takes videos down and hides / unhides sticker packs', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const owner = await user('attorney', 'Reeler');
    const pa = await practiceId();
    const assets = await Promise.all(
      [1, 2].map((i) =>
        prisma.videoAsset.create({
          data: {
            owner_user_id: owner.id,
            library_id: 'lib',
            external_id: `bulk-${randomUUID()}-${i}`,
            status: 'ready',
            upload_expires_at: new Date(Date.now() + 3600_000),
          },
        }),
      ),
    );
    const posts = await Promise.all(
      assets.map((a) =>
        prisma.post.create({
          data: {
            author_id: owner.id,
            body: 'reel',
            practice_area_id: pa,
            video_asset_id: a.id,
          },
        }),
      ),
    );
    await api()
      .get(
        `/api/v1/admin/media/videos?ownerId=${owner.id}&from=2020-01-01T00:00:00.000Z`,
      )
      .set(admin.auth)
      .expect(200)
      .expect((r) => expect(r.body.data).toHaveLength(2));
    const res = await api()
      .post('/api/v1/admin/media/videos/bulk-takedown')
      .set(admin.auth)
      .send({ ids: assets.map((a) => a.id), reason: REASON })
      .expect(200);
    expect(res.body.data.done).toHaveLength(2);
    expect(
      await prisma.videoAsset.count({
        where: withDeleted({
          id: { in: assets.map((a) => a.id) },
          status: 'deleted' as const,
        }),
      }),
    ).toBe(2);
    expect(
      await prisma.post.count({
        where: { id: { in: posts.map((p) => p.id) } },
      }),
    ).toBe(0);
    expect(await notices(owner.id)).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { admin_id: admin.userId, action: 'admin.media.bulk_takedown' },
      }),
    ).toBe(1);

    const packs = await Promise.all(
      [1, 2].map((i) =>
        prisma.stickerPack.create({
          data: {
            owner_user_id: owner.id,
            title: `Pack ${i}`,
            short_name: `bulk${randomUUID().slice(0, 8)}${i}`,
          },
        }),
      ),
    );
    const ids = packs.map((p) => p.id);
    await api()
      .post('/api/v1/admin/media/sticker-packs/bulk-hide')
      .set(admin.auth)
      .send({ ids, reason: REASON })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toHaveLength(2));
    expect(
      await prisma.stickerPack.count({
        where: { id: { in: ids }, status: 'hidden' },
      }),
    ).toBe(2);
    await api()
      .post('/api/v1/admin/media/sticker-packs/bulk-hide')
      .set(admin.auth)
      .send({ ids: [ids[0]], reason: REASON })
      .expect(200)
      .expect((r) =>
        expect(r.body.data.skipped).toEqual([
          { id: ids[0], reason: 'invalid_state' },
        ]),
      );
    await api()
      .post('/api/v1/admin/media/sticker-packs/bulk-unhide')
      .set(admin.auth)
      .send({ ids, reason: 'Checked, the packs are fine' })
      .expect(200)
      .expect((r) => expect(r.body.data.done).toHaveLength(2));
  });

  it('validation and rights: reason length, id limits, view-only admins', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const post = randomUUID();
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({ action: 'remove', type: 'post', ids: [post], reason: 'short' })
      .expect(400);
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({ action: 'remove', type: 'post', ids: [], reason: REASON })
      .expect(400);
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(admin.auth)
      .send({
        action: 'remove',
        type: 'post',
        ids: Array.from({ length: 501 }, () => randomUUID()),
        reason: REASON,
      })
      .expect(400);

    const viewer = await adminSession(base, prisma, 'moderator', undefined, {
      content: 'view',
      media: 'view',
    });
    await api().get('/api/v1/admin/content/posts').set(viewer.auth).expect(200);
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(viewer.auth)
      .send({ action: 'hide', type: 'post', ids: [post], reason: REASON })
      .expect(403);
    await api()
      .post('/api/v1/admin/media/videos/bulk-takedown')
      .set(viewer.auth)
      .send({ ids: [post], reason: REASON })
      .expect(403);
    const verifier = await adminSession(base, prisma, 'verifier');
    await api()
      .post('/api/v1/admin/content/bulk')
      .set(verifier.auth)
      .send({ action: 'hide', type: 'post', ids: [post], reason: REASON })
      .expect(403);
  });

  it('broadcasts reach any chosen set of states (and one state still works)', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const tag = randomUUID().slice(0, 8);
    const client = (state: string) =>
      prisma.user.create({
        data: {
          role: 'client',
          status: 'active',
          first_name: `St${state}`,
          last_name: tag,
          client_profile: {
            create: { state_code: state, preferred_languages: ['en'] },
          },
        },
      });
    const il = await client('IL');
    const ny = await client('NY');
    const tx = await client('TX');
    const got = async (userId: string) => {
      for (let i = 0; i < 300; i++) {
        const n = await prisma.notification.count({
          where: { user_id: userId, type: 'admin_broadcast' },
        });
        if (n > 0) return n;
        await new Promise((r) => setTimeout(r, 100));
      }
      return 0;
    };

    const b = await api()
      .post('/api/v1/admin/broadcasts')
      .set(admin.auth)
      .send({
        title: 'Hello IL and NY',
        body: `States ${tag}`,
        audience: 'clients',
        stateCodes: ['IL', 'NY', 'IL'],
      })
      .expect(201);
    expect(b.body.data.stateCodes).toEqual(['IL', 'NY']);
    expect(b.body.data.stateCode).toBe('IL');
    expect(b.body.data.recipients).toBeGreaterThanOrEqual(2);
    expect(await got(il.id)).toBe(1);
    expect(await got(ny.id)).toBe(1);
    expect(
      await prisma.notification.count({
        where: { user_id: tx.id, type: 'admin_broadcast' },
      }),
    ).toBe(0);

    // Older clients send one stateCode.
    const one = await api()
      .post('/api/v1/admin/broadcasts')
      .set(admin.auth)
      .send({
        title: 'Hello TX',
        body: `State ${tag}`,
        audience: 'clients',
        stateCode: 'TX',
      })
      .expect(201);
    expect(one.body.data.stateCodes).toEqual(['TX']);
    expect(await got(tx.id)).toBe(1);

    await api()
      .post('/api/v1/admin/broadcasts')
      .set(admin.auth)
      .send({
        title: 'x',
        body: 'y',
        audience: 'clients',
        stateCodes: ['Illinois'],
      })
      .expect(400);

    const history = await api()
      .get('/api/v1/admin/broadcasts')
      .set(admin.auth)
      .expect(200);
    expect(
      (history.body.data as { id: string; stateCodes: string[] }[]).find(
        (h) => h.id === b.body.data.id,
      )?.stateCodes,
    ).toEqual(['IL', 'NY']);
  });
});
