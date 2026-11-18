import { NotificationsService } from './notifications.service';

/**
 * Verify batch 8 (17.11), NO6: every repeat of a daily case digest queued
 * its delivery job as `${id}-2`. BullMQ ignores a job whose id it already
 * keeps (completed jobs stay, removeOnComplete count 1000), so from the
 * third case on the bell got no realtime event and no badge recount. The
 * job id now grows with the row's aggregate_count, as [emit] does.
 */
const U1 = '11111111-1111-4111-8111-111111111111';

function setup(answers: { n: number; inserted: boolean }[]) {
  const seqs: number[] = [];
  let i = 0;
  const prisma = {
    $queryRaw: () => Promise.resolve([{ id: 'n1', ...answers[i++] }]),
  };
  const push = {
    enqueue: (_id: string, _type: string, seq: number) => {
      seqs.push(seq);
      return Promise.resolve();
    },
  };
  const badges = { invalidateNotifications: () => Promise.resolve() };
  const svc = new NotificationsService(
    prisma as never,
    push as never,
    badges as never,
  );
  return { svc, seqs };
}

describe('NotificationsService.emitDigest job sequence (NO6)', () => {
  it('each new case in the digest queues a job id of its own', async () => {
    const { svc, seqs } = setup([
      { n: 1, inserted: true },
      { n: 2, inserted: false },
      { n: 3, inserted: false },
      { n: 4, inserted: false },
    ]);
    for (const caseId of ['c1', 'c2', 'c3', 'c4']) {
      await svc.emitDigest({
        type: 'new_case_digest' as never,
        recipientIds: [U1],
        caseId,
        dedupeKey: 'digest:2026-11-17',
      });
    }
    expect(seqs[0]).toBe(1);
    expect(new Set(seqs).size).toBe(4);
  });

  it('a repeat never takes seq 1 (the one that pushes)', async () => {
    // A retry of the first case: the row exists, the count did not move.
    const { svc, seqs } = setup([{ n: 1, inserted: false }]);
    await svc.emitDigest({
      type: 'new_case_digest' as never,
      recipientIds: [U1],
      caseId: 'c1',
      dedupeKey: 'digest:2026-11-17',
    });
    expect(seqs[0]).toBeGreaterThan(1);
  });
});
