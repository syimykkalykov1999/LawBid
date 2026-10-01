import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-01: Instagram-like chat folders — All · Primary (case
 * chats by default) · General · Waiting · Requests; move a chat between
 * folders, mark it "waiting for my answer" with a pinned note, pin it to
 * the top. Everything is per member.
 */
jest.setTimeout(120_000);

describe('Chat folders (e2e, owner 2026-10-01)', () => {
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
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: `s-${id}`,
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function chat(
    attorneyId: string,
    clientId: string,
    caseId: string | null,
    at: Date,
  ) {
    const conv = await prisma.conversation.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        client_id: clientId,
        status: 'active',
        request_status: caseId ? 'none' : 'accepted',
        participants: {
          create: [{ user_id: attorneyId }, { user_id: clientId }],
        },
      },
    });
    const m = await prisma.message.create({
      data: {
        conversation_id: conv.id,
        sender_id: clientId,
        type: 'text',
        body_original: 'Hello',
        body_display: 'Hello',
        client_message_id: `m-${conv.id}`,
        created_at: at,
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message_at: at, last_message_id: m.id },
    });
    return conv.id;
  }

  it('folders, waiting with a note, moving and pinning', async () => {
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const c1 = await prisma.user.create({ data: { role: 'client' } });
    const c2 = await prisma.user.create({ data: { role: 'client' } });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.findFirstOrThrow({
      where: { code: 'family_law' },
    });
    const kase = await prisma.case.create({
      data: {
        client_id: c1.id,
        title: 'Custody',
        description: 'Custody question',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
      },
    });
    const caseChat = await chat(
      att.id,
      c1.id,
      kase.id,
      new Date(Date.now() - 60_000),
    );
    const direct = await chat(att.id, c2.id, null, new Date());
    const auth = bearer(att.id, 'attorney');
    const ids = async (folder: string): Promise<string[]> => {
      const res = await api()
        .get(`/api/v1/conversations?folder=${folder}`)
        .set(auth)
        .expect(200);
      const body = res.body as { data: { id: string }[] };
      return body.data.map((x) => x.id);
    };

    expect(await ids('all')).toEqual([direct, caseChat]);
    // A case chat is Primary (a client), a direct chat General.
    expect(await ids('primary')).toEqual([caseChat]);
    expect(await ids('general')).toEqual([direct]);
    expect(await ids('waiting')).toEqual([]);

    // "I'll check and come back": waiting + a note visible in the list.
    const w = await api()
      .patch(`/api/v1/conversations/${direct}/organize`)
      .set(auth)
      .send({ waiting: true, note: 'Send him the retainer documents' })
      .expect(200);
    expect(w.body.data).toMatchObject({
      note: 'Send him the retainer documents',
      folder: 'general',
      folderAuto: true,
    });
    expect(w.body.data.waitingSince).toBeTruthy();
    expect(await ids('waiting')).toEqual([direct]);
    const counts = await api()
      .get('/api/v1/conversations/folders/counts')
      .set(auth)
      .expect(200);
    expect(counts.body.data).toEqual({ waiting: 1, requests: 0 });

    // Move the direct chat to Primary; pin the case chat to the top.
    await api()
      .patch(`/api/v1/conversations/${direct}/organize`)
      .set(auth)
      .send({ folder: 'primary' })
      .expect(200);
    await api()
      .patch(`/api/v1/conversations/${caseChat}/organize`)
      .set(auth)
      .send({ pinned: true })
      .expect(200);
    expect(await ids('primary')).toEqual([caseChat, direct]);
    expect(await ids('general')).toEqual([]);

    // Done: waiting and the note cleared; the client's view is untouched.
    const done = await api()
      .patch(`/api/v1/conversations/${direct}/organize`)
      .set(auth)
      .send({ waiting: false, note: '' })
      .expect(200);
    expect(done.body.data).toMatchObject({ waitingSince: null, note: null });
    expect(await ids('waiting')).toEqual([]);
    const theirs = await api()
      .get(`/api/v1/conversations/${caseChat}`)
      .set(bearer(c1.id, 'client'))
      .expect(200);
    expect(theirs.body.data).toMatchObject({
      pinnedAt: null,
      folder: 'primary',
    });

    // Not my chat → 404; a too-long note → 400.
    await api()
      .patch(`/api/v1/conversations/${direct}/organize`)
      .set(bearer(c1.id, 'client'))
      .send({ pinned: true })
      .expect(404);
    await api()
      .patch(`/api/v1/conversations/${direct}/organize`)
      .set(auth)
      .send({ note: 'x'.repeat(281) })
      .expect(400);
  });
});
