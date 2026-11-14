import {
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  type MiddlewareConsumer,
  type NestMiddleware,
  type NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { ALL_ROUTES, GLOBAL_PREFIX, UNPREFIXED_ROUTES } from './app.setup';

// 14.11 prod F9: `forRoutes('*')` logged the NestJS 12 LegacyRouteConverter
// warning on every boot. ALL_ROUTES ('{*splat}', the migration guide's named
// wildcard) must reach every route the old '*' reached, with no warning.

@Injectable()
class MarkMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('x-mw', '1');
    next();
  }
}

@Controller()
class C {
  @Get() root() {
    return 'root';
  }
  @Get('a') a() {
    return 'a';
  }
  @Get('a/b/c') deep() {
    return 'deep';
  }
  @Get('health/live') live() {
    return 'live';
  }
}

async function boot(route: string) {
  @Module({ controllers: [C] })
  class M implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(MarkMiddleware).forRoutes(route);
    }
  }
  const warn = jest.spyOn(Logger.prototype, 'warn');
  const mod = await Test.createTestingModule({ imports: [M] }).compile();
  const app = mod.createNestApplication({ logger: false });
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: UNPREFIXED_ROUTES });
  await app.init();
  const warned = warn.mock.calls.some((c) =>
    String(c[0]).includes('Unsupported route path'),
  );
  warn.mockRestore();
  return { app, warned };
}

const PATHS = [
  `/${GLOBAL_PREFIX}`,
  `/${GLOBAL_PREFIX}/a`,
  `/${GLOBAL_PREFIX}/a/b/c`,
  '/health/live',
  `/${GLOBAL_PREFIX}/no-such-route`,
];

describe('middleware on all routes (14.11 F9)', () => {
  it('ALL_ROUTES covers every path the old "*" covered, without the warning', async () => {
    const old = await boot('*');
    const now = await boot(ALL_ROUTES);
    try {
      // proof of cause: the old '*' under the global prefix is the warning
      expect(old.warned).toBe(true);
      expect(now.warned).toBe(false);
      for (const p of PATHS) {
        const [o, n] = await Promise.all([
          request(old.app.getHttpServer()).get(p),
          request(now.app.getHttpServer()).get(p),
        ]);
        expect([p, n.status, n.headers['x-mw']]).toEqual([
          p,
          o.status,
          o.headers['x-mw'],
        ]);
      }
      // and the middleware really runs on the prefixed routes
      const r = await request(now.app.getHttpServer()).get(
        `/${GLOBAL_PREFIX}/a/b/c`,
      );
      expect(r.headers['x-mw']).toBe('1');
    } finally {
      await old.app.close();
      await now.app.close();
    }
  });

  it('AppModule uses ALL_ROUTES, never the legacy "*"', () => {
    const src = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');
    expect(src).not.toMatch(/forRoutes\(\s*['"]\*['"]/);
    expect(src.match(/forRoutes\(ALL_ROUTES\)/g)).toHaveLength(5);
  });
});
