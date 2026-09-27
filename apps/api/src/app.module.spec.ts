import { Writable } from 'node:stream';
import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { pinoHttpOptions } from './app.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

interface LogLine {
  msg?: string;
  req?: { id?: string; url?: string };
}

const lines: LogLine[] = [];
const sink = new Writable({
  write(chunk: Buffer, _enc, cb) {
    for (const raw of chunk.toString('utf8').split('\n')) {
      if (raw.trim().length > 0) lines.push(JSON.parse(raw) as LogLine);
    }
    cb();
  },
});

@Controller('probe')
class ProbeController {
  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('missing')
  missing() {
    throw new NotFoundException();
  }
}

/** Same wiring shape as AppModule: LoggerModule (which registers
 * pino-http as its own middleware) + RequestIdMiddleware applied from the
 * importing module's configure(), with the exact production
 * `pinoHttpOptions` — only the destination stream differs. */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: [{ ...pinoHttpOptions, transport: undefined }, sink],
    }),
  ],
  controllers: [ProbeController],
})
class ProbeAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

function completionLogFor(url: string): LogLine | undefined {
  return lines.find(
    (l) =>
      l.req?.url === url &&
      typeof l.msg === 'string' &&
      /request (completed|errored)/.test(l.msg),
  );
}

describe('AppModule logging: pino request id == X-Request-Id', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeAppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lines.length = 0;
  });

  it('production pinoHttpOptions define genReqId', () => {
    expect(typeof pinoHttpOptions.genReqId).toBe('function');
  });

  it('a generated id appears both in the response header and the request log', async () => {
    const res = await request(app.getHttpServer()).get('/probe/ok').expect(200);
    const header = res.headers['x-request-id'];
    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    const log = completionLogFor('/probe/ok');
    expect(log).toBeDefined();
    expect(log?.req?.id).toBe(header);
  });

  it('a client-supplied X-Request-Id is reused by the logger verbatim', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/ok')
      .set('X-Request-Id', 'client-req-42')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('client-req-42');
    expect(completionLogFor('/probe/ok')?.req?.id).toBe('client-req-42');
  });

  it('an unsafe client id is replaced consistently in header and log', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/ok')
      .set('X-Request-Id', 'x'.repeat(200))
      .expect(200);
    const header = res.headers['x-request-id'];
    expect(header).not.toBe('x'.repeat(200));
    expect(completionLogFor('/probe/ok')?.req?.id).toBe(header);
  });

  it('error responses carry the same id in the log', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/missing')
      .expect(404);
    expect(completionLogFor('/probe/missing')?.req?.id).toBe(
      res.headers['x-request-id'],
    );
  });
});
