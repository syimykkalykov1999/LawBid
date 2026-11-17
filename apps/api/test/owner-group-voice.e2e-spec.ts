import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Groups WhatsApp parity (voice): a voice note in a group, the 1:1 chat's
 * rules (owner-chat-voice.e2e-spec.ts) — a clean `chat_voice` file of the
 * sender, 0.5 s … 15 min, 0–100 bars, one file one message, shown to every
 * member with its length and bars; a voice note is media (an admin-only
 * media group refuses a member's note).
 */
jest.setTimeout(120_000);

describe('Group voice messages (e2e)', () => {
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
      data: { role: 'client', first_name: first, last_name: 'Voice' },
    });

  /** A scanned voice note of [ownerId] (the upload itself is covered by
   * owner-chat-voice.e2e-spec.ts). */
  async function voiceFile(
    ownerId: string,
    purpose: 'chat_voice' | 'chat_attachment' = 'chat_voice',
  ): Promise<string> {
    const id = randomUUID();
    await prisma.file.create({
      data: {
        id,
        owner_user_id: ownerId,
        purpose,
        s3_bucket: 'documents',
        s3_key: `chat/${id}.m4a`,
        mime: 'audio/mp4',
        size_bytes: BigInt(2048),
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
      },
    });
    return id;
  }

  async function makeGroup() {
    const [owner, ann] = await Promise.all([person('Olga'), person('Ann')]);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Voice', type: 'closed', memberIds: [ann.id] })
      .expect(201);
    const id = res.body.data.id as string;
    const list = await api()
      .get('/api/v1/groups/invites')
      .set(bearer(ann.id))
      .expect(200);
    const invite = (list.body.data as { id: string; groupId: string }[]).find(
      (i) => i.groupId === id,
    );
    await api()
      .post(`/api/v1/groups/invites/${invite!.id}/accept`)
      .set(bearer(ann.id))
      .expect(200);
    return { owner, ann, id };
  }

  const sendVoice = (
    groupId: string,
    userId: string,
    extra: Record<string, unknown>,
  ) =>
    api()
      .post(`/api/v1/groups/${groupId}/messages`)
      .set(bearer(userId))
      .send({ clientMessageId: randomUUID(), type: 'voice', ...extra });

  it('a member sends a note: type voice, length and bars, for every member', async () => {
    const { owner, ann, id } = await makeGroup();
    const fileId = await voiceFile(owner.id);
    const sent = await sendVoice(id, owner.id, {
      fileId,
      durationMs: 4200,
      waveform: [0, 35, 100, 60],
    }).expect(201);
    const m = sent.body.data;
    expect(m.type).toBe('voice');
    expect(m.body).toBe('');
    expect(m.attachment).toBeNull();
    expect(m.voice).toMatchObject({
      durationMs: 4200,
      waveform: [0, 35, 100, 60],
      listened: false,
    });
    const row = await prisma.chatGroupMessage.findFirst({
      where: { id: m.id, group_id: id },
    });
    expect(row).toMatchObject({
      type: 'voice',
      file_id: fileId,
      duration_ms: 4200,
      waveform: [0, 35, 100, 60],
    });
    // Ann's page shows the same note.
    const page = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .expect(200);
    const seen = (
      page.body.data as { id: string; voice: unknown; mine: boolean }[]
    ).find((x) => x.id === m.id);
    expect(seen).toMatchObject({
      mine: false,
      voice: { durationMs: 4200, waveform: [0, 35, 100, 60] },
    });
    // The same clientMessageId sent again returns the same message.
    const again = await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(owner.id))
      .send({
        clientMessageId: m.clientMessageId,
        type: 'voice',
        fileId,
        durationMs: 4200,
      })
      .expect(201);
    expect(again.body.data.id).toBe(m.id);
  });

  it('the 1:1 rules: own clean chat_voice file, length limits, one file one message', async () => {
    const { owner, ann, id } = await makeGroup();
    const fileId = await voiceFile(owner.id);
    // No length, too short, too many bars, a bar over 100.
    await sendVoice(id, owner.id, { fileId }).expect(400);
    await sendVoice(id, owner.id, { fileId, durationMs: 100 }).expect(400);
    await sendVoice(id, owner.id, {
      fileId,
      durationMs: 1000,
      waveform: Array.from({ length: 101 }, () => 1),
    }).expect(400);
    await sendVoice(id, owner.id, {
      fileId,
      durationMs: 1000,
      waveform: [101],
    }).expect(400);
    // Someone else's file is not mine to send; a document is not a note.
    await sendVoice(id, ann.id, { fileId, durationMs: 1000 }).expect(404);
    const doc = await voiceFile(owner.id, 'chat_attachment');
    await sendVoice(id, owner.id, { fileId: doc, durationMs: 1000 }).expect(
      409,
    );
    // Sent once; a second message with the same file is refused.
    await sendVoice(id, owner.id, { fileId, durationMs: 1000 }).expect(201);
    const reused = await sendVoice(id, owner.id, {
      fileId,
      durationMs: 1000,
    }).expect(409);
    expect(reused.body.error.code).toBe('FILE_NOT_ATTACHABLE');
  });

  it('a voice note is media: where only admins send media a member is refused', async () => {
    const { owner, ann, id } = await makeGroup();
    await prisma.chatGroup.update({
      where: { id },
      data: { who_can_media: 'admins' },
    });
    await sendVoice(id, ann.id, {
      fileId: await voiceFile(ann.id),
      durationMs: 1000,
    }).expect(403);
    // The admin still can.
    await sendVoice(id, owner.id, {
      fileId: await voiceFile(owner.id),
      durationMs: 1000,
    }).expect(201);
  });
});
