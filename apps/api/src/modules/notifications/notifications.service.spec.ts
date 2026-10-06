import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_IMPORTANT,
  NotificationsService,
  notificationTypesOf,
} from './notifications.service';

describe('NotificationsService.emit (docs/05 §9.3 seam)', () => {
  function db() {
    const create = jest.fn(() => Promise.resolve({ id: 'n1' }));
    return { create, client: { notification: { create } } };
  }

  it('persists a row with the §9.2 category, through the caller transaction when given', async () => {
    const root = db();
    const tx = db();
    const service = new NotificationsService(
      root.client as unknown as PrismaService,
    );

    await expect(
      service.emit(
        {
          type: 'review_received',
          recipientId: 'u1',
          payload: { reviewId: 'r1' },
        },
        tx.client as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toEqual({ id: 'n1' });

    expect(root.create).not.toHaveBeenCalled();
    expect(tx.create).toHaveBeenCalledWith({
      data: {
        user_id: 'u1',
        type: 'review_received',
        category: 'cases',
        payload: { reviewId: 'r1' },
      },
      select: { id: true },
    });
  });

  it('never stores new_message (push-only type)', async () => {
    const root = db();
    const service = new NotificationsService(
      root.client as unknown as PrismaService,
    );
    await expect(
      service.emit({ type: 'new_message', recipientId: 'u1', payload: {} }),
    ).resolves.toBeNull();
    expect(root.create).not.toHaveBeenCalled();
  });

  it('maps review types to the cases category (docs/05 §9.2)', () => {
    expect(NOTIFICATION_CATEGORY.review_requested).toBe('cases');
    expect(NOTIFICATION_CATEGORY.review_received).toBe('cases');
    expect(NOTIFICATION_CATEGORY.verification_update).toBe('system');
  });

  it('maps case_updated (docs/04 §14) to the cases category (docs/05 §9.2)', () => {
    expect(NOTIFICATION_CATEGORY.case_updated).toBe('cases');
  });
});

describe('Bell tabs (owner 2026-10-06)', () => {
  it('a hire is important; likes, follows and logins are not', () => {
    expect(NOTIFICATION_IMPORTANT.bid_accepted).toBe(true);
    expect(NOTIFICATION_IMPORTANT.offer_accepted).toBe(true);
    for (const t of [
      'post_like',
      'new_follower',
      'followed_post',
      'security_new_device',
    ] as const) {
      expect(NOTIFICATION_IMPORTANT[t]).toBe(false);
    }
    const important = notificationTypesOf(true);
    const other = notificationTypesOf(false);
    expect(important).toContain('bid_accepted');
    expect(other).toContain('post_like');
    expect(important.filter((t) => other.includes(t))).toEqual([]);
  });
});
