import type { LeasePort } from './lease.port';
import { closeStaffDecision, reopenStaffItem } from './staff-decision';
import type { StaffRecorder } from './staff-recorder.port';

const ev = {
  adminId: 'a1',
  kind: 'verification',
  itemId: 'i1',
  outcome: 'approve',
};

type Mocks = {
  servesQueue: jest.Mock;
  done: jest.Mock;
  reopen: jest.Mock;
};

/** A lease engine whose calls we can look at (mocks kept apart from the port). */
const lease = (over: Partial<Mocks> = {}): { port: LeasePort } & Mocks => {
  const m: Mocks = {
    servesQueue: jest.fn().mockResolvedValue(true),
    done: jest.fn().mockResolvedValue(4200),
    reopen: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  return {
    ...m,
    port: {
      releaseAllFor: jest.fn(),
      nextFor: jest.fn(),
      servesQueue: m.servesQueue,
      done: m.done,
      reopen: m.reopen,
    },
  };
};

describe('closeStaffDecision', () => {
  it('ends the lease and reports the decision with how long it was held', async () => {
    const l = lease();
    const record = jest.fn().mockResolvedValue(undefined);
    await closeStaffDecision({ lease: l.port, recorder: { record } }, ev);
    expect(l.done).toHaveBeenCalledWith('verification', 'i1', 'a1', 'approve');
    expect(record).toHaveBeenCalledWith({
      adminId: 'a1',
      itemKind: 'verification',
      itemId: 'i1',
      outcome: 'approve',
      handleMs: 4200,
    });
  });

  it('leaves the lease alone while the queue is not served by leases, still reports', async () => {
    const l = lease({ servesQueue: jest.fn().mockResolvedValue(false) });
    const record = jest.fn().mockResolvedValue(undefined);
    await closeStaffDecision({ lease: l.port, recorder: { record } }, ev);
    expect(l.done).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.not.objectContaining({ handleMs: expect.anything() }),
    );
  });

  it('reports no duration when the person did not hold the item', async () => {
    const l = lease({ done: jest.fn().mockResolvedValue(null) });
    const record = jest.fn().mockResolvedValue(undefined);
    await closeStaffDecision({ lease: l.port, recorder: { record } }, ev);
    expect(record.mock.calls[0][0]).not.toHaveProperty('handleMs');
  });

  it('never throws into the decision: a failing lease or recorder is swallowed', async () => {
    const l = lease({ done: jest.fn().mockRejectedValue(new Error('boom')) });
    const record = jest.fn().mockRejectedValue(new Error('boom'));
    const recorder: StaffRecorder = { record };
    await expect(
      closeStaffDecision({ lease: l.port, recorder }, ev),
    ).resolves.toBeUndefined();
    expect(record).toHaveBeenCalled();
  });

  it('works with neither a lease engine nor a recorder (unit wiring)', async () => {
    await expect(closeStaffDecision({}, ev)).resolves.toBeUndefined();
  });
});

describe('reopenStaffItem', () => {
  it('reopens only while the queue is served by leases', async () => {
    const on = lease();
    await reopenStaffItem(on.port, 'support_ticket', 't1');
    expect(on.reopen).toHaveBeenCalledWith('support_ticket', 't1');
    const off = lease({ servesQueue: jest.fn().mockResolvedValue(false) });
    await reopenStaffItem(off.port, 'support_ticket', 't1');
    expect(off.reopen).not.toHaveBeenCalled();
    await expect(
      reopenStaffItem(undefined, 'support_ticket', 't1'),
    ).resolves.toBeUndefined();
  });

  it('swallows an engine failure', async () => {
    const l = lease({ reopen: jest.fn().mockRejectedValue(new Error('x')) });
    await expect(
      reopenStaffItem(l.port, 'support_ticket', 't1'),
    ).resolves.toBeUndefined();
  });
});
