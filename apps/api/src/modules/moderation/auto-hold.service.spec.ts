import { AutoHoldService } from './auto-hold.service';

/** Algo audit 2026-10-27 (CONTENT H-2): the author hears about a hold. */
describe('AutoHoldService notices (CONTENT H-2)', () => {
  function build(settings: Record<string, boolean>, existing = false) {
    const prisma = {
      report: {
        findFirst: jest.fn().mockResolvedValue(existing ? { id: 'r0' } : null),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
      },
    };
    const s = {
      boolean: jest.fn((k: string) => Promise.resolve(settings[k] ?? true)),
    };
    const notifications = { emit: jest.fn().mockResolvedValue({ id: 'n1' }) };
    const svc = new AutoHoldService(
      prisma as never,
      s as never,
      notifications as never,
    );
    return { svc, prisma, notifications };
  }
  const input = {
    targetType: 'post' as const,
    targetId: 'p1',
    authorId: 'u1',
    rule: 'rules',
  };

  it('a held post files the queue ticket and tells the author', async () => {
    const { svc, prisma, notifications } = build({});
    expect(await svc.queue(input)).toBe(true);
    expect(prisma.report.create).toHaveBeenCalled();
    expect(notifications.emit).toHaveBeenCalledWith({
      type: 'moderation_notice',
      recipientId: 'u1',
      payload: {
        action: 'content_held',
        targetType: 'post',
        targetId: 'p1',
        reason: 'held_for_review',
      },
    });
  });

  it('already queued: no second ticket, no second notice', async () => {
    const { svc, notifications } = build({}, true);
    expect(await svc.queue(input)).toBe(false);
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('switch off: the ticket is filed silently (the old behaviour)', async () => {
    const { svc, prisma, notifications } = build({
      'moderation.held_notice_enabled': false,
    });
    expect(await svc.queue(input)).toBe(true);
    expect(prisma.report.create).toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('a hidden picture: one notice to its owner', async () => {
    const { svc, notifications } = build({});
    await svc.mediaHidden({ userId: 'u2', checkId: 'c1', hidden: 2 });
    expect(notifications.emit).toHaveBeenCalledWith({
      type: 'moderation_notice',
      recipientId: 'u2',
      payload: {
        action: 'media_hidden',
        checkId: 'c1',
        count: 2,
        reason: 'image_review',
      },
    });
  });

  it('a failing notice never breaks the caller', async () => {
    const { svc, notifications } = build({});
    notifications.emit.mockRejectedValueOnce(new Error('down'));
    await expect(
      svc.mediaHidden({ userId: 'u2', checkId: 'c1', hidden: 1 }),
    ).resolves.toBeUndefined();
  });
});
