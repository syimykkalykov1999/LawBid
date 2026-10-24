import { NotFoundException } from '@nestjs/common';
import { viewerContext } from '../../common/viewer/viewer-context';
import { FileAccessService } from './file-access.service';

function make(opts: { enabled?: boolean; dedupe?: boolean } = {}) {
  const prisma = {
    fileAccessLog: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    file: { findUnique: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    session: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const redis = {
    set: jest.fn().mockResolvedValue(opts.dedupe ? null : 'OK'),
  };
  const settings = {
    boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
  };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const svc = new FileAccessService(
    prisma as never,
    redis as never,
    settings as never,
    logger as never,
  );
  return { svc, prisma, redis, settings, logger };
}

const file = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  owner_user_id: 'owner',
  purpose: 'case_attachment',
  ...over,
});

describe('FileAccessService.recordViews', () => {
  it('writes who, which device and address when somebody else opens a file', async () => {
    const { svc, prisma } = make();
    await viewerContext.run('viewer', () => svc.recordViews([file()]), {
      sessionId: 'sid-1',
      ip: '203.0.113.9',
    });
    expect(prisma.fileAccessLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          file_id: 'f1',
          owner_user_id: 'owner',
          viewer_user_id: 'viewer',
          purpose: 'case_attachment',
          session_id: 'sid-1',
          ip: '203.0.113.9',
        },
      ],
    });
  });

  it('does not log the owner opening their own file', async () => {
    const { svc, prisma } = make();
    await viewerContext.run('owner', () => svc.recordViews([file()]));
    expect(prisma.fileAccessLog.createMany).not.toHaveBeenCalled();
  });

  it('does not log without a request viewer (jobs, admin)', async () => {
    const { svc, prisma } = make();
    await svc.recordViews([file()]);
    expect(prisma.fileAccessLog.createMany).not.toHaveBeenCalled();
  });

  it('ignores non-confidential purposes', async () => {
    const { svc, prisma } = make();
    await viewerContext.run('viewer', () =>
      svc.recordViews([file({ purpose: 'post_image' })]),
    );
    expect(prisma.fileAccessLog.createMany).not.toHaveBeenCalled();
  });

  it('writes one row per viewer and file per dedupe window', async () => {
    const { svc, prisma, redis } = make({ dedupe: true });
    await viewerContext.run('viewer', () => svc.recordViews([file()]));
    expect(redis.set).toHaveBeenCalledWith(
      'fal:viewer:f1',
      '1',
      'EX',
      600,
      'NX',
    );
    expect(prisma.fileAccessLog.createMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the switch is off', async () => {
    const { svc, prisma } = make({ enabled: false });
    await viewerContext.run('viewer', () => svc.recordViews([file()]));
    expect(prisma.fileAccessLog.createMany).not.toHaveBeenCalled();
  });

  it('never throws and never logs more than the error text', async () => {
    const { svc, prisma, logger } = make();
    prisma.fileAccessLog.createMany.mockRejectedValue(new Error('db down'));
    await expect(
      viewerContext.run('viewer', () => svc.recordViews([file()])),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: 'db down' },
      'file access journal write failed',
    );
  });
});

describe('FileAccessService.viewsOf', () => {
  it('is for the owner only', async () => {
    const { svc, prisma } = make();
    prisma.file.findUnique.mockResolvedValue({ owner_user_id: 'owner' });
    await expect(svc.viewsOf('someone-else', 'f1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.file.findUnique.mockResolvedValue(null);
    await expect(svc.viewsOf('owner', 'f1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists viewer name, device and time, newest first', async () => {
    const { svc, prisma } = make();
    prisma.file.findUnique.mockResolvedValue({ owner_user_id: 'owner' });
    prisma.fileAccessLog.findMany.mockResolvedValue([
      {
        viewer_user_id: 'v1',
        session_id: 'sid-1',
        ip: '203.0.113.9',
        created_at: new Date('2026-10-24T10:00:00Z'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'v1', first_name: 'Ann', last_name: 'Lee' },
    ]);
    prisma.session.findMany.mockResolvedValue([
      { session_chain_id: 'sid-1', device_name: 'iPhone 15', platform: 'ios' },
    ]);
    await expect(svc.viewsOf('owner', 'f1')).resolves.toEqual([
      {
        viewerUserId: 'v1',
        viewerName: 'Ann Lee',
        viewedAt: '2026-10-24T10:00:00.000Z',
        device: 'iPhone 15',
        platform: 'ios',
        ip: '203.0.113.9',
      },
    ]);
    expect(prisma.fileAccessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'desc' } }),
    );
  });
});
