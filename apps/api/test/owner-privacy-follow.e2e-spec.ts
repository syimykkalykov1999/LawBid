import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FilesService } from '../src/modules/files/files.service';
import { PrivacySettingsService } from '../src/modules/privacy-settings/privacy-settings.service';

/**
 * Owner 2026-10-28: every «who can» setting takes everyone / my contacts
 * (phone book) / my followers / people I follow / nobody. Each of the six
 * settings × each audience: who gets through and who does not, through the
 * same endpoints the app uses. Plus: old builds' values, the migration of
 * old «contacts» rows, and that existing chats stay open.
 */
jest.setTimeout(240_000);

type Person = { id: string; auth: Record<string, string> };
type Field =
  | 'lastSeen'
  | 'messageFrom'
  | 'callFrom'
  | 'photoFrom'
  | 'aboutFrom'
  | 'groupAddFrom';
type Viewer = 'book' | 'fan' | 'idol' | 'stranger';

const AUDIENCES: [string, Viewer[]][] = [
  ['everyone', ['book', 'fan', 'idol', 'stranger']],
  ['contacts', ['book']],
  ['followers', ['fan']],
  ['following', ['idol']],
  ['nobody', []],
];
const FIELDS: Field[] = [
  'lastSeen',
  'messageFrom',
  'callFrom',
  'photoFrom',
  'aboutFrom',
  'groupAddFrom',
];
const VIEWERS: Viewer[] = ['book', 'fan', 'idol', 'stranger'];

describe('Who-can settings by followers / following (e2e, owner 2026-10-28)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let privacy: PrivacySettingsService;
  let base = '';
  let link: jest.SpyInstance;

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
    tokens = app.get(TokenService);
    privacy = app.get(PrivacySettingsService);
    // The test storage is not configured: serve a fixed link for avatars.
    link = jest
      .spyOn(
        FilesService.prototype as unknown as {
          mediaUrlOf: () => Promise<string | null>;
        },
        'mediaUrlOf',
      )
      .mockResolvedValue('https://media.test/a.jpg');
  });

  afterAll(async () => {
    link.mockRestore();
    await app.close();
  });

  const api = () => request(base);

  async function person(role: 'client' | 'attorney', name: string) {
    const u = await prisma.user.create({
      data: { role, first_name: name, last_name: 'Follow' },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `pf_${u.id.slice(0, 8)}`,
          username_lower: `pf_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: 'verified',
          bio: 'About me.',
        },
      });
    }
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } } as Person;
  }

  /** Owner (attorney) and four client viewers: [book] is in the owner's
   * phone book, [fan] follows the owner, the owner follows [idol]. */
  async function world() {
    const owner = await person('attorney', 'Owen');
    const v = {
      book: await person('client', 'Bea'),
      fan: await person('client', 'Fan'),
      idol: await person('client', 'Ida'),
      stranger: await person('client', 'Stu'),
    } as Record<Viewer, Person>;
    await prisma.contactMatch.create({
      data: { owner_id: owner.id, matched_id: v.book.id },
    });
    await prisma.follow.createMany({
      data: [
        { follower_id: v.fan.id, followee_id: owner.id },
        { follower_id: owner.id, followee_id: v.idol.id },
      ],
    });
    return { owner, v };
  }

  async function chatOf(client: Person, attorney: Person) {
    return prisma.conversation.create({
      data: {
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        contacts_unlocked: true,
        request_status: 'accepted',
        last_message_at: new Date(),
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
  }

  /** Whether [viewer] gets through [owner]'s [field], via the app's endpoints
   * (calls: the service the call endpoints run, a ringing call would make
   * the owner busy for the next viewer). */
  async function passes(
    field: Field,
    owner: Person,
    viewer: Person,
  ): Promise<boolean> {
    switch (field) {
      case 'messageFrom': {
        const r = await api()
          .post('/api/v1/conversations/direct')
          .set(viewer.auth)
          .send({ userId: owner.id });
        if (r.status === 403) {
          expect(r.body.error.code).toBe('PRIVACY_RESTRICTED');
        }
        return r.status === 200;
      }
      case 'lastSeen': {
        const r = await api()
          .get('/api/v1/conversations')
          .set(viewer.auth)
          .expect(200);
        const list = r.body.data as {
          counterpart: { id: string; lastSeenAt: string | null };
        }[];
        return (
          list.find((c) => c.counterpart.id === owner.id)!.counterpart
            .lastSeenAt !== null
        );
      }
      case 'aboutFrom': {
        const r = await api()
          .get(`/api/v1/attorneys/pf_${owner.id.slice(0, 8)}`)
          .set(viewer.auth)
          .expect(200);
        return r.body.data.bio === 'About me.';
      }
      case 'photoFrom': {
        const post = await prisma.post.findFirstOrThrow({
          where: { author_id: owner.id },
        });
        const r = await api()
          .get(`/api/v1/posts/${post.id}`)
          .set(viewer.auth)
          .expect(200);
        // Hidden = placeholder (initials): no avatar link.
        return (r.body.data.author?.avatarUrl ?? null) !== null;
      }
      case 'callFrom':
        return privacy.allows(viewer.id, owner.id, 'call');
      case 'groupAddFrom': {
        // A private group needs at least one person the viewer may add.
        const r = await api()
          .post('/api/v1/groups')
          .set(viewer.auth)
          .send({ title: 'Team', type: 'private', memberIds: [owner.id] });
        return r.status === 201;
      }
    }
  }

  async function prepare(
    field: Field,
    owner: Person,
    v: Record<Viewer, Person>,
  ) {
    if (field === 'lastSeen') {
      await prisma.user.update({
        where: { id: owner.id },
        data: { last_active_at: new Date() },
      });
      for (const p of VIEWERS) await chatOf(v[p], owner);
    }
    if (field === 'photoFrom') {
      const avatar = await prisma.file.create({
        data: {
          owner_user_id: owner.id,
          purpose: 'avatar',
          s3_bucket: process.env.S3_BUCKET_MEDIA ?? 'lawbid-media',
          s3_key: `avatars/${owner.id}/${randomUUID()}.jpg`,
          mime: 'image/jpeg',
          size_bytes: 10n,
          sha256: 'e'.repeat(64),
          width: 512,
          height: 512,
          scan_status: 'clean',
        },
      });
      await prisma.user.update({
        where: { id: owner.id },
        data: { avatar_file_id: avatar.id },
      });
      await prisma.post.create({
        data: { author_id: owner.id, body: 'Hi', status: 'published' },
      });
    }
  }

  describe.each(FIELDS)('%s', (field) => {
    it.each(AUDIENCES)('%s', async (audience, allowed) => {
      const { owner, v } = await world();
      await prepare(field, owner, v);
      const res = await api()
        .patch('/api/v1/users/me/privacy')
        .set(owner.auth)
        .send({ [`${field}Audiences`]: [audience] })
        .expect(200);
      expect(res.body.data[`${field}Audiences`]).toEqual([audience]);
      // Old builds read the closest old value.
      expect(res.body.data[field]).toBe(
        audience === 'everyone' || audience === 'nobody'
          ? audience
          : 'contacts',
      );
      const got: Record<string, boolean> = {};
      for (const name of VIEWERS) {
        got[name] = await passes(field, owner, v[name]);
      }
      expect(got).toEqual(
        Object.fromEntries(VIEWERS.map((n) => [n, allowed.includes(n)])),
      );
    });
  });

  it('a combined set lets both groups in', async () => {
    const { owner, v } = await world();
    await api()
      .patch('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ callFromAudiences: ['followers', 'contacts'] })
      .expect(200);
    expect(await passes('callFrom', owner, v.fan)).toBe(true);
    expect(await passes('callFrom', owner, v.book)).toBe(true);
    expect(await passes('callFrom', owner, v.idol)).toBe(false);
    expect(await passes('callFrom', owner, v.stranger)).toBe(false);
  });

  it('an old build’s «contacts» means phone book or people I follow', async () => {
    const { owner, v } = await world();
    const res = await api()
      .put('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ callFrom: 'contacts' })
      .expect(200);
    expect(res.body.data.callFromAudiences).toEqual(['contacts', 'following']);
    expect(await passes('callFrom', owner, v.book)).toBe(true);
    expect(await passes('callFrom', owner, v.idol)).toBe(true);
    expect(await passes('callFrom', owner, v.fan)).toBe(false);
    await api()
      .put('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ callFromAudiences: ['sometimes'] })
      .expect(400);
    await api()
      .put('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ callFromAudiences: [] })
      .expect(400);
  });

  it('an existing chat stays open when the audience narrows', async () => {
    const { owner, v } = await world();
    await api()
      .patch('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ messageFromAudiences: ['followers'] })
      .expect(200);
    expect(await passes('messageFrom', owner, v.fan)).toBe(true);
    await api()
      .patch('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ messageFromAudiences: ['nobody'] })
      .expect(200);
    expect(await passes('messageFrom', owner, v.fan)).toBe(true);
    expect(await passes('messageFrom', owner, v.stranger)).toBe(false);
  });

  it('migration: old «contacts» rows become phone book + following', async () => {
    const { owner, v } = await world();
    // A row as it was before the migration (or written by an older build).
    await prisma.userPrivacySettings.create({
      data: {
        user_id: owner.id,
        call_from: 'contacts',
        last_seen: 'nobody',
        photo_from: 'everyone',
      },
    });
    const sql = readFileSync(
      join(
        __dirname,
        '../prisma/migrations/20261108200000_privacy_follow_audiences/migration.sql',
      ),
      'utf8',
    );
    const update = sql.slice(sql.indexOf('UPDATE "user_privacy_settings"'));
    await prisma.$executeRawUnsafe(update);
    const row = await prisma.userPrivacySettings.findUniqueOrThrow({
      where: { user_id: owner.id },
    });
    expect(row).toMatchObject({
      call_from_mask: 5,
      last_seen_mask: 0,
      photo_from_mask: 8,
      message_from_mask: 8,
    });
    expect(await passes('callFrom', owner, v.book)).toBe(true);
    expect(await passes('callFrom', owner, v.idol)).toBe(true);
    expect(await passes('callFrom', owner, v.fan)).toBe(false);
    const got = await api()
      .get('/api/v1/users/me/privacy')
      .set(owner.auth)
      .expect(200);
    expect(got.body.data).toMatchObject({
      callFrom: 'contacts',
      callFromAudiences: ['contacts', 'following'],
      lastSeenAudiences: ['nobody'],
    });
    // A row the new server already wrote is left alone.
    await api()
      .patch('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ callFromAudiences: ['followers'] })
      .expect(200);
    await prisma.$executeRawUnsafe(update);
    expect(
      (
        await prisma.userPrivacySettings.findUniqueOrThrow({
          where: { user_id: owner.id },
        })
      ).call_from_mask,
    ).toBe(2);
  });
});
