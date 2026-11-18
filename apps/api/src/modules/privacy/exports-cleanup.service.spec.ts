import { ExportsCleanupService } from './exports-cleanup.service';

/** Verify 18.11 (PV6): the expired-export sweep. */
function job(i: number, user = 'u1') {
  return {
    id: `e${String(i).padStart(5, '0')}`,
    user_id: user,
    status: 'ready',
    expires_at: new Date(1_700_000_000_000 + i),
    file: { id: `f${i}`, s3_bucket: 'docs', s3_key: `k${i}` },
  };
}

function build(pages: ReturnType<typeof job>[][], heldFiles: string[] = []) {
  const findMany = jest.fn((arg: { cursor?: { id: string } }) => {
    if (!arg.cursor) return Promise.resolve(pages[0] ?? []);
    const at = pages.findIndex(
      (p) => p.length && p[p.length - 1].id === arg.cursor?.id,
    );
    return Promise.resolve(pages[at + 1] ?? []);
  });
  const prisma = {
    $executeRaw: jest.fn(() => Promise.resolve(0)),
    legalHold: {
      findMany: jest.fn(
        (arg: { where: { AND: [unknown, { target_type: string }] } }) =>
          Promise.resolve(
            arg.where.AND[1].target_type === 'file'
              ? heldFiles.map((id) => ({ target_id: id }))
              : [],
          ),
      ),
    },
    dataExportJob: {
      findMany,
      update: jest.fn(() => Promise.resolve({})),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    file: { update: jest.fn(() => Promise.resolve({})) },
  };
  const storage = {
    configured: true,
    remove: jest.fn(() => Promise.resolve()),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const svc = new ExportsCleanupService(
    prisma as never,
    storage as never,
    logger as never,
  );
  return { svc, prisma, storage, logger };
}

describe('ExportsCleanupService (verify 18.11, PV6)', () => {
  it('one failed storage delete does not stop the run: the other exports still expire', async () => {
    const { svc, prisma, storage, logger } = build([[job(1), job(2)]]);
    storage.remove.mockRejectedValueOnce(new Error('S3 503'));
    const r = await svc.run(new Date(1_800_000_000_000));
    expect(r.expired).toBe(1);
    expect(prisma.dataExportJob.update).toHaveBeenCalledWith({
      where: { id: 'e00002' },
      data: { status: 'expired' },
    });
    expect(prisma.dataExportJob.update).not.toHaveBeenCalledWith({
      where: { id: 'e00001' },
      data: { status: 'expired' },
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('reads the oldest first and pages past a full page of held exports', async () => {
    const heldPage = Array.from({ length: 1000 }, (_, i) => job(i));
    const next = [job(5000)];
    const { svc, prisma } = build(
      [heldPage, next],
      heldPage.map((j) => j.file.id),
    );
    const r = await svc.run(new Date(1_800_000_000_000));
    expect(r.expired).toBe(1);
    const first = prisma.dataExportJob.findMany.mock.calls[0][0] as {
      orderBy: unknown;
    };
    expect(first.orderBy).toEqual([{ expires_at: 'asc' }, { id: 'asc' }]);
    expect(prisma.dataExportJob.update).toHaveBeenCalledWith({
      where: { id: 'e05000' },
      data: { status: 'expired' },
    });
  });
});
