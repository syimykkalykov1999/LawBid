import { ConflictException, NotFoundException } from '@nestjs/common';
import { CaseCommentsService } from './case-comments.service';

const NOW = new Date('2026-11-01T12:00:00Z');

function make(over: {
  comment?: Record<string, unknown> | null;
  windowMin?: number;
  maxEdits?: number;
  verdict?: 'allow' | 'block' | 'hold';
}) {
  const row = {
    id: 'c1',
    case_id: 'case1',
    author_id: 'u1',
    parent_comment_id: null,
    body: 'first text',
    status: 'published',
    like_count: 0,
    reply_count: 0,
    deleted_at: null,
    edited_at: null,
    edit_count: 0,
    edit_history: [],
    created_at: new Date(NOW.getTime() - 5 * 60_000),
    ...(over.comment ?? {}),
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    caseComment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(over.comment === null ? null : row),
      updateMany,
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...row, body: 'new text' }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    caseCommentLike: { findMany: jest.fn().mockResolvedValue([]) },
    userBlock: { findFirst: jest.fn().mockResolvedValue(null) },
    case: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ client_id: 'owner' }),
    },
  };
  const counters = {
    bump: jest.fn(),
    pending: jest.fn().mockResolvedValue(new Map()),
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(
        k === 'case_comments.edit_window_minutes'
          ? (over.windowMin ?? 15)
          : (over.maxEdits ?? 5),
      ),
    ),
  };
  const svc = new CaseCommentsService(
    prisma as never,
    { assertCanView: jest.fn() } as never,
    { consume: jest.fn() } as never,
    counters as never,
    { emit: jest.fn() } as never,
    { avatarUrlsMany: jest.fn().mockResolvedValue(new Map()) } as never,
    settings as never,
    { check: jest.fn().mockResolvedValue(over.verdict ?? 'allow') },
  );
  return { svc, updateMany, counters, prisma };
}

describe('case comment edit', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('keeps the old text in the history and sets the edited flag', async () => {
    const { svc, updateMany } = make({});
    const out = await svc.edit({ sub: 'u1' } as never, 'c1', 'new text');
    expect(out.body).toBe('new text');
    const data = updateMany.mock.calls[0][0].data;
    expect(data.body).toBe('new text');
    expect(data.edited_at).toEqual(NOW);
    expect(data.edit_count).toEqual({ increment: 1 });
    expect(data.edit_history).toEqual([
      { body: 'first text', editedAt: NOW.toISOString(), editedBy: 'u1' },
    ]);
    expect(updateMany.mock.calls[0][0].where.edit_count).toBe(0);
  });

  it('appends to an existing history, never rewrites it', async () => {
    const prev = { body: 'v0', editedAt: 'x', editedBy: 'u1' };
    const { svc, updateMany } = make({
      comment: { edit_count: 1, edit_history: [prev] },
    });
    await svc.edit({ sub: 'u1' } as never, 'c1', 'new text');
    const hist = updateMany.mock.calls[0][0].data.edit_history;
    expect(hist).toHaveLength(2);
    expect(hist[0]).toEqual(prev);
  });

  it('refuses after the window', async () => {
    const { svc } = make({
      comment: { created_at: new Date(NOW.getTime() - 16 * 60_000) },
    });
    await expect(
      svc.edit({ sub: 'u1' } as never, 'c1', 'new text'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('window 0 means editing is off', async () => {
    const { svc } = make({ windowMin: 0 });
    await expect(
      svc.edit({ sub: 'u1' } as never, 'c1', 'new text'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses beyond the edit cap', async () => {
    const { svc } = make({ comment: { edit_count: 5 } });
    await expect(
      svc.edit({ sub: 'u1' } as never, 'c1', 'new text'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('only the author finds it; others get not found', async () => {
    const { svc } = make({ comment: null });
    await expect(
      svc.edit({ sub: 'u2' } as never, 'c1', 'new text'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a blocked text is refused and nothing is written', async () => {
    const { svc, updateMany } = make({ verdict: 'block' });
    await expect(
      svc.edit({ sub: 'u1' } as never, 'c1', 'new text'),
    ).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
