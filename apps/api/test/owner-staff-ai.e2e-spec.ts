/* eslint-disable @typescript-eslint/no-base-to-string */
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SecretsService } from '../src/common/secrets/secrets.service';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { STAFF_AI_FETCH } from '../src/modules/staff-ai/staff-ai-client.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T12 (AI mode, OFF by default): the desk hint and the
 * recommendation text answer 404 while their switch is off, never call the
 * model, and — once the owner switches them on — answer only inside the
 * caller's rights. The Claude API is mocked at the transport.
 * (The `desk` URL segment is not mapped to a staff area yet — that is the
 * desk tasks' job (T3/T4) — so the guard still lets only the owner in; the
 * role scoping inside the services is covered by the unit specs, and the
 * moderator checks below hold either way.)
 */
jest.setTimeout(120_000);

describe('Staff AI mode routes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const calls: Array<{ url: string; body: string }> = [];

  const mockFetch = (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, body: String(init.body ?? '') });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                suggestion: 'reply',
                reason: 'Клиент ждёт ответа.',
                confidence: 81,
              }),
            },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 900, output_tokens: 60 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STAFF_AI_FETCH)
      .useValue(mockFetch)
      .compile();
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
    // A key as if saved in «Ключи и сервисы» (never a real one).
    const secrets = app.get(SecretsService);
    const original = secrets.field.bind(secrets);
    jest
      .spyOn(secrets, 'field')
      .mockImplementation((provider: string, name: string) =>
        provider === 'anthropic'
          ? Promise.resolve('sk-ant-e2e-0000000000000000')
          : original(provider, name),
      );
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  async function setSwitch(owner: AdminSession, key: string, value: boolean) {
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(owner.auth)
      .send({ code: totpCode(owner.totpSecret, Date.now() + 30_000) })
      .expect(200);
    await api()
      .put(`/api/v1/admin/config/${key}`)
      .set(owner.auth)
      .send({ value })
      .expect(200);
  }

  it('off by default: both routes are 404 for everyone and the model is never called', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const id = randomUUID();
    await api()
      .get(`/api/v1/admin/desk/ai/hint/support_ticket/${id}`)
      .set(owner.auth)
      .expect(404);
    await api()
      .get(`/api/v1/admin/desk/ai/summary/${id}`)
      .set(owner.auth)
      .expect(404);
    expect(calls).toHaveLength(0);
  });

  it('a sub-switch without the master switch is still off', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    await setSwitch(owner, 'staff.ai_hint_enabled', true);
    await api()
      .get(`/api/v1/admin/desk/ai/hint/support_ticket/${randomUUID()}`)
      .set(owner.auth)
      .expect(404);
    expect(calls).toHaveLength(0);
    await setSwitch(owner, 'staff.ai_hint_enabled', false);
  });

  it('on: the hint is scoped to the role, one mocked call, cached; off again → 404', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const moderator = await adminSession(base, prisma, 'moderator');
    const client = await prisma.user.create({
      data: {
        role: 'client',
        email: `cl_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
        ui_language: 'ru',
      },
    });
    const ticket = await prisma.supportTicket.create({
      data: {
        user_id: client.id,
        subject: 'Refund question for jane@mail.com',
        category: 'billing',
      },
    });
    await prisma.supportMessage.create({
      data: {
        ticket_id: ticket.id,
        author_user_id: client.id,
        body: 'Please call me on +1 (218) 551-6788 about my refund',
      },
    });
    await setSwitch(owner, 'staff.ai_enabled', true);
    await setSwitch(owner, 'staff.ai_hint_enabled', true);

    const path = `/api/v1/admin/desk/ai/hint/support_ticket/${ticket.id}`;
    // Not the moderator's queue kind (and the desk area is not theirs yet): 404, nothing called.
    await api().get(path).set(moderator.auth).expect(404);
    expect(calls).toHaveLength(0);
    // Unknown queue kind: 404.
    await api()
      .get(`/api/v1/admin/desk/ai/hint/refund/${ticket.id}`)
      .set(owner.auth)
      .expect(404);

    const first = await api().get(path).set(owner.auth).expect(200);
    expect(first.body.data).toMatchObject({
      available: true,
      suggestion: 'reply',
      confidence: 81,
      cached: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].body).not.toMatch(/jane@mail\.com|551-6788/);
    expect(calls[0].body).toContain('refund');

    const second = await api().get(path).set(owner.auth).expect(200);
    expect(second.body.data).toMatchObject({ available: true, cached: true });
    expect(calls).toHaveLength(1);

    // A ticket that does not exist is not an error: just no hint.
    const none = await api()
      .get(`/api/v1/admin/desk/ai/hint/support_ticket/${randomUUID()}`)
      .set(owner.auth)
      .expect(200);
    expect(none.body.data).toMatchObject({
      available: false,
      unavailable: 'no_context',
    });

    await setSwitch(owner, 'staff.ai_hint_enabled', false);
    await api().get(path).set(owner.auth).expect(404);
    expect(calls).toHaveLength(1);
    await setSwitch(owner, 'staff.ai_enabled', false);
  });

  it('the recommendation text: the owner reads it, a plain moderator gets 404, no template = none', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const moderator = await adminSession(base, prisma, 'moderator');
    await setSwitch(owner, 'staff.ai_enabled', true);
    await setSwitch(owner, 'staff.ai_summary_enabled', true);
    const sg = await prisma.staffSuggestion.create({
      data: {
        admin_id: moderator.userId,
        kind: 'retrain',
        snapshot_date: new Date('2026-10-26'),
        evidence: { note: 'x' },
      },
    });
    const res = await api()
      .get(`/api/v1/admin/desk/ai/summary/${sg.id}`)
      .set(owner.auth)
      .expect(200);
    expect(res.body.data).toMatchObject({
      available: false,
      source: 'none',
      text: null,
    });
    await api()
      .get(`/api/v1/admin/desk/ai/summary/${sg.id}`)
      .set(moderator.auth)
      .expect(404);
    await api()
      .get(`/api/v1/admin/desk/ai/summary/${randomUUID()}`)
      .set(owner.auth)
      .expect(404);
    await setSwitch(owner, 'staff.ai_summary_enabled', false);
    await api()
      .get(`/api/v1/admin/desk/ai/summary/${sg.id}`)
      .set(owner.auth)
      .expect(404);
    await setSwitch(owner, 'staff.ai_enabled', false);
  });
});
