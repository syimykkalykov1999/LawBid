import { StarsService } from './stars.service';

/**
 * Row 69 (KE 123): the chat reaction endpoint calls chargeReaction inside
 * its own transaction. Reading the stars settings / switch through the root
 * client there took a second pool connection per reaction while the
 * transaction held its first (P2028 under concurrency). They are read on
 * the caller's transaction now.
 */
describe('StarsService reads inside the caller transaction (row 69)', () => {
  const rootRead = () => {
    throw new Error('root client used inside a transaction');
  };
  const root = {
    appConfig: { findUnique: jest.fn(rootRead) },
    featureFlag: { findUnique: jest.fn(rootRead) },
  };
  const svc = new StarsService(
    root as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const txWith = (enabled: boolean) => ({
    appConfig: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          value: { premiumReactions: ['🔥'], reactionStars: 3 },
        }),
      ),
    },
    featureFlag: { findUnique: jest.fn(() => Promise.resolve({ enabled })) },
  });

  it('chargeReaction: a free emoji reads the settings on the tx only', async () => {
    const tx = txWith(true);
    await expect(
      svc.chargeReaction(tx as never, 'u1', 'm1', '👍'),
    ).resolves.toBe(0);
    expect(tx.appConfig.findUnique).toHaveBeenCalledTimes(1);
    expect(root.appConfig.findUnique).not.toHaveBeenCalled();
  });

  it('chargeReaction: the stars switch is read on the tx too', async () => {
    const tx = txWith(false);
    await expect(
      svc.chargeReaction(tx as never, 'u1', 'm1', '🔥'),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.featureFlag.findUnique).toHaveBeenCalledTimes(1);
    expect(root.featureFlag.findUnique).not.toHaveBeenCalled();
  });

  it('starsForCents / assertEnabled take the caller client', async () => {
    const tx = txWith(false);
    await expect(svc.starsForCents(500, tx as never)).resolves.toBeNull();
    await expect(svc.assertEnabled(tx as never)).rejects.toMatchObject({
      status: 409,
    });
    expect(root.featureFlag.findUnique).not.toHaveBeenCalled();
  });
});
