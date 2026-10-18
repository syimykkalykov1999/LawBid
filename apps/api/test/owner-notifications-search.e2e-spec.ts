import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-18: the bell has a search box — `?q=` matches the stored text
 * (broadcast title/body) and the attorney's name, together with `group`.
 */
jest.setTimeout(120_000);

describe('Notifications search (e2e, owner 2026-10-18)', () => {
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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney(first?: string, last?: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: last },
    });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    return { id: u.id, handle };
  }

  async function client(first: string, last: string) {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: first, last_name: last },
    });
    const handle = `cl${randomUUID().slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'NY',
        username: handle,
        username_lower: handle,
      },
    });
    return { id: u.id, handle };
  }

  it('narrows the list by stored text and by the attorney name', async () => {
    const me = await client('Mia', 'Owner');
    const emily = await attorney('Emily', 'Brown');
    const cl = await client('Secret', 'Person');
    await prisma.notification.createMany({
      data: [
        {
          user_id: me.id,
          type: 'new_follower',
          category: 'following',
          payload: { actorId: emily.id },
        },
        {
          user_id: me.id,
          type: 'admin_broadcast',
          category: 'system',
          payload: { title: 'Plan maintenance', body: 'Sunday night' },
        },
        {
          user_id: me.id,
          type: 'new_follower',
          category: 'following',
          payload: { actorId: cl.id },
        },
      ],
    });
    const types = async (q?: string, group?: string) => {
      const res = await api()
        .get('/api/v1/notifications')
        .query({
          ...(q === undefined ? {} : { q }),
          ...(group ? { group } : {}),
        })
        .set(bearer(me.id, 'client'))
        .expect(200);
      return (res.body as { data: { type: string }[] }).data.map((n) => n.type);
    };
    expect(await types()).toHaveLength(3);
    expect(await types('Эмили')).toEqual(['new_follower']);
    expect(await types('brown emily')).toEqual(['new_follower']);
    expect(await types('maintenance sunday')).toEqual(['admin_broadcast']);
    // A client actor is anonymous: their real name finds nothing.
    expect(await types('Secret')).toEqual([]);
    expect(await types('nobody-here')).toEqual([]);
    // Together with the tab.
    expect(await types('Emily', 'other')).toEqual(['new_follower']);
    expect(await types('maintenance', 'other')).toEqual([]);
    await api()
      .get('/api/v1/notifications')
      .query({ q: ' ' })
      .set(bearer(me.id, 'client'))
      .expect(400);
  });
});
