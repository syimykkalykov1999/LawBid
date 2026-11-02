import { CrashReportsService, intakeKey } from './crash-reports.service';
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
  const svc = new CrashReportsService(
    prisma as never,
    {
      consumeFixedWindow: consume,
    } as never,
  );
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
      200,
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

describe('intakeKey', () => {
  it('keeps IPv4 and shares one budget per IPv6 /64', () => {
    expect(intakeKey('1.2.3.4')).toBe('1.2.3.4');
    expect(intakeKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2');
    expect(intakeKey('2001:db8:1:2:1::9')).toBe('2001:db8:1:2');
  });
});

describe('CrashReportsService.ingest when Redis fails', () => {
  it('still stores the batch', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const svc = new CrashReportsService(
      { crashReport: { createMany } } as never,
      {
        consumeFixedWindow: jest.fn().mockRejectedValue(new Error('down')),
      } as never,
    );
    await expect(svc.ingest([report(1)], 'k', '1.2.3.4')).resolves.toBe(1);
  });
});
