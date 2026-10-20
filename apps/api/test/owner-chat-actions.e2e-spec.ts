import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20 (WhatsApp / Telegram): edit within a window (edited
 * mark, kept originals), delete for me / for everyone (window, tombstone),
 * reply quotes, forwarded label, one emoji reaction each, at most 3 pins.
 */
jest.setTimeout(120_000);

describe('Chat message actions (e2e, owner 2026-10-20)', () => {
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

  const send = async (
    c: Awaited<ReturnType<typeof chat>>,
    who: 'client' | 'attorney',
    body: string,
    extra: Record<string, unknown> = {},
  ) => {
    const res = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c[who].auth)
      .send({ clientMessageId: randomUUID(), body, ...extra })
      .expect(201);
    return res.body.data as { id: string };
  };
  const list = async (
    c: Awaited<ReturnType<typeof chat>>,
    who: 'client' | 'attorney',
  ) => {
    const res = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c[who].auth)
      .expect(200);
    return res.body.data as {
      id: string;
      body: string;
      revoked: boolean;
      editedAt: string | null;
      forwarded: boolean;
      pinned: boolean;
      replyTo: { id: string; snippet: string } | null;
      reactions: { emoji: string; count: number; mine: boolean }[];
    }[];
  };
  const url = (c: { id: string }, m: string, tail = '') =>
    `/api/v1/conversations/${c.id}/messages/${m}${tail}`;

  it('edits within the window, marks it edited and keeps the original', async () => {
    const c = await chat();
    const m = await send(c, 'client', 'first text');
    const res = await api()
      .patch(url(c, m.id))
      .set(c.client.auth)
      .send({ body: 'second text' })
      .expect(200);
    expect(res.body.data.body).toBe('second text');
    expect(res.body.data.editedAt).not.toBeNull();
    const seen = (await list(c, 'attorney')).find((x) => x.id === m.id);
    expect(seen?.body).toBe('second text');
    expect(
      await prisma.messageEdit.count({ where: { message_id: m.id } }),
    ).toBe(1);
    // The other side cannot edit it.
    await api()
      .patch(url(c, m.id))
      .set(c.attorney.auth)
      .send({ body: 'hijack' })
      .expect(403);
    // After the window: refused.
    await prisma.message.update({
      where: { id: m.id },
      data: { created_at: new Date(Date.now() - 20 * 60_000) },
    });
    await api()
      .patch(url(c, m.id))
      .set(c.client.auth)
      .send({ body: 'late' })
      .expect(409);
  });

  it('deletes for me only and for everyone inside the window', async () => {
    const c = await chat();
    const a = await send(c, 'client', 'mine to hide');
    await api()
      .delete(url(c, a.id) + '?scope=me')
      .set(c.client.auth)
      .expect(204);
    expect((await list(c, 'client')).some((x) => x.id === a.id)).toBe(false);
    expect((await list(c, 'attorney')).some((x) => x.id === a.id)).toBe(true);

    const b = await send(c, 'client', 'gone for all');
    await api()
      .delete(url(c, b.id) + '?scope=all')
      .set(c.attorney.auth)
      .expect(403);
    await api()
      .delete(url(c, b.id) + '?scope=all')
      .set(c.client.auth)
      .expect(204);
    const seen = (await list(c, 'attorney')).find((x) => x.id === b.id);
    expect(seen?.revoked).toBe(true);
    expect(seen?.body).toBe('');

    const old = await send(c, 'client', 'too old');
    await prisma.message.update({
      where: { id: old.id },
      data: { created_at: new Date(Date.now() - 49 * 3_600_000) },
    });
    await api()
      .delete(url(c, old.id) + '?scope=all')
      .set(c.client.auth)
      .expect(409);
  });

  it('replies quote, forwards are labelled, reactions replace each other', async () => {
    const c = await chat();
    const q = await send(c, 'attorney', 'the quoted line');
    const r = await send(c, 'client', 'answer', { replyToId: q.id });
    const f = await send(c, 'client', 'passed on', { forwarded: true });
    const rows = await list(c, 'attorney');
    expect(rows.find((x) => x.id === r.id)?.replyTo?.snippet).toBe(
      'the quoted line',
    );
    expect(rows.find((x) => x.id === f.id)?.forwarded).toBe(true);

    await api()
      .put(url(c, q.id, '/reaction'))
      .set(c.client.auth)
      .send({ emoji: '👍' })
      .expect(200);
    await api()
      .put(url(c, q.id, '/reaction'))
      .set(c.client.auth)
      .send({ emoji: '❤️' })
      .expect(200);
    await api()
      .put(url(c, q.id, '/reaction'))
      .set(c.attorney.auth)
      .send({ emoji: '❤️' })
      .expect(200);
    const mine = (await list(c, 'client')).find((x) => x.id === q.id);
    expect(mine?.reactions).toEqual([{ emoji: '❤️', count: 2, mine: true }]);
    await api()
      .put(url(c, q.id, '/reaction'))
      .set(c.client.auth)
      .send({ emoji: 'abc' })
      .expect(400);
    await api()
      .put(url(c, q.id, '/reaction'))
      .set(c.client.auth)
      .send({ emoji: null })
      .expect(200);
    const after = (await list(c, 'attorney')).find((x) => x.id === q.id);
    expect(after?.reactions).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
  });

  it('pins at most three per chat and lists them', async () => {
    const c = await chat();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await send(c, 'client', `m${i}`)).id);
    for (const id of ids.slice(0, 3)) {
      await api()
        .post(url(c, id, '/pin'))
        .set(c.attorney.auth)
        .expect(200);
    }
    await api()
      .post(url(c, ids[3], '/pin'))
      .set(c.attorney.auth)
      .expect(409);
    const pins = await api()
      .get(`/api/v1/conversations/${c.id}/pins`)
      .set(c.client.auth)
      .expect(200);
    expect(pins.body.data.items).toHaveLength(3);
    await api()
      .delete(url(c, ids[0], '/pin'))
      .set(c.client.auth)
      .expect(200);
    await api()
      .post(url(c, ids[3], '/pin'))
      .set(c.client.auth)
      .expect(200);
    // A message deleted for everyone leaves the pins.
    await api()
      .delete(url(c, ids[1]) + '?scope=all')
      .set(c.client.auth)
      .expect(204);
    const left = await api()
      .get(`/api/v1/conversations/${c.id}/pins`)
      .set(c.attorney.auth)
      .expect(200);
    expect(left.body.data.items).toHaveLength(2);
  });
});
