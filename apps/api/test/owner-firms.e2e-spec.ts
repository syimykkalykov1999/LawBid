import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-14: a firm is its lawyers. Members keep their own licences;
 * the firm's states are the union; a bid on a case goes from the member whose
 * licence fits.
 */
jest.setTimeout(120_000);

describe('Firm profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  let tokens: TokenService;

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
    for (const code of ['NJ', 'IL', 'NY']) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name: code, is_active: true },
        update: {},
      });
    }
    await prisma.featureFlag.upsert({
      where: { key: 'firm_profiles' },
      create: { key: 'firm_profiles', enabled: true, description: 'e2e' },
      update: { enabled: true },
    });
  });

  afterAll(async () => {
    await prisma.featureFlag.update({
      where: { key: 'firm_profiles' },
      data: { enabled: false },
    });
    await app.close();
  });

  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const api = () => request(base);

  async function lawyer(state: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Law', last_name: state },
    });
    const username = `f${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: state,
        bar_number: `E${randomUUID().slice(0, 8)}`,
        license_status: 'verified',
      },
    });
    return { id: u.id, username, auth: auth(u.id, 'attorney') };
  }

  it('create, invite, accept; the firm page shows the union of states', async () => {
    const owner = await lawyer('NJ');
    const second = await lawyer('IL');
    const made = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Wexler & Co' });
    expect(made.status).toBe(201);
    const firmId = made.body.data.id as string;

    const again = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Second' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('FIRM_ALREADY_MEMBER');

    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: second.username })
      .expect(200);
    // Not on the public page until accepted.
    let page = await api()
      .get(`/api/v1/firms/${firmId}`)
      .set(owner.auth)
      .expect(200);
    expect(page.body.data.members).toHaveLength(1);
    expect(page.body.data.states).toEqual(['NJ']);

    const inbox = await api()
      .get('/api/v1/firms/me')
      .set(second.auth)
      .expect(200);
    const invitedRows = inbox.body.data.members as {
      attorneyId: string;
      status: string;
    }[];
    expect(invitedRows.find((m) => m.attorneyId === second.id)?.status).toBe(
      'invited',
    );
    await api().post('/api/v1/firms/me/accept').set(second.auth).expect(200);

    page = await api()
      .get(`/api/v1/firms/${firmId}`)
      .set(owner.auth)
      .expect(200);
    expect(page.body.data.members).toHaveLength(2);
    expect(page.body.data.states).toEqual(['IL', 'NJ']);
  });

  it('only the owner invites; a lawyer can be in one firm; leaving works', async () => {
    const owner = await lawyer('NJ');
    const m = await lawyer('NJ');
    const other = await lawyer('NJ');
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Firm A' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: m.username })
      .expect(200);
    await api().post('/api/v1/firms/me/accept').set(m.auth).expect(200);

    await api()
      .post('/api/v1/firms/me/members')
      .set(m.auth)
      .send({ username: other.username })
      .expect(403);
    await api()
      .post('/api/v1/firms')
      .set(other.auth)
      .send({ name: 'Firm B' })
      .expect(201);
    const dup = await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: other.username });
    expect(dup.status).toBe(409);

    await api()
      .delete(`/api/v1/firms/me/members/${m.id}`)
      .set(m.auth)
      .expect(204);
    await api().get('/api/v1/firms/me').set(m.auth).expect(404);
  });

  it('a case is matched to the members whose licence fits its state', async () => {
    const owner = await lawyer('NJ');
    const il = await lawyer('IL');
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Firm C' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: il.username })
      .expect(200);
    await api().post('/api/v1/firms/me/accept').set(il.auth).expect(200);

    const client = await prisma.user.create({ data: { role: 'client' } });
    const pa = await prisma.practiceArea.upsert({
      where: { code: 'e2e_firm_leaf' },
      create: {
        code: 'e2e_firm_leaf',
        name_en: 'E2E firm',
        i18n_key: 'practice.e2e_firm_leaf',
        sort: 1,
      },
      update: {},
    });
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Lease dispute in Chicago',
        description: 'A landlord keeps the deposit after the lease ended.',
        practice_area_id: pa.id,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'IL', is_primary: true },
    });
    const res = await api()
      .get(`/api/v1/firms/me/cases/${c.id}/eligible`)
      .set(owner.auth)
      .expect(200);
    const fit = res.body.data as { attorneyId: string }[];
    expect(fit.map((x) => x.attorneyId)).toEqual([il.id]);
  });

  it('is off behind the flag', async () => {
    await prisma.featureFlag.update({
      where: { key: 'firm_profiles' },
      data: { enabled: false },
    });
    const a = await lawyer('NJ');
    const r = await api()
      .post('/api/v1/firms')
      .set(a.auth)
      .send({ name: 'Nope' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
    await prisma.featureFlag.update({
      where: { key: 'firm_profiles' },
      data: { enabled: true },
    });
  });
});
