import { CrashReportsService } from './crash-reports.service';
import type { CrashReportInDto } from './crash-reports.dto';

const report = (n: number): CrashReportInDto => ({
  message: `boom ${n}`,
  stack: 'at a\nat b',
  platform: 'android',
  appVersion: '1.0.0',
  build: '1',
  flavor: 'prod',
  osVersion: '14',
  deviceModel: 'Pixel',
});

function build(allowed: boolean) {
  const createMany = jest.fn().mockResolvedValue({ count: 2 });
  const prisma = { crashReport: { createMany } };
  const consume = jest.fn().mockResolvedValue({ allowed });
  const svc = new CrashReportsService(prisma as never, undefined, {
    consumeFixedWindow: consume,
  } as never);
  return { svc, createMany, consume };
}

describe('CrashReportsService.ingest daily cap', () => {
  it('stores a batch while the address is under its daily cap', async () => {
    const { svc, createMany, consume } = build(true);
    await expect(
      svc.ingest([report(1), report(2)], 'k', '1.2.3.4'),
    ).resolves.toBe(2);
    expect(consume).toHaveBeenCalledWith(
      ['crash-intake', 'ip', '1.2.3.4'],
      100,
      86_400,
    );
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it('drops the batch (stores nothing) once the cap is spent', async () => {
    const { svc, createMany } = build(false);
    await expect(svc.ingest([report(1)], 'k', '1.2.3.4')).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('does not count when the address is unknown', async () => {
    const { svc, consume } = build(false);
    await svc.ingest([report(1)], 'k', null);
    expect(consume).not.toHaveBeenCalled();
  });
});
