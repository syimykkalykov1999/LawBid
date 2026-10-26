import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FileReleaseService } from '../files/storage/file-release.service';
import { DisappearingSweepService } from './disappearing-sweep.service';

function build(chatRows: unknown[][]) {
  const queryRaw = jest.fn();
  for (const rows of chatRows) queryRaw.mockResolvedValueOnce(rows);
  queryRaw.mockResolvedValue([]);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const tokenDelete = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: jest.fn().mockResolvedValue([]),
    messagePin: { deleteMany: jest.fn() },
    messageReaction: { deleteMany: jest.fn() },
    messageSearchToken: { deleteMany: tokenDelete },
  } as unknown as PrismaService;
  const release = jest.fn().mockResolvedValue({ released: 2 });
  const releases = { release } as unknown as FileReleaseService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
  } as unknown as PinoLogger;
  return {
    svc: new DisappearingSweepService(prisma, releases, logger),
    tokenDelete,
    executeRaw,
    queryRaw,
    release,
  };
}

describe('DisappearingSweepService', () => {
  const now = new Date('2026-10-21T00:00:00Z');

  it('does nothing when nothing has expired', async () => {
    const { svc, release, executeRaw } = build([]);
    expect(await svc.run(now)).toEqual({
      messages: 0,
      groupMessages: 0,
      files: 0,
    });
    expect(release).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('marks expired messages deleted, repoints previews and frees their files', async () => {
    const { svc, release, executeRaw, queryRaw, tokenDelete } = build([
      [
        { id: 'm1', chat_id: 'c1', file_id: 'f1' },
        { id: 'm2', chat_id: 'c1', file_id: null },
      ],
      [{ id: 'g1m', chat_id: 'g1', file_id: 'f2' }],
    ]);
    const res = await svc.run(now);
    expect(res).toEqual({ messages: 2, groupMessages: 1, files: 2 });
    // The UPDATE is the user's own «delete» (deleted_at), driven by the
    // partial expiry index and SKIP LOCKED.
    const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('expires_at <=');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('SKIP LOCKED');
    expect(sql).toContain('SET deleted_at');
    expect(release).toHaveBeenCalledWith(['f1', 'f2'], 'disappeared', now);
    // chat preview, then group preview/pin and topic preview
    expect(executeRaw).toHaveBeenCalledTimes(3);
    // BUG-1: the vanished messages leave the search index too.
    expect(tokenDelete).toHaveBeenCalledWith({
      where: { message_id: { in: ['m1', 'm2'] } },
    });
  });

  it('keeps going while batches come back full', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      id: `m${i}`,
      chat_id: 'c1',
      file_id: null,
    }));
    const { svc, queryRaw } = build([
      full,
      [{ id: 'x', chat_id: 'c1', file_id: null }],
    ]);
    const res = await svc.run(now);
    expect(res.messages).toBe(1001);
    // 2 message batches + 1 group probe
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});
