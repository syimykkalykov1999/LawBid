import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** Owner 2026-10-18 filters audit: every attorney case-feed filter, alone
 * and combined, incl. the percent budget mode. */
jest.setTimeout(120_000);

describe('Cases feed / search filters on cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';

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
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_cf_cat' },
      create: {
        code: 'e2e_cf_cat',
        name_en: 'Filters cat',
        i18n_key: 'practice.e2e_cf_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_cf_cat.leaf' },
      create: {
        code: 'e2e_cf_cat.leaf',
        parent_id: cat.id,
        name_en: 'Filters leaf',
        i18n_key: 'practice.e2e_cf_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
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
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function viewer() {
    const now = new Date();
    const u = await prisma.user.create({
      data: {
        email: `e2e-${randomUUID()}@example.com`,
        role: 'client',
        first_name: 'Anna',
        last_name: 'Kowalski',
        phone_verified_at: now,
        email_verified_at: now,
      },
    });
    await prisma.onboardingState.create({
      data: { user_id: u.id, completed_at: now },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `cf${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    for (const st of ['NY', 'NJ']) {
      await prisma.state.upsert({
        where: { code: st },
        create: { code: st, name: st },
        update: {},
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: st,
          bar_number: `${st}-${randomUUID()}`,
          license_status: 'verified',
        },
      });
    }
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: leafId },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  it('attorney feed: every filter, alone and combined', async () => {
    const att = await attorney(); // also creates the NJ state
    const cli = await viewer();
    const tag = randomUUID().slice(0, 6);
    const mk = async (extra: Record<string, unknown>) => {
      const r = await api()
        .post('/api/v1/cases')
        .set(cli.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          practiceAreaId: leafId,
          title: `Feed filter ${tag} ${JSON.stringify(extra).length}`,
          description:
            'The landlord of our warehouse keeps the deposit and refuses to repair the roof after the storm.',
          primaryStateCode: 'NY',
          clientContactSharingConsent: true,
          ...extra,
        });
      expect(`${r.status} ${JSON.stringify(r.body).slice(0, 300)}`).toMatch(
        /^201/,
      );
      return r.body.data.id as string;
    };
    const amount = await mk({ budgetMode: 'amount', budgetAmountDollars: 900 });
    const later = await mk({ budgetMode: 'clarify_later' });
    const percent = await mk({ budgetMode: 'percent', budgetPercentBps: 3300 });
    const dated = await mk({
      budgetMode: 'amount',
      budgetAmountDollars: 5000,
      primaryStateCode: 'NJ',
      urgency: 'by_date',
      deadlineAt: new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10),
      deadlineKind: 'court_hearing',
    });
    const all = [amount, later, percent, dated];
    // Only our four cases, whatever else the dev database holds.
    const feed = async (qs: string) => {
      const res = await api().get(`/api/v1/cases?limit=50${qs}`).set(att.auth);
      expect(res.status).toBe(200);
      return (res.body.data as { id: string }[])
        .map((x) => x.id)
        .filter((id) => all.includes(id))
        .sort();
    };
    const sorted = (...x: string[]) => [...x].sort();

    expect(await feed('')).toEqual(sorted(...all));
    // practice: category -> leaves, leaf, other leaf
    expect(await feed('&practice=e2e_cf_cat')).toEqual(sorted(...all));
    expect(await feed('&practice=e2e_cf_cat.leaf')).toEqual(sorted(...all));
    expect(await feed('&practice=e2e_cf_cat.other')).toEqual([]);
    expect(await feed('&practiceCategory=e2e_cf_cat')).toEqual(sorted(...all));
    expect(await feed(`&practiceAreaId=${leafId}`)).toEqual(sorted(...all));
    // states
    expect(await feed('&state=NJ')).toEqual([dated]);
    expect(await feed('&state=NY')).toEqual(sorted(amount, later, percent));
    expect(await feed('&states=NY,NJ')).toEqual(sorted(...all));
    expect(await feed('&states=CA')).toEqual([]);
    // budget
    expect(await feed('&budgetMin=500&budgetMax=1000')).toEqual([amount]);
    expect(await feed('&budgetMin=1000')).toEqual([dated]);
    expect(await feed('&budgetUnknown=true')).toEqual([later]);
    // period, no bids
    expect(await feed('&period=24h')).toEqual(sorted(...all));
    expect(await feed('&noBids=true')).toEqual(sorted(...all));
    // urgency
    expect(await feed('&hasDeadline=true')).toEqual([dated]);
    // combinations
    expect(await feed('&practice=e2e_cf_cat&state=NY&budgetMax=1000')).toEqual([
      amount,
    ]);
    expect(
      await feed('&practice=e2e_cf_cat&states=NJ&hasDeadline=true'),
    ).toEqual([dated]);
    expect(await feed('&sort=for_you&practice=e2e_cf_cat')).toEqual(
      sorted(...all),
    );
    // percent-mode cases carry no dollar budget: they are in the feed, in
    // no budget range and not "clarify later".
    expect(await feed('&budgetMin=0')).not.toContain(percent);
    // cursor + filter: page 1 then page 2 hold every case once.
    const p1 = await api()
      .get('/api/v1/cases?limit=2&practice=e2e_cf_cat&state=NY')
      .set(att.auth);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.meta.nextCursor).toBeTruthy();
    const p2 = await api()
      .get(
        `/api/v1/cases?limit=2&practice=e2e_cf_cat&state=NY&cursor=${encodeURIComponent(p1.body.meta.nextCursor as string)}`,
      )
      .set(att.auth);
    const seen = [...p1.body.data, ...p2.body.data].map(
      (x: { id: string }) => x.id,
    );
    expect(seen.filter((id) => all.includes(id)).sort()).toEqual(
      sorted(amount, later, percent),
    );

    // the same filters in Search -> Cases (text + filters)
    const found = async (qs: string) =>
      (
        (
          await api()
            .get(`/api/v1/search/cases?q=warehouse ${tag}${qs}`)
            .set(att.auth)
        ).body.data as { id: string }[]
      )
        .map((x) => x.id)
        .sort();
    expect(await found('&practiceCategory=e2e_cf_cat')).toEqual(sorted(...all));
    expect(await found('&practiceCategory=e2e_cf_cat.leaf&state=NJ')).toEqual([
      dated,
    ]);
    expect(await found('&budgetMin=500&budgetMax=1000')).toEqual([amount]);
    expect(await found('&hasDeadline=true')).toEqual([dated]);
  });

  it('"My cases": status tabs, practice category -> leaf, state, text, cursor', async () => {
    await attorney(); // makes sure NJ exists
    const cli = await viewer();
    const tag = randomUUID().slice(0, 6);
    const mk = async (extra: Record<string, unknown>) => {
      const r = await api()
        .post('/api/v1/cases')
        .set(cli.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          practiceAreaId: leafId,
          title: `Mine filter ${tag} ${randomUUID().slice(0, 4)}`,
          description:
            'The landlord of our warehouse keeps the deposit and refuses to repair the roof after the storm.',
          primaryStateCode: 'NY',
          clientContactSharingConsent: true,
          budgetMode: 'clarify_later',
          ...extra,
        });
      expect(`${r.status}`).toBe('201');
      return r.body.data.id as string;
    };
    const ny1 = await mk({});
    const ny2 = await mk({});
    const nj = await mk({ primaryStateCode: 'NJ' });
    const closed = await mk({});
    const closeRes = await api()
      .post(`/api/v1/cases/${closed}/close`)
      .set(cli.auth)
      .set('Idempotency-Key', randomUUID());
    expect([200, 201, 204]).toContain(closeRes.status);

    const list = async (qs: string) => {
      const res = await api().get(`/api/v1/users/me/cases?${qs}`).set(cli.auth);
      expect(res.status).toBe(200);
      return (res.body.data as { id: string }[]).map((x) => x.id).sort();
    };
    const sorted = (...x: string[]) => [...x].sort();
    expect(await list('filter=active')).toEqual(sorted(ny1, ny2, nj));
    expect(await list('filter=open')).toEqual(sorted(ny1, ny2, nj));
    expect(await list('filter=closed')).toEqual([closed]);
    expect(await list('filter=completed')).toEqual([closed]);
    expect(await list('filter=archived')).toEqual([]);
    expect(await list('filter=active&practice=e2e_cf_cat')).toEqual(
      sorted(ny1, ny2, nj),
    );
    expect(await list('filter=active&practice=e2e_cf_cat.leaf')).toEqual(
      sorted(ny1, ny2, nj),
    );
    expect(await list('filter=active&practice=e2e_cf_cat.other')).toEqual([]);
    expect(await list('filter=active&state=NJ')).toEqual([nj]);
    expect(await list('filter=active&state=NY&practice=e2e_cf_cat')).toEqual(
      sorted(ny1, ny2),
    );
    expect(await list(`filter=closed&state=NJ`)).toEqual([]);
    expect(await list(`filter=active&q=mine filter ${tag}`)).toEqual(
      sorted(ny1, ny2, nj),
    );
    expect(await list('filter=active&q=zzzznomatch')).toEqual([]);
    // cursor + filter
    const p1 = await api()
      .get('/api/v1/users/me/cases?filter=active&limit=2&practice=e2e_cf_cat')
      .set(cli.auth);
    expect(p1.body.data).toHaveLength(2);
    const p2 = await api()
      .get(
        `/api/v1/users/me/cases?filter=active&limit=2&practice=e2e_cf_cat&cursor=${encodeURIComponent(p1.body.meta.nextCursor as string)}`,
      )
      .set(cli.auth);
    expect(
      [...p1.body.data, ...p2.body.data]
        .map((x: { id: string }) => x.id)
        .sort(),
    ).toEqual(sorted(ny1, ny2, nj));
  });
});
