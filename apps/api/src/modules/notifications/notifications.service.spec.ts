import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATION_CATEGORY,
  NotificationsService,
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
});
