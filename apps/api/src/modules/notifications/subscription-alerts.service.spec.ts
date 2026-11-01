import {
  SubscriptionAlertsService,
  ALERT_BATCH,
} from './subscription-alerts.service';

/** Audit A-1: followers of a post are read by keyset and written in batches. */
describe('SubscriptionAlertsService.followersOfPost', () => {
  const ids = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(from + i).padStart(12, '0')}`,
    }));

  function setup(pages: { id: string }[][]) {
    const queryRaw = jest.fn();
    for (const p of pages) queryRaw.mockResolvedValueOnce(p);
    const emitMany = jest.fn((a: { recipientIds: string[] }) =>
      Promise.resolve(a.recipientIds.length),
    );
    const svc = new SubscriptionAlertsService(
      { $queryRaw: queryRaw } as never,
      { emitMany } as never,
    );
    return { svc, queryRaw, emitMany };
  }

  it('pages through a big audience and dedupes by post', async () => {
    const first = ids(1, ALERT_BATCH);
    const second = ids(ALERT_BATCH + 1, 7);
    const { svc, queryRaw, emitMany } = setup([first, second]);
    const sent = await svc.followersOfPost('author', 'post-1', true);
    expect(sent).toBe(ALERT_BATCH + 7);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(emitMany).toHaveBeenCalledTimes(2);
    expect(emitMany.mock.calls[0][0]).toMatchObject({
      type: 'followed_post',
      dedupeKey: 'followed_post:post-1',
      payload: { postId: 'post-1', actorId: 'author', kind: 'brief' },
    });
  });

  it('stops at the first short page and sends nothing for no followers', async () => {
    const a = setup([ids(1, 3)]);
    expect(await a.svc.followersOfPost('x', 'p')).toBe(3);
    expect(a.queryRaw).toHaveBeenCalledTimes(1);
    const b = setup([[]]);
    expect(await b.svc.followersOfPost('x', 'p')).toBe(0);
    expect(b.emitMany).not.toHaveBeenCalled();
  });
});
