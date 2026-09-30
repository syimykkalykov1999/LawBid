import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * OQ-040 (owner 2026-09-30): voice messages in chats, like Telegram — a
 * clean `chat_voice` m4a of the sender, 0.5 s … 15 min, waveform bars;
 * only the two members get the signed link; the recipient's first play
 * marks it listened; a note is sent once.
 */
jest.setTimeout(120_000);

describe('Chat voice messages (e2e, OQ-040)', () => {
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
  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });
  const audio = readFileSync(join(__dirname, 'fixtures/sample.m4a'));

  async function chat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Vera', last_name: 'Voice' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Otto', last_name: 'Audio' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `voice_${attorney.id.slice(0, 8)}`,
        username_lower: `voice_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: attorney.id, status: 'active', price_cents: 39900 },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'voice_e2e' },
      create: {
        code: 'voice_e2e',
        name_en: 'Voice e2e',
        i18n_key: 'practice.voice_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'voice_e2e.leaf' },
      create: {
        code: 'voice_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.voice_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Voice case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    return {
      id: conv.id,
      client: { id: client.id, auth: bearer(client.id, 'client') },
      attorney: { id: attorney.id, auth: bearer(attorney.id, 'attorney') },
    };
  }

  /** presign → MinIO → confirm → clean; returns the file id. */
  async function voiceFile(auth: Record<string, string>): Promise<string> {
    const pre = await api()
      .post('/api/v1/files/presign')
      .set(auth)
      .send({
        purpose: 'chat_voice',
        mime: 'audio/mp4',
        sizeBytes: audio.length,
        sha256: createHash('sha256').update(audio).digest('hex'),
      })
      .expect(201);
    const p = pre.body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append(
      'file',
      new Blob([new Uint8Array(audio)], { type: 'audio/mp4' }),
    );
    const up = await fetch(p.upload.url, { method: 'POST', body: form });
    expect(up.status).toBe(204);
    await api().post(`/api/v1/files/${p.fileId}/confirm`).set(auth).expect(200);
    for (let i = 0; i < 100; i += 1) {
      const f = await api()
        .get(`/api/v1/files/${p.fileId}`)
        .set(auth)
        .expect(200);
      const status = (f.body.data as { scanStatus: string }).scanStatus;
      if (status === 'clean') return p.fileId;
      if (status !== 'pending') throw new Error(`scan ${status}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('scan did not finish');
  }

  it('sends, lists with a signed link, marks listened once, never re-sends', async () => {
    const c = await chat();
    const fileId = await voiceFile(c.client.auth);

    // Missing duration → 400.
    await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .send({ clientMessageId: randomUUID(), type: 'voice', fileId })
      .expect(400);

    const sent = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'voice',
        fileId,
        durationMs: 2400,
        waveform: [3, 40, 90, 55, 10],
      })
      .expect(201);
    const msg = sent.body.data as {
      id: string;
      type: string;
      voice: {
        url: string;
        durationMs: number;
        waveform: number[];
        listened: boolean;
      };
    };
    expect(msg.type).toBe('voice');
    expect(msg.voice.durationMs).toBe(2400);
    expect(msg.voice.waveform).toEqual([3, 40, 90, 55, 10]);
    expect(msg.voice.listened).toBe(false);
    expect(msg.voice.url).toMatch(/^https?:\/\//);
    // The link really serves the audio.
    expect((await fetch(msg.voice.url)).status).toBe(200);

    // The same note cannot be sent again.
    await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'voice',
        fileId,
        durationMs: 2400,
      })
      .expect(409);

    // The attorney sees it with a link; the list preview has no link.
    const list = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .expect(200);
    const seen = (
      list.body.data as { id: string; voice: { url: string } }[]
    ).find((m) => m.id === msg.id)!;
    expect(seen.voice.url).toMatch(/^https?:\/\//);
    const convs = await api()
      .get('/api/v1/conversations')
      .set(c.attorney.auth)
      .expect(200);
    const row = (
      convs.body.data as {
        id: string;
        lastMessage: { type: string; voice: { url: string | null } };
      }[]
    ).find((x) => x.id === c.id)!;
    expect(row.lastMessage.type).toBe('voice');
    expect(row.lastMessage.voice.url).toBeNull();

    // The sender's own play does not count; the recipient's does.
    const own = await api()
      .post(`/api/v1/conversations/${c.id}/messages/${msg.id}/listened`)
      .set(c.client.auth)
      .expect(200);
    expect(own.body.data.voice.listened).toBe(false);
    const heard = await api()
      .post(`/api/v1/conversations/${c.id}/messages/${msg.id}/listened`)
      .set(c.attorney.auth)
      .expect(200);
    expect(heard.body.data.voice.listened).toBe(true);

    // Strangers get 404 on the chat.
    const stranger = await prisma.user.create({
      data: { role: 'client', first_name: 'No', last_name: 'Body' },
    });
    await api()
      .post(`/api/v1/conversations/${c.id}/messages/${msg.id}/listened`)
      .set(bearer(stranger.id, 'client'))
      .expect(404);
  });

  it('only the sender can attach their note', async () => {
    const c = await chat();
    const fileId = await voiceFile(c.client.auth);
    await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'voice',
        fileId,
        durationMs: 1000,
      })
      .expect(404);
  });
});
