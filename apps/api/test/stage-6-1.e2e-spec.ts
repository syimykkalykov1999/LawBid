import type { AddressInfo, Server } from 'node:net';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pino from 'pino';
import request from 'supertest';
import { AppModule, pinoHttpOptions } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * docs/06 §16 stage 6.1 acceptance: the §10 migration is in place; the
 * body cap and CORS policy hold; no phone/email/token reaches the logs.
 */
jest.setTimeout(60_000);

describe('Stage 6.1 — base security + migration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('docs/06 §10 migration: new tables and columns exist', async () => {
    const cols = await prisma.$queryRaw<
      { table_name: string; column_name: string }[]
    >`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'subscriptions' AND column_name = 'grace_ends_at')
         OR (table_name = 'audit_log' AND column_name = 'justification')
         OR (table_name = 'admin_credentials' AND column_name = 'totp_secret_enc')
         OR (table_name = 'data_export_jobs' AND column_name = 'status')`;
    expect(cols).toHaveLength(4);
    // §10 app_config keys: seeded, else the typed defaults apply.
    const settings = app.get(AppSettingsService);
    expect(await settings.number('subscription.past_due_grace_days')).toBe(3);
    expect(await settings.number('moderation.auto_hide_reports')).toBe(3);
    expect(await settings.stringList('moderation.blocked_terms')).toEqual([]);
  });

  it('a body above the cap is refused with 413', async () => {
    const r = await request(baseUrl)
      .post('/api/v1/auth/otp/request')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ identifier: 'x'.repeat(300 * 1024) }));
    expect(r.status).toBe(413);
  });

  it('CORS: an unknown origin gets no Access-Control-Allow-Origin', async () => {
    const r = await request(baseUrl)
      .options('/api/v1/health/live')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('logs never contain phones, emails or tokens (pino redact + serializer)', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = pino(
      {
        redact: pinoHttpOptions.redact,
        serializers: pinoHttpOptions.serializers,
      },
      sink,
    );
    logger.info({
      req: {
        url: '/api/v1/search/attorneys?q=John+Smith',
        query: { q: 'John Smith' },
        headers: { authorization: 'Bearer secret.token.here', cookie: 'a=b' },
        body: {
          phone: '+12025550101',
          email: 'a@b.co',
          code: '123456',
          identifier: '+12025550101',
        },
      },
    });
    const out = lines.join('');
    for (const forbidden of [
      '+12025550101',
      'a@b.co',
      '123456',
      'secret.token.here',
      'John Smith',
    ]) {
      expect(out).not.toContain(forbidden);
    }
  });
});
