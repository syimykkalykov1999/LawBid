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
