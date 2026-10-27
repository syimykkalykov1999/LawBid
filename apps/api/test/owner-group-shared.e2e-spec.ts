import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { acceptInvites } from './support/group-invites';

/**
 * Owner 2026-10-21 (Telegram «shared media»): GET /groups/:id/shared —
 * photos and videos, files, links, voice notes; members only, newest first,
 * paged by cursor.
 */
jest.setTimeout(120_000);

describe('Group shared media (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const person = (first: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Group' },
    });
  const cmid = () => randomUUID();

  async function makeGroup() {
    const [owner, ann, cy] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Cy'),
    ]);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Media', type: 'closed', memberIds: [ann.id] })
      .expect(201);
    await acceptInvites(api, bearer, res.body.data.id as string, [ann.id]);
    return { owner, ann, cy, id: res.body.data.id as string };
  }

  let t = Date.parse('2026-10-01T10:00:00Z');
  async function put(
    groupId: string,
    senderId: string,
    kind: 'text' | 'attachment',
    opts: { body?: string; mime?: string; name?: string } = {},
  ) {
    let fileId: string | undefined;
    if (kind === 'attachment') {
      const f = await prisma.file.create({
        data: {
          owner_user_id: senderId,
          purpose: 'chat_attachment',
          s3_bucket: 'b',
          s3_key: `k/${randomUUID()}`,
          mime: opts.mime ?? 'image/jpeg',
          size_bytes: 10,
          sha256: randomUUID().replace(/-/g, ''),
        },
      });
      fileId = f.id;
    }
    t += 1000;
    return prisma.chatGroupMessage.create({
      data: {
        group_id: groupId,
        sender_id: senderId,
        type: kind,
        body: opts.body ?? '',
        client_message_id: cmid(),
        file_id: fileId,
        file_name: opts.name,
        created_at: new Date(t),
      },
    });
  }

  const shared = (uid: string, id: string, qs: string) =>
    api().get(`/api/v1/groups/${id}/shared?${qs}`).set(bearer(uid));
  const ids = (res: request.Response): string[] =>
    (res.body.data as { id: string }[]).map((m) => m.id);

  it('splits the group into media, files, links and voice; newest first', async () => {
    const { owner, ann, id } = await makeGroup();
    const photo = await put(id, ann.id, 'attachment', { mime: 'image/jpeg' });
    const pdf = await put(id, ann.id, 'attachment', {
      mime: 'application/pdf',
      name: 'a.pdf',
    });
    const video = await put(id, owner.id, 'attachment', { mime: 'video/mp4' });
    const voice = await put(id, owner.id, 'attachment', { mime: 'audio/ogg' });
    const link = await put(id, ann.id, 'text', {
      body: 'see https://lawbid.dev/x',
    });
    await put(id, ann.id, 'text', { body: 'plain words' });

    const media = await shared(ann.id, id, 'kind=media').expect(200);
    expect(ids(media)).toEqual([video.id, photo.id]);
    const files = await shared(ann.id, id, 'kind=files').expect(200);
    expect(ids(files)).toEqual([pdf.id]);
    const voices = await shared(ann.id, id, 'kind=voice').expect(200);
    expect(ids(voices)).toEqual([voice.id]);
    const links = await shared(ann.id, id, 'kind=links').expect(200);
    expect(ids(links)).toEqual([link.id]);
  });

  it('pages by cursor, skips deleted rows, refuses strangers and bad kinds', async () => {
    const { ann, cy, id } = await makeGroup();
    const made = [];
    for (let i = 0; i < 5; i++) {
      made.push(await put(id, ann.id, 'attachment', { mime: 'image/png' }));
    }
    await prisma.chatGroupMessage.updateMany({
      where: { id: made[4].id },
      data: { deleted_at: new Date() },
    });
    const first = await shared(ann.id, id, 'kind=media&limit=2').expect(200);
    expect(ids(first)).toEqual([made[3].id, made[2].id]);
    const cursor = first.body.meta.nextCursor;
    expect(cursor).toBeTruthy();
    const second = await shared(
      ann.id,
      id,
      `kind=media&limit=2&cursor=${encodeURIComponent(cursor as string)}`,
    ).expect(200);
    expect(ids(second)).toEqual([made[1].id, made[0].id]);
    expect(second.body.meta.nextCursor).toBeFalsy();

    await shared(cy.id, id, 'kind=media').expect(404);
    await shared(ann.id, id, 'kind=gifs').expect(400);
  });
});
