import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20 (WhatsApp): the two grey ticks. The receiving device says
 * where it is (POST /conversations/:id/delivered); the pointer only moves
 * forward, the sender hears it, reading counts as delivered, and a chat list
 * pull by the recipient delivers what is waiting.
 */
jest.setTimeout(120_000);

describe('Delivery receipts (e2e, owner 2026-10-20)', () => {
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
      where: { code: 'delivered_e2e' },
      create: {
        code: 'delivered_e2e',
        name_en: 'Voice e2e',
        i18n_key: 'practice.delivered_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'delivered_e2e.leaf' },
      create: {
        code: 'delivered_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.delivered_e2e.leaf',
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

  const send = async (c: Awaited<ReturnType<typeof chat>>, body: string) => {
    const res = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .send({ clientMessageId: randomUUID(), body })
      .expect(201);
    return res.body.data as { id: string };
  };
  const counterpart = async (c: Awaited<ReturnType<typeof chat>>) => {
    const res = await api()
      .get(`/api/v1/conversations/${c.id}`)
      .set(c.attorney.auth)
      .expect(200);
    return res.body.data as {
      counterpartLastDeliveredMessageId: string | null;
      counterpartLastReadMessageId: string | null;
    };
  };

  it('delivered moves forward only, is idempotent and shows to the sender', async () => {
    const c = await chat();
    const m1 = await send(c, 'one');
    const m2 = await send(c, 'two');
    expect((await counterpart(c)).counterpartLastDeliveredMessageId).toBeNull();

    await api()
      .post(`/api/v1/conversations/${c.id}/delivered`)
      .set(c.client.auth)
      .send({ lastDeliveredMessageId: m2.id })
      .expect(200)
      .expect((r) => expect(r.body.data.lastDeliveredMessageId).toBe(m2.id));
    expect((await counterpart(c)).counterpartLastDeliveredMessageId).toBe(
      m2.id,
    );
    // An older ack (a late retry) never moves it back.
    await api()
      .post(`/api/v1/conversations/${c.id}/delivered`)
      .set(c.client.auth)
      .send({ lastDeliveredMessageId: m1.id })
      .expect(200)
      .expect((r) => expect(r.body.data.lastDeliveredMessageId).toBe(m2.id));
    expect((await counterpart(c)).counterpartLastDeliveredMessageId).toBe(
      m2.id,
    );
  });

  it('a message of another chat is refused', async () => {
    const c = await chat();
    await api()
      .post(`/api/v1/conversations/${c.id}/delivered`)
      .set(c.client.auth)
      .send({ lastDeliveredMessageId: randomUUID() })
      .expect(404);
  });

  it('reading a message also delivers it', async () => {
    const c = await chat();
    const m1 = await send(c, 'one');
    await api()
      .post(`/api/v1/conversations/${c.id}/read`)
      .set(c.client.auth)
      .send({ lastReadMessageId: m1.id })
      .expect(200);
    const s = await counterpart(c);
    expect(s.counterpartLastReadMessageId).toBe(m1.id);
    expect(s.counterpartLastDeliveredMessageId).toBe(m1.id);
  });

  it('the recipient pulling the chat list delivers what is waiting', async () => {
    const c = await chat();
    const m1 = await send(c, 'hello');
    await api().get('/api/v1/conversations').set(c.client.auth).expect(200);
    // The pointer is written right after the list is built.
    for (let i = 0; i < 20; i++) {
      if ((await counterpart(c)).counterpartLastDeliveredMessageId) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect((await counterpart(c)).counterpartLastDeliveredMessageId).toBe(
      m1.id,
    );
  });
});
