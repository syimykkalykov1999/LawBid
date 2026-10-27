import { PnlService, PNL_BUTTON_COOLDOWN_MS } from './pnl.service';

function make(stored: { computedAt: string } | null) {
  const summary = {
    peek: jest.fn().mockResolvedValue(stored ? { data: {}, ...stored } : null),
    refresh: jest.fn().mockResolvedValue({ data: {}, computedAt: 'new' }),
  };
  const svc = new PnlService({} as never, summary as never, undefined);
  return { svc, summary };
}

describe('PnlService button', () => {
  it('does not recount inside 10 minutes', async () => {
    const { svc, summary } = make({
      computedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await svc.refreshFromButton();
    expect(summary.refresh).not.toHaveBeenCalled();
  });

  it('recounts when older than 10 minutes or never counted', async () => {
    const old = make({
      computedAt: new Date(
        Date.now() - PNL_BUTTON_COOLDOWN_MS - 1000,
      ).toISOString(),
    });
    await old.svc.refreshFromButton();
    expect(old.summary.refresh).toHaveBeenCalledTimes(1);
    const none = make(null);
    await none.svc.refreshFromButton();
    expect(none.summary.refresh).toHaveBeenCalledTimes(1);
  });
});
