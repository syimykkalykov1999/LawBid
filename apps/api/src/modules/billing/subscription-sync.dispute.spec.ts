import { SubscriptionSyncService } from './subscription-sync.service';
import type { ProviderEvent } from './payment-provider';

/** R-237: which dispute events reach the subscription dispute hook. */
function setup() {
  const casePayments = {
    handleProviderEvent: jest.fn(() => Promise.resolve()),
  };
  const hook = jest.fn(() => Promise.resolve());
  const svc = new SubscriptionSyncService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    casePayments as never,
  );
  svc.setDisputeHook(hook);
  return { svc, casePayments, hook };
}

const ev = (
  type: string,
  extra: Record<string, unknown> = {},
): ProviderEvent => ({
  id: 'evt_1',
  type,
  created: 1,
  object: { object: 'dispute', id: 'dp_1', ...extra },
});

describe('SubscriptionSyncService dispute routing (R-237)', () => {
  it('a platform dispute goes to case payments first, then to the hook', async () => {
    const t = setup();
    await t.svc.handleEvent(ev('charge.dispute.created'));
    expect(t.casePayments.handleProviderEvent).toHaveBeenCalledTimes(1);
    expect(t.hook).toHaveBeenCalledTimes(1);
    expect(
      t.casePayments.handleProviderEvent.mock.invocationCallOrder[0],
    ).toBeLessThan(t.hook.mock.invocationCallOrder[0]);
  });

  it('a dispute on a connected account never reaches the hook', async () => {
    const t = setup();
    await t.svc.handleEvent(
      ev('charge.dispute.created', { _account: 'acct_1' }),
    );
    expect(t.casePayments.handleProviderEvent).toHaveBeenCalledTimes(1);
    expect(t.hook).not.toHaveBeenCalled();
  });

  it('a hook failure fails the event (the queue retries it)', async () => {
    const t = setup();
    t.hook.mockRejectedValueOnce(new Error('stripe down'));
    await expect(
      t.svc.handleEvent(ev('charge.dispute.closed')),
    ).rejects.toThrow('stripe down');
  });
});
