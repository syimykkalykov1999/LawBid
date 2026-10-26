import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CreateCommentDto } from '../src/modules/comments/comments.dto';
import { APP_CONFIG_CACHE_KEY } from '../src/modules/feature-flags/services/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-15: text limits come from app_config (admin panel), are
 * served to the app in the public bootstrap and applied to requests at the
 * moment they arrive.
 */
jest.setTimeout(90_000);

describe('Text limits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
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
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: 'limits.comment_chars' },
    });
    await redis.del(APP_CONFIG_CACHE_KEY);
    await app.close();
  });

  const body = (n: number) =>
    plainToInstance(CreateCommentDto, { body: 'x'.repeat(n) });

  it('a request is checked against the number the admin saved', async () => {
    await prisma.appConfig.deleteMany({
      where: { key: 'limits.comment_chars' },
    });
    await redis.del(APP_CONFIG_CACHE_KEY);
    // Owner 2026-10-19: the starting value is Instagram's 2200.
    expect(await validate(body(2200))).toHaveLength(0);
    expect((await validate(body(2201))).length).toBeGreaterThan(0);

    await prisma.appConfig.upsert({
      where: { key: 'limits.comment_chars' },
      create: { key: 'limits.comment_chars', value: 500 },
      update: { value: 500 },
    });
    await redis.del(APP_CONFIG_CACHE_KEY);
    expect(await validate(body(500))).toHaveLength(0);
    expect((await validate(body(501))).length).toBeGreaterThan(0);
  });

  it('the public bootstrap carries the limits for the app', async () => {
    const res = await request(base).get('/api/v1/config/bootstrap').expect(200);
    const cfg = (res.body as { data: { app_config: Record<string, unknown> } })
      .data.app_config;
    expect(cfg['limits.comment_chars']).toBe(500);
  });
});
