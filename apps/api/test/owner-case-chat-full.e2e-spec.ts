import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FilesService } from '../src/modules/files/files.service';

/**
 * Owner 24.11 (prod): «в кейсовских чатах пропали отправки файлов, фото…»
 * and «не показываются аватарки после того как приняли биды». Since R-404
 * (one person = one row) the Chats row of a person the user only works with
 * on a case opens the direct chat with them (POST /conversations/direct).
 * That chat was created as a message request with contacts locked — no
 * files, no camera, no calls, the answer waiting in «Requests» — although
 * the two already work together on an accepted case. Like Upwork / Fiverr
 * order chats and Telegram (one person = one chat): once a bid is accepted
 * the pair is connected, every chat between them is a full chat.
 * Privacy before acceptance stays as it was.
 */
jest.setTimeout(120_000);

describe('Case chats after acceptance are full chats (e2e, owner 24.11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  let areaId = '';
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
    // The test storage serves no real links: a fixed one for avatars.
    link = jest
      .spyOn(
        FilesService.prototype as unknown as {
          mediaUrlOf: () => Promise<string | null>;
        },
        'mediaUrlOf',
      )
      .mockResolvedValue('https://media.test/a.jpg');
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_case_chat_full' },
      create: {
        code: 'e2e_case_chat_full',
        name_en: 'E2E case chat',
        i18n_key: 'practice.e2e_case_chat_full',
        sort: 1,
      },
      update: {},
    });
    areaId = area.id;
  });

  afterAll(async () => {
    link.mockRestore();
    await app.close();
  });

  const api = () => request(base);

  async function file(ownerId: string, purpose: 'avatar' | 'chat_attachment') {
    return prisma.file.create({
      data: {
        owner_user_id: ownerId,
        purpose,
        s3_bucket: process.env.S3_BUCKET_MEDIA ?? 'lawbid-media',
        s3_key: `${purpose}/${ownerId}/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        size_bytes: 10n,
        sha256: 'e'.repeat(64),
        width: 512,
        height: 512,
        scan_status: 'clean',
      },
    });
  }

  async function person(role: 'client' | 'attorney') {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: role === 'client' ? 'Clara' : 'Adam',
        last_name: 'Full',
      },
    });
    const avatar = await file(u.id, 'avatar');
    await prisma.user.update({
      where: { id: u.id },
      data: { avatar_file_id: avatar.id },
    });
    if (role === 'attorney') {
      const username = `full_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: areaId },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  /** A client's case with one bid from the attorney (accepted or not). */
  async function pair(accepted: boolean) {
    const client = await person('client');
    const attorney = await person('attorney');
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Lease dispute in Newark',
        description: 'The landlord keeps the deposit after I moved out.',
        practice_area_id: areaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: kase.id, state_code: 'NJ', is_primary: true },
    });
    const bid = await api()
      .post(`/api/v1/cases/${kase.id}/bids`)
      .set(attorney.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 60_000,
        message: 'I handle NJ deposit disputes every week, happy to help.',
        startAvailability: 'immediately',
      })
      .expect(201);
    const bidId = bid.body.data.id as string;
    if (accepted) await accept(client, bidId);
    return { client, attorney, caseId: kase.id, bidId };
  }

  const accept = (client: { auth: Record<string, string> }, bidId: string) =>
    api()
      .post(`/api/v1/bids/${bidId}/accept`)
      .set(client.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

  const direct = (auth: Record<string, string>, userId: string) =>
    api()
      .post('/api/v1/conversations/direct')
      .set(auth)
      .send({ userId })
      .expect(200);

  const sendFile = async (
    who: { id: string; auth: Record<string, string> },
    convId: string,
  ) => {
    const f = await file(who.id, 'chat_attachment');
    return api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(who.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'attachment',
        fileId: f.id,
        fileName: 'photo.jpg',
      });
  };

  const sendText = (
    auth: Record<string, string>,
    convId: string,
    body: string,
  ) =>
    api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(auth)
      .send({ clientMessageId: randomUUID(), body });

  it('the accepted case chat: both photos and names, files both ways', async () => {
    const p = await pair(true);
    for (const [me, other] of [
      [p.client, p.attorney],
      [p.attorney, p.client],
    ] as const) {
      const list = await api()
        .get('/api/v1/conversations?folder=cases')
        .set(me.auth)
        .expect(200);
      const row = (
        list.body.data as {
          caseId: string | null;
          contactsUnlocked: boolean;
          counterpart: { id: string | null; avatarUrl: string | null };
        }[]
      ).find((c) => c.caseId === p.caseId);
      expect(row).toMatchObject({
        contactsUnlocked: true,
        counterpart: { id: other.id, avatarUrl: expect.any(String) },
      });
    }
    const conv = await prisma.conversation.findFirstOrThrow({
      where: { case_id: p.caseId },
      select: { id: true },
    });
    expect((await sendFile(p.client, conv.id)).status).toBe(201);
    expect((await sendFile(p.attorney, conv.id)).status).toBe(201);
  });

  it('the Chats row of a working pair opens a full chat, not a request', async () => {
    const p = await pair(true);
    // The client taps the attorney's row (R-404 stand-in → direct chat).
    const open = await direct(p.client.auth, p.attorney.id);
    expect(open.body.data).toMatchObject({
      kind: 'direct',
      contactsUnlocked: true,
      requestStatus: 'accepted',
      counterpart: { id: p.attorney.id, avatarUrl: expect.any(String) },
    });
    const id = open.body.data.id as string;
    // Files, photos and more than one message from the opener at once.
    expect((await sendFile(p.client, id)).status).toBe(201);
    expect((await sendText(p.client.auth, id, 'Second one')).status).toBe(201);
    // The attorney gets it in the main list (not «Requests») and can send
    // files back; the attorney opening the same row gets the same chat.
    const main = await api().get('/api/v1/conversations').set(p.attorney.auth);
    expect((main.body.data as { id: string }[]).map((c) => c.id)).toContain(id);
    expect((await sendFile(p.attorney, id)).status).toBe(201);
    const back = await direct(p.attorney.auth, p.client.id);
    expect(back.body.data).toMatchObject({
      id,
      contactsUnlocked: true,
      counterpart: { id: p.client.id, avatarUrl: expect.any(String) },
    });
  });

  it('a request opened before the bid was accepted opens up on acceptance', async () => {
    const p = await pair(false);
    // Before acceptance the direct chat is a request (privacy unchanged).
    const before = await direct(p.client.auth, p.attorney.id);
    expect(before.body.data).toMatchObject({
      contactsUnlocked: false,
      requestStatus: 'pending',
    });
    const id = before.body.data.id as string;
    await sendText(p.client.auth, id, 'Hello before').expect(201);
    expect((await sendFile(p.client, id)).status).toBe(403);
    await accept(p.client, p.bidId);
    const after = await api()
      .get(`/api/v1/conversations/${id}`)
      .set(p.client.auth)
      .expect(200);
    expect(after.body.data).toMatchObject({
      contactsUnlocked: true,
      requestStatus: 'accepted',
    });
    expect((await sendFile(p.client, id)).status).toBe(201);
  });

  it('before acceptance the pair stays strangers: a request, no files', async () => {
    const p = await pair(false);
    const open = await direct(p.attorney.auth, p.client.id);
    expect(open.body.data).toMatchObject({
      contactsUnlocked: false,
      requestStatus: 'pending',
    });
    expect(
      (await sendFile(p.attorney, open.body.data.id as string)).status,
    ).toBe(403);
  });
});
