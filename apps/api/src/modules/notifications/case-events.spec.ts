import { eventOf, publishCaseEvent } from './case-events';
import { NotificationsService } from './notifications.service';

/** Owner 2026-10-22 (client economy plan, package E): case / bid /
 * consultation notifications imply a realtime event on the same seam. */
describe('case events from notifications', () => {
  it('maps the notification types to case:update kinds', () => {
    expect(eventOf('bid_received', { caseId: 'c', bidId: 'b' })).toEqual({
      event: 'case:update',
      data: {
        caseId: 'c',
        kind: 'bid_new',
        bidId: 'b',
        bid: { bidId: 'b', status: 'active' },
        source: 'bid_received',
      },
    });
    expect(
      eventOf('bid_rejected', { caseId: 'c', bidId: 'b', reason: 'withdrawn' })
        ?.data,
    ).toMatchObject({ kind: 'bid_withdrawn' });
    expect(
      eventOf('bid_rejected', { caseId: 'c', bidId: 'b', reason: 'x' })?.data,
    ).toMatchObject({ kind: 'bid_declined' });
    expect(eventOf('offer_countered', { caseId: 'c' })?.data).toMatchObject({
      kind: 'bid_countered',
    });
    expect(eventOf('case_closed', { caseId: 'c' })?.data).toMatchObject({
      kind: 'closed',
    });
    expect(
      eventOf('case_workspace_activity', { caseId: 'c' })?.data,
    ).toMatchObject({ kind: 'task' });
  });

  it('a bid event carries the one-bid patch (status, amount) for the app', () => {
    expect(
      eventOf('offer_countered', {
        caseId: 'c',
        bidId: 'b',
        amountCents: 9000,
      })?.data.bid,
    ).toEqual({ bidId: 'b', status: 'active', amountCents: 9000 });
    expect(
      eventOf('offer_accepted', { caseId: 'c', bidId: 'b' })?.data.bid,
    ).toEqual({ bidId: 'b', status: 'accepted' });
    expect(
      eventOf('bid_rejected', { caseId: 'c', bidId: 'b', reason: 'withdrawn' })
        ?.data.bid,
    ).toEqual({ bidId: 'b', status: 'withdrawn' });
    expect(
      eventOf('bid_rejected', {
        caseId: 'c',
        bidId: 'b',
        reason: 'another_bid_accepted',
      })?.data.bid,
    ).toEqual({ bidId: 'b', status: 'rejected_auto' });
    expect(
      eventOf('negotiation_failed', { caseId: 'c', bidId: 'b' })?.data.bid,
    ).toEqual({ bidId: 'b', status: 'failed_negotiation' });
    // No bid id, or a reason the patch cannot say for certain: no patch.
    expect(
      eventOf('offer_countered', { caseId: 'c' })?.data.bid,
    ).toBeUndefined();
    expect(
      eventOf('bid_rejected', { caseId: 'c', bidId: 'b', reason: 'x' })?.data
        .bid,
    ).toBeUndefined();
  });

  it('consultation_update → consultation:update; unrelated types → nothing', () => {
    expect(
      eventOf('consultation_update', {
        consultationId: 'k',
        kind: 'confirmed',
      }),
    ).toEqual({
      event: 'consultation:update',
      data: { consultationId: 'k', kind: 'confirmed' },
    });
    expect(eventOf('post_like', { postId: 'p' })).toBeNull();
    expect(eventOf('bid_received', { bidId: 'b' })).toBeNull();
  });

  it('publishes to the recipient, at once or after the transaction delay', () => {
    jest.useFakeTimers();
    const toUsers = jest.fn();
    const realtime = { toUsers } as never;
    publishCaseEvent(realtime, 'u1', 'bid_received', {
      caseId: 'c',
      bidId: 'b',
    });
    expect(toUsers).toHaveBeenCalledWith(['u1'], 'case:update', {
      caseId: 'c',
      kind: 'bid_new',
      bidId: 'b',
      bid: { bidId: 'b', status: 'active' },
      source: 'bid_received',
    });
    toUsers.mockClear();
    publishCaseEvent(realtime, 'u1', 'case_closed', { caseId: 'c' }, 300);
    expect(toUsers).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(toUsers).toHaveBeenCalledTimes(1);
    publishCaseEvent(undefined, 'u1', 'case_closed', { caseId: 'c' });
    jest.useRealTimers();
  });

  it('NotificationsService.emit publishes the event beside the stored row', async () => {
    const toUsers = jest.fn();
    const prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'n1' }),
      },
    };
    const svc = new NotificationsService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      { toUsers } as never,
    );
    await svc.emit({
      type: 'case_closed',
      recipientId: 'client',
      payload: { caseId: 'c' },
    } as never);
    expect(toUsers).toHaveBeenCalledWith(['client'], 'case:update', {
      caseId: 'c',
      kind: 'closed',
      source: 'case_closed',
    });
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});
