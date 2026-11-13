import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import { SearchLogService } from './search-log.service';

function make(create: jest.Mock, set = jest.fn().mockResolvedValue('OK')) {
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const prisma = { searchClick: { create } } as unknown as PrismaService;
  const redis = { set } as never;
  const svc = new SearchLogService(
    prisma,
    redis,
    logger as unknown as PinoLogger,
  );
  return { svc, logger };
}

describe('SearchLogService.recordClick', () => {
  it('writes one click row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const { svc } = make(create);
    await svc.recordClick('u1', 'divorce lawyer', 'post', 'not-a-uuid');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('never fails the request when the log write fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('FK violation'));
    const { svc, logger } = make(create);
    await expect(
      svc.recordClick('u1', 'divorce lawyer', 'post', 'not-a-uuid'),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never fails the request when Redis is down', async () => {
    const create = jest.fn();
    const { svc } = make(
      create,
      jest.fn().mockRejectedValue(new Error('down')),
    );
    await expect(
      svc.recordClick('u1', 'divorce lawyer', 'post', 'not-a-uuid'),
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('SearchLogService.logQuery (row 80: the typing clean-up only when needed)', () => {
  function withRedis(down = false) {
    const lists = new Map<string, string[]>();
    const executeRaw = jest.fn().mockResolvedValue(0);
    const create = jest.fn().mockResolvedValue({});
    const logger = { setContext: jest.fn(), warn: jest.fn() };
    const prisma = {
      $executeRaw: executeRaw,
      searchQueryLog: { create },
    } as unknown as PrismaService;
    const redis = {
      lrange: jest.fn((k: string) =>
        down
          ? Promise.reject(new Error('down'))
          : Promise.resolve([...(lists.get(k) ?? [])]),
      ),
      lpush: jest.fn((k: string, v: string) => {
        lists.set(k, [v, ...(lists.get(k) ?? [])]);
        return Promise.resolve(1);
      }),
      ltrim: jest.fn(() => Promise.resolve('OK')),
      pexpire: jest.fn(() => Promise.resolve(1)),
    };
    const svc = new SearchLogService(
      prisma,
      redis as never,
      logger as unknown as PinoLogger,
    );
    const flush = () => new Promise((r) => setImmediate(r));
    return { svc, executeRaw, create, flush };
  }

  it('a query with no shorter one typed before: only the INSERT', async () => {
    const { svc, executeRaw, create, flush } = withRedis();
    svc.logQuery('u1', 'people', 'divorce', 3);
    await flush();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('typing «divo» then «divorce»: the clean-up runs for the prefix', async () => {
    const { svc, executeRaw, create, flush } = withRedis();
    svc.logQuery('u1', 'people', 'divo', 3);
    await flush();
    svc.logQuery('u1', 'people', 'divorce', 3);
    await flush();
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('another scope or the same query again: no clean-up', async () => {
    const { svc, executeRaw, flush } = withRedis();
    svc.logQuery('u1', 'people', 'divo', 3);
    await flush();
    svc.logQuery('u1', 'posts', 'divorce', 3);
    await flush();
    svc.logQuery('u1', 'people', 'divo', 3);
    await flush();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('Redis away: the clean-up runs as before', async () => {
    const { svc, executeRaw, create, flush } = withRedis(true);
    svc.logQuery('u1', 'people', 'divorce', 3);
    await flush();
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
