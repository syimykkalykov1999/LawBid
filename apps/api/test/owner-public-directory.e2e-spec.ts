import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Owner 2026-10-15 (web, SEO): the public directory shows only verified,
 * active attorneys with the public facts of their profile, and nothing
 * else — no contacts, no clients, no cases.
 */
jest.setTimeout(90_000);

describe('Public directory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const tag = randomUUID().slice(0, 8);

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
  });

  afterAll(async () => {
    await app.close();
  });

  async function attorney(
    name: string,
    status: 'verified' | 'unverified',
    userStatus: 'active' | 'suspended' = 'active',
  ) {
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: name,
        last_name: tag,
        status: userStatus,
      },
    });
    const username = `${name.toLowerCase()}_${tag}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: status,
        bio: 'Family law in California.',
      },
    });
    await prisma.state.upsert({
      where: { code: 'CA' },
      update: {},
      create: { code: 'CA', name: 'California', is_active: true },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'CA',
        bar_number: `B${tag}${name}`,
        license_status: status === 'verified' ? 'verified' : 'pending',
      },
    });
    return username;
  }

  it('lists a verified attorney with public facts only', async () => {
    const shown = await attorney('Vera', 'verified');
    const hidden = await attorney('Uma', 'unverified');
    const gone = await attorney('Sam', 'verified', 'suspended');
    const res = await request(base)
      .get('/api/v1/public/directory/attorneys?state=ca&limit=100')
      .expect(200);
    const body = res.body as {
      data: { username: string; licensedStates: string[] }[];
    };
    const names = body.data.map((a) => a.username);
    expect(names).toContain(shown);
    expect(names).not.toContain(hidden);
    expect(names).not.toContain(gone);
    expect(res.headers['cache-control']).toContain('public');
    const one = body.data.find((a) => a.username === shown)!;
    expect(one.licensedStates).toEqual(['CA']);
    // No media CDN in e2e: a signed link would expire inside a static page.
    expect(one.photoUrl).toBeNull();
    // Nothing that identifies a client or lets someone reach the attorney.
    expect(Object.keys(one).sort()).toEqual(
      [
        'bio',
        'displayName',
        'firmNames',
        'languages',
        'licensedStates',
        // Owner 2026-10-22: the public photo (CDN) for og:image.
        'photoUrl',
        'practiceAreas',
        'ratingAvg',
        'ratingCount',
        'trustBadge',
        'username',
      ].sort(),
    );
  });

  it('refuses a bad state or practice code', async () => {
    await request(base)
      .get('/api/v1/public/directory/attorneys?state=California')
      .expect(400);
    await request(base)
      .get('/api/v1/public/directory/attorneys?practice=a%20b')
      .expect(400);
  });
});
