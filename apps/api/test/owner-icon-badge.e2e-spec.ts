import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { BadgesService } from '../src/modules/notifications/badges.service';

/**
 * Owner 2026-10-21 (inbox 29): «Счётчик на иконке в меню» — one switch on
 * the server, read by the bell's settings and Profile → Settings alike;
 * off, pushes put 0 on the app icon.
 */
jest.setTimeout(120_000);

describe('App icon badge switch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let badges: BadgesService;
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
    badges = app.get(BadgesService);
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

  it('defaults on, persists off, and the push badge follows', async () => {
    const me = await prisma.user.create({
      data: { role: 'client', first_name: 'Icon', last_name: 'Badge' },
    });
    await prisma.notification.create({
      data: {
        user_id: me.id,
        type: 'security_new_device',
        category: 'system',
        payload: {},
      },
    });
    const first = await api()
      .get('/api/v1/notification-settings')
      .set(bearer(me.id))
      .expect(200);
    expect(first.body.data.iconBadge).toBe(true);
    const b1 = await api().get('/api/v1/badges').set(bearer(me.id)).expect(200);
    expect(b1.body.data.iconBadge).toBe(true);
    expect(await badges.forIcon(me.id)).toBe(b1.body.data.total);
    expect(b1.body.data.total).toBeGreaterThan(0);

    const off = await api()
      .put('/api/v1/notification-settings/icon-badge')
      .set(bearer(me.id))
      .send({ enabled: false })
      .expect(200);
    expect(off.body.data.iconBadge).toBe(false);
    // The categories are untouched by the switch.
    expect(off.body.data.categories).toEqual(first.body.data.categories);
    const again = await api()
      .get('/api/v1/notification-settings')
      .set(bearer(me.id))
      .expect(200);
    expect(again.body.data.iconBadge).toBe(false);
    const b2 = await api().get('/api/v1/badges').set(bearer(me.id)).expect(200);
    expect(b2.body.data.iconBadge).toBe(false);
    // The in-app counters stay; only the icon is cleared.
    expect(b2.body.data.total).toBe(b1.body.data.total);
    expect(await badges.forIcon(me.id)).toBe(0);

    await api()
      .put('/api/v1/notification-settings/icon-badge')
      .set(bearer(me.id))
      .send({ enabled: 'nope' })
      .expect(400);
  });

  // Owner 2026-10-21 (inbox 30): a switch per kind of notification.
  it('kinds keep the old category choice, switch alone, system locked', async () => {
    const me = await prisma.user.create({
      data: { role: 'client', first_name: 'Topic', last_name: 'Switch' },
    });
    type Topic = { topic: string; pushEnabled: boolean; locked: boolean };
    const topics = async () => {
      const r = await api()
        .get('/api/v1/notification-settings')
        .set(bearer(me.id))
        .expect(200);
      return Object.fromEntries(
        (r.body.data.topics as Topic[]).map((t) => [t.topic, t]),
      );
    };
    // An earlier «Feed and follows» off carries over to its kinds.
    await api()
      .put('/api/v1/notification-settings')
      .set(bearer(me.id))
      .send({
        items: [{ category: 'social', pushEnabled: false, emailEnabled: true }],
      })
      .expect(200);
    let t = await topics();
    expect(t.likes.pushEnabled).toBe(false);
    expect(t.comments.pushEnabled).toBe(false);
    expect(t.bidNew.pushEnabled).toBe(true);
    expect(t.security.locked).toBe(true);

    await api()
      .put('/api/v1/notification-settings/topics')
      .set(bearer(me.id))
      .send({
        items: [
          { topic: 'comments', pushEnabled: true },
          { topic: 'messages', pushEnabled: false },
          { topic: 'assistants', pushEnabled: false },
        ],
      })
      .expect(200);
    t = await topics();
    expect(t.comments.pushEnabled).toBe(true);
    expect(t.likes.pushEnabled).toBe(false);
    expect(t.messages.pushEnabled).toBe(false);
    // The nested switches keep their own value under an off parent.
    expect(t.assistants.pushEnabled).toBe(false);
    expect(t.assistantTasks.pushEnabled).toBe(true);
    // A topic of an old category is that category's switch.
    const row = await prisma.notificationSetting.findUnique({
      where: { user_id_category: { user_id: me.id, category: 'messages' } },
    });
    expect(row?.push_enabled).toBe(false);
    const switches = await badges.topicSwitches(me.id);
    expect(switches.on('assistantTasks')).toBe(false);

    await api()
      .put('/api/v1/notification-settings/topics')
      .set(bearer(me.id))
      .send({ items: [{ topic: 'security', pushEnabled: false }] })
      .expect(400);
    await api()
      .put('/api/v1/notification-settings/topics')
      .set(bearer(me.id))
      .send({ items: [{ topic: 'nope', pushEnabled: false }] })
      .expect(400);
  });
  // Owner 2026-10-23: «Вопросы» (Q&A) notifications are opt-in, for old
  // users too: no stored value = off; the switch turns it on and off.
  it('Q&A notifications start off and follow the switch', async () => {
    const me = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Qa', last_name: 'Switch' },
    });
    const read = async () => {
      const r = await api()
        .get('/api/v1/notification-settings')
        .set(bearer(me.id))
        .expect(200);
      return (
        r.body.data.topics as { topic: string; pushEnabled: boolean }[]
      ).find((x) => x.topic === 'legalQa')!;
    };
    expect((await read()).pushEnabled).toBe(false);
    // Even an old «new cases» opt-in does not switch it on.
    await prisma.notificationSetting.create({
      data: { user_id: me.id, category: 'new_cases', push_enabled: true },
    });
    expect((await read()).pushEnabled).toBe(false);
    expect((await badges.topicSwitches(me.id)).on('legalQa')).toBe(false);
    await api()
      .put('/api/v1/notification-settings/topics')
      .set(bearer(me.id))
      .send({ items: [{ topic: 'legalQa', pushEnabled: true }] })
      .expect(200);
    expect((await read()).pushEnabled).toBe(true);
    expect((await badges.topicSwitches(me.id)).on('legalQa')).toBe(true);
    await api()
      .put('/api/v1/notification-settings/topics')
      .set(bearer(me.id))
      .send({ items: [{ topic: 'legalQa', pushEnabled: false }] })
      .expect(200);
    expect((await read()).pushEnabled).toBe(false);
  });
});
