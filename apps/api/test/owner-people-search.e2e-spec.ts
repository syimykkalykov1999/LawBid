import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner decision 2026-09-29 (docs/OPEN_QUESTIONS.md OQ-026): clients have
 * @usernames, People search finds attorneys AND clients by handle and
 * name, and a client has a public mini-profile without contacts.
 */
jest.setTimeout(120_000);

describe('People search + client usernames (e2e, OQ-026)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  const token = `pq${randomUUID().replace(/-/g, '').slice(0, 8)}`;

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
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

  const api = () => request(baseUrl);

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function attorney(username: string, name: [string, string]) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: name[0], last_name: name[1] },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username.toLowerCase(),
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  /** A client with a profile row; [username] null = legacy row. */
  async function client(
    name: [string, string],
    username: string | null,
    status: 'active' | 'suspended' = 'active',
  ) {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        status,
        first_name: name[0],
        last_name: name[1],
      },
    });
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'NY',
        preferred_languages: ['en'],
        username,
        username_lower: username?.toLowerCase() ?? null,
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  it('a legacy client gets a username on first read; new clients get one at the profile step', async () => {
    const legacy = await client(['Kirill', `${token}legacy`], null);
    const me = await api().get('/api/v1/users/me').set(legacy.auth);
    expect(me.status).toBe(200);
    const username = me.body.data.profile.username as string;
    expect(username).toMatch(/^kirill\./);
    const own = await api().get('/api/v1/users/me/profile').set(legacy.auth);
    expect(own.body.data.username).toBe(username);
    expect(own.body.data.usernameNextChangeAt).toBeNull();

    const fresh = await prisma.user.create({
      data: { role: 'client', first_name: 'Fresh', last_name: token },
    });
    const step = await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth(fresh.id, 'client'))
      .send({
        currentStep: 'push',
        profile: { firstName: 'Fresh', lastName: token, stateCode: 'NY' },
      });
    expect(step.status).toBe(200);
    expect(step.body.data.profile.username).toBe(`fresh.${token}`);
  });

  it('people: both roles find attorneys and clients by @username and name; blocked hidden', async () => {
    const att = await attorney(`${token}.law`, ['Plain', 'Lawyer']);
    const cli = await client([token, 'Person'], `${token}.cli`);
    const blocked = await client(
      [token, 'Blocked'],
      `${token}.blk`,
      'suspended',
    );
    const viewerClient = await client(['Viewer', 'One'], `${token}.v1`);

    for (const viewer of [viewerClient.auth, att.auth]) {
      const r = await api()
        .get('/api/v1/search/people')
        .query({ q: `@${token}` })
        .set(viewer);
      expect(r.status).toBe(200);
      const items = r.body.data as {
        role: string;
        attorney: { id: string } | null;
        client: { id: string; username: string; stateCode: string } | null;
      }[];
      const ids = items.map((i) => i.attorney?.id ?? i.client?.id);
      expect(ids).toContain(att.id);
      expect(ids).toContain(cli.id);
      expect(ids).not.toContain(blocked.id);
      const c = items.find((i) => i.client?.id === cli.id)!;
      expect(c.role).toBe('client');
      expect(c.attorney).toBeNull();
      expect(c.client).toMatchObject({
        username: `${token}.cli`,
        stateCode: 'NY',
      });
      // No contacts in a people row.
      expect(JSON.stringify(c)).not.toMatch(/phone|email/i);
    }

    // By name.
    const byName = await api()
      .get('/api/v1/search/people')
      .query({ q: `${token} person` })
      .set(att.auth);
    expect(
      (byName.body.data as { client: { id: string } | null }[]).some(
        (i) => i.client?.id === cli.id,
      ),
    ).toBe(true);

    // OQ-036: the state filter fits both — attorneys licensed there and
    // clients living there.
    const filtered = await api()
      .get('/api/v1/search/people')
      .query({ q: token, state: 'NY' })
      .set(att.auth);
    expect(filtered.status).toBe(200);
    expect(
      (
        filtered.body.data as {
          role: string;
          client: { stateCode: string } | null;
        }[]
      ).every((i) => i.role === 'attorney' || i.client?.stateCode === 'NY'),
    ).toBe(true);
  });

  it('GET /clients/:username — mini-profile for anyone signed in; 404 for unknown/blocked', async () => {
    const cli = await client(['Mini', token], `${token}.mini`);
    const att = await attorney(`${token}.viewer`, ['View', 'Er']);
    const r = await api().get(`/api/v1/clients/${token}.MINI`).set(att.auth);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      id: cli.id,
      username: `${token}.mini`,
      firstName: 'Mini',
      state: { code: 'NY', name: 'New York' },
      isSelf: false,
    });
    expect(r.body.data.memberSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const key of ['phone', 'email', 'contactNote', 'contactMethod']) {
      expect(r.body.data).not.toHaveProperty(key);
    }
    const own = await api().get(`/api/v1/clients/${token}.mini`).set(cli.auth);
    expect(own.body.data.isSelf).toBe(true);

    await client(['Gone', token], `${token}.gone`, 'suspended');
    expect(
      (await api().get(`/api/v1/clients/${token}.gone`).set(att.auth)).status,
    ).toBe(404);
    expect(
      (await api().get('/api/v1/clients/no-such').set(att.auth)).status,
    ).toBe(404);
  });

  it('one username namespace: a client cannot take an attorney handle and vice versa', async () => {
    const att = await attorney(`${token}.taken`, ['Ta', 'Ken']);
    const cli = await client(['Ch', 'Anger'], `${token}.free`);

    const clash = await api()
      .patch('/api/v1/users/me/profile')
      .set(cli.auth)
      .send({ username: `${token}.TAKEN` });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('USERNAME_TAKEN');

    const ok = await api()
      .patch('/api/v1/users/me/profile')
      .set(cli.auth)
      .send({ username: `${token}.renamed` });
    expect(ok.status).toBe(200);
    expect(ok.body.data.username).toBe(`${token}.renamed`);
    expect(ok.body.data.usernameNextChangeAt).not.toBeNull();

    const attClash = await api()
      .patch('/api/v1/attorneys/me/profile')
      .set(att.auth)
      .send({ username: `${token}.renamed` });
    expect(attClash.status).toBe(409);
    expect(attClash.body.error.code).toBe('USERNAME_TAKEN');

    const avail = await api()
      .get('/api/v1/attorneys/username-available')
      .query({ u: `${token}.renamed` })
      .set(att.auth);
    expect(avail.body.data).toMatchObject({
      available: false,
      reason: 'taken',
    });
  });
});
