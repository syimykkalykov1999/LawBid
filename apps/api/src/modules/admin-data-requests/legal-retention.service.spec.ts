/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { LegalRetentionService } from './legal-retention.service';

const DAY = 24 * 3600 * 1000;

function build(days: number, perStatement: number[]) {
  const exec = jest.fn();
  for (const n of perStatement) exec.mockResolvedValueOnce(n);
  exec.mockResolvedValue(0);
  const prisma = { $executeRaw: exec } as unknown as PrismaService;
  const settings = {
    number: jest.fn().mockResolvedValue(days),
  } as unknown as AppSettingsService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
  } as unknown as PinoLogger;
  return { svc: new LegalRetentionService(prisma, settings, logger), exec };
}

describe('LegalRetentionService', () => {
  it('does nothing when the retention is 0 (keep forever)', async () => {
    const { svc, exec } = build(0, []);
    expect(await svc.run()).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('scrubs only what was deleted before now − 90 days', async () => {
    const { svc, exec } = build(90, [3, 0, 0, 0, 0, 0, 0, 0]);
    const now = new Date('2026-10-21T00:00:00Z');
    const res = await svc.run(now);
    expect(res?.messages).toBe(3);
    const cut = new Date(now.getTime() - 90 * DAY);
    const firstValues = exec.mock.calls[0].slice(1) as unknown[];
    expect(firstValues.some((v) => v instanceof Date && +v === +cut)).toBe(
      true,
    );
  });

  it('skips rows under an active legal hold in every statement', async () => {
    const { svc, exec } = build(90, []);
    await svc.run();
    expect(exec).toHaveBeenCalledTimes(8);
    for (const call of exec.mock.calls) {
      const strings = (call[0] as TemplateStringsArray).join('?');
      const nested = (call.slice(1) as unknown[])
        .filter(
          (v): v is Prisma.Sql =>
            typeof v === 'object' && v !== null && 'sql' in v,
        )
        .map((v) => v.sql)
        .join(' ');
      expect(`${strings} ${nested}`).toContain('legal_holds');
      expect(`${strings} ${nested}`).toContain('released_at IS NULL');
    }
  });

  it('keeps going in batches until a short batch', async () => {
    const { svc, exec } = build(90, [2000, 2000, 5]);
    const res = await svc.run();
    expect(res?.messages).toBe(4005);
    expect(exec.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
