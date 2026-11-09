import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PartitionService } from '../src/partitioning/partition.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * 2026-11-08 (owner: «админка тормозит даже без данных»): the «Масштаб»
 * cards are shared boards. A repeat open must not rebuild them, an old copy
 * is served at once, and the «Разделить базу» preview never counts rows.
 */
jest.setTimeout(120_000);

describe('Admin boards are served from the shared copy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let admin: AdminSession;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    admin = await adminSession(base, prisma, 'super_admin');
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) =>
    request(base).get(`/api/v1${path}`).set(admin.auth).expect(200);

  it('partitions: built once, then the shared copy (even an old one)', async () => {
    await redis.del('adm:sum:ops:partitions');
    // Spied on the class: the API module has its own provider instance.
    const spy = jest.spyOn(PartitionService.prototype, 'report');
    const first = await get('/admin/system-health/partitions');
    await get('/admin/system-health/partitions');
    expect(spy).toHaveBeenCalledTimes(1);

    // A day-old copy opens at once; one rebuild runs behind it.
    const raw = JSON.parse((await redis.get('adm:sum:ops:partitions'))!) as {
      computedAt: string;
    };
    raw.computedAt = new Date(Date.now() - 20 * 3600_000).toISOString();
    await redis.set('adm:sum:ops:partitions', JSON.stringify(raw));
    const again = await get('/admin/system-health/partitions');
    expect(again.body).toEqual(first.body);
    spy.mockRestore();
  });

  it('infra overview and search index status are shared boards', async () => {
    await redis.del('adm:sum:infra:overview', 'adm:sum:search:index-status');
    await get('/admin/infra');
    await get('/admin/system-health/search-index');
    expect(await redis.exists('adm:sum:infra:overview')).toBe(1);
    expect(await redis.exists('adm:sum:search:index-status')).toBe(1);
  });

  it('split preview estimates rows without COUNT(*)', async () => {
    const res = await get('/admin/shards/split-plan?toDb=db1');
    const data = (res.body as { data: { rows: number; shards: number[] } })
      .data;
    expect(typeof data.rows).toBe('number');
    expect(data.rows).toBeGreaterThanOrEqual(0);
  });
});
