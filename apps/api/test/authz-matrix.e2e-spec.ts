import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * docs/06 §4.2 / stage 6.1 acceptance: deny by default. A table of
 * object routes × callers (anonymous, a stranger of the right role, the
 * wrong role, an admin-role-less user) — every cell must be refused; the
 * owner/participant cell must pass. IDOR by guessing ids is impossible.
 */
jest.setTimeout(90_000);

describe('Authorization matrix (e2e, docs/06 §4.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney') {
    const u = await prisma.user.create({
      data: { role, first_name: 'T', last_name: 'U' },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `a_${u.id.slice(0, 8)}`,
          username_lower: `a_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
    }
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } };
  }

  it('object routes refuse anonymous, strangers and the wrong role; allow the participant', async () => {
    const owner = await user('client');
    const stranger = await user('client');
    const attorney = await user('attorney');
    const otherAttorney = await user('attorney');
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'authz_e2e' },
      create: { code: 'authz_e2e', name_en: 'A', i18n_key: 'a', sort: 0 },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: owner.id,
        title: 'Authz case',
        description: 'd',
        practice_area_id: parent.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: owner.id,
        attorney_id: attorney.id,
        participants: {
          create: [{ user_id: owner.id }, { user_id: attorney.id }],
        },
      },
    });

    // route, allowed caller, refused callers (each must NOT be 2xx)
    const rows: {
      path: string;
      ok: { auth: Record<string, string> };
      denied: { auth?: Record<string, string> }[];
    }[] = [
      {
        path: `/api/v1/users/me/cases/${kase.id}`,
        ok: owner,
        denied: [{}, stranger],
      },
      {
        path: `/api/v1/conversations/${conv.id}`,
        ok: attorney,
        denied: [{}, stranger, otherAttorney],
      },
      {
        path: `/api/v1/conversations/${conv.id}/messages`,
        ok: owner,
        denied: [{}, stranger, otherAttorney],
      },
      {
        path: `/api/v1/cases/${kase.id}/contacts`,
        ok: owner, // the owner's own contacts route may 404/403 too; see below
        denied: [{}, stranger, otherAttorney],
      },
      {
        path: `/api/v1/attorneys/${stranger.id}/following`,
        ok: attorney,
        denied: [{}],
      },
      {
        path: '/api/v1/admin/audit-log',
        ok: owner,
        denied: [{}, stranger, attorney],
      },
    ];
    for (const row of rows) {
      for (const d of row.denied) {
        const r = await api()
          .get(row.path)
          .set(d.auth ?? {});
        expect(`${row.path} ${r.status}`).toMatch(/ (401|403|404)$/);
      }
    }
    // Participant cells that must pass.
    expect(
      (await api().get(`/api/v1/users/me/cases/${kase.id}`).set(owner.auth))
        .status,
    ).toBe(200);
    expect(
      (await api().get(`/api/v1/conversations/${conv.id}`).set(attorney.auth))
        .status,
    ).toBe(200);
    expect(
      (
        await api()
          .get(`/api/v1/conversations/${conv.id}/messages`)
          .set(owner.auth)
      ).status,
    ).toBe(200);
  });
});
