import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { S3StorageService } from '../files/storage/s3-storage.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { DataExportRunner } from './data-export.runner';
import type { DataExportService } from './data-export.service';
import { DATA_EXPORT_STALE_PROCESSING_MS } from './privacy.constants';

const user = { sub: 'u1' } as RequestUser;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    user_id: 'u1',
    type: 'user_data',
    status: 'queued',
    file_id: null,
    file: null,
    expires_at: null,
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

function setup(inFlight: unknown) {
  const prisma = {
    dataExportJob: {
      findFirst: jest.fn(() => Promise.resolve(inFlight)),
      create: jest.fn(() => Promise.resolve(row({ id: 'new1' }))),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  const queue = {
    add: jest.fn(() => Promise.resolve({})),
    getJob: jest.fn(() => Promise.resolve(undefined)),
  };
  const logger = { setContext: jest.fn(), error: jest.fn() };
  const runner = new DataExportRunner(
    { mode: 'api' },
    { get: () => undefined } as unknown as ConfigService,
    prisma as unknown as PrismaService,
    {} as DataExportService,
    {} as S3StorageService,
    logger as unknown as PinoLogger,
  );
  (runner as unknown as { queue: unknown }).queue = queue;
  return { runner, prisma, queue };
}

describe('DataExportRunner.request (S10-3 / S10-4)', () => {
  it('marks the new row failed and rethrows when the job cannot be queued', async () => {
    const { runner, prisma, queue } = setup(null);
    queue.add.mockRejectedValueOnce(new Error('redis down'));
    await expect(runner.request(user)).rejects.toThrow('redis down');
    expect(prisma.dataExportJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'new1', status: 'queued' },
      data: { status: 'failed', error: 'could not be queued' },
    });
  });

  it('queues a lost job again for a `queued` row instead of locking the user out', async () => {
    const { runner, prisma, queue } = setup(row({ status: 'queued' }));
    // status() re-reads the row by id
    prisma.dataExportJob.findFirst
      .mockResolvedValueOnce(row({ status: 'queued' }))
      .mockResolvedValueOnce(row({ status: 'queued' }));
    const out = await runner.request(user);
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      { exportId: 'e1' },
      expect.objectContaining({ jobId: 'e1' }),
    );
    expect(prisma.dataExportJob.create).not.toHaveBeenCalled();
    expect(out.exportId).toBe('e1');
  });

  it('lets the user ask again when a `processing` row has no live job and went stale', async () => {
    const stale = row({
      status: 'processing',
      updated_at: new Date(Date.now() - DATA_EXPORT_STALE_PROCESSING_MS - 1000),
    });
    const { runner, prisma, queue } = setup(stale);
    const out = await runner.request(user);
    expect(prisma.dataExportJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'processing' },
      data: { status: 'failed', error: 'worker lost' },
    });
    expect(prisma.dataExportJob.create).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      { exportId: 'new1' },
      expect.anything(),
    );
    expect(out.exportId).toBe('new1');
  });

  it('keeps a fresh `processing` row (a live build) as the answer', async () => {
    const fresh = row({ status: 'processing' });
    const { runner, prisma, queue } = setup(fresh);
    prisma.dataExportJob.findFirst
      .mockResolvedValueOnce(fresh)
      .mockResolvedValueOnce(fresh);
    const out = await runner.request(user);
    expect(prisma.dataExportJob.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(out.status).toBe('processing');
  });
});
