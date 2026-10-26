import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { S3StorageService } from '../files/storage/s3-storage.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { DataExportService } from './data-export.service';

function setup(claimCount: number) {
  const prisma = {
    dataExportJob: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'e1',
          user_id: 'u1',
          type: 'user_data',
          user: {
            email: null,
            email_verified_at: null,
            status: 'active',
            ui_language: 'en',
          },
        }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: claimCount })),
      update: jest.fn(() => Promise.resolve({})),
    },
    file: {
      findFirst: jest.fn(() => Promise.resolve(null as { id: string } | null)),
      create: jest.fn(() => Promise.resolve({ id: 'f1' })),
      update: jest.fn(() => Promise.resolve({ id: 'f-old' })),
    },
  };
  const storage = {
    bucket: jest.fn(() => 'docs'),
    put: jest.fn(() => Promise.resolve()),
    signedGetUrl: jest.fn(() => Promise.resolve('https://x')),
  };
  const service = new DataExportService(
    prisma as unknown as PrismaService,
    storage as unknown as S3StorageService,
    {
      emit: jest.fn(() => Promise.resolve()),
    } as unknown as NotificationsService,
    { get: () => undefined } as unknown as ConfigService,
    {} as EmailProvider,
    { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger,
  );
  jest.spyOn(service, 'collect').mockResolvedValue({ 'profile.json': {} });
  jest.spyOn(service, 'zip').mockResolvedValue(Buffer.from('zip'));
  return { service, prisma, storage };
}

describe('DataExportService.process claim (S10-3)', () => {
  it('a redelivered job (retry) may take over a `processing` row and finishes it', async () => {
    const { service, prisma } = setup(1);
    const out = await service.process('e1', { retry: true });
    expect(out.bytes).toBe(3);
    expect(prisma.dataExportJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'e1',
        OR: [{ status: 'queued' }, { status: 'processing' }],
      },
      data: { status: 'processing' },
    });
    expect(prisma.dataExportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ready' }),
      }),
    );
  });

  it('a first run only takes `queued`, or `processing` that went stale', async () => {
    const { service, prisma } = setup(0);
    const out = await service.process('e1');
    expect(out).toEqual({ bytes: 0 });
    const where = (
      prisma.dataExportJob.updateMany.mock.calls[0] as unknown as [
        { where: { OR: Array<Record<string, unknown>> } },
      ]
    )[0].where;
    expect(where.OR[0]).toEqual({ status: 'queued' });
    expect(where.OR[1]).toEqual({
      status: 'processing',
      updated_at: { lt: expect.any(Date) },
    });
    expect(prisma.file.create).not.toHaveBeenCalled();
  });

  it('reuses the file row of the crashed first run instead of adding a second', async () => {
    const { service, prisma } = setup(1);
    prisma.file.findFirst.mockResolvedValueOnce({ id: 'f-old' });
    await service.process('e1', { retry: true });
    expect(prisma.file.create).not.toHaveBeenCalled();
    expect(prisma.file.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f-old' } }),
    );
  });
});
