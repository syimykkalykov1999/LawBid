import { CrossFamilyOutbox, parseOutboxSweepMode } from './cross-family-outbox';

/** Audit X-22 (2026-10-26): `ops.outbox_sweep.mode` off | on | auto. */
describe('CrossFamilyOutbox sweep modes', () => {
  function setup(pending: boolean, queryFails = false) {
    const queryRaw = jest.fn(() => {
      if (queryFails) throw new Error('db down');
      // hasPending selects `found`, sweep claims rows: tell them apart by call order
      return Promise.resolve(pending ? [{ found: 1 }] : []);
    });
    const outbox = new CrossFamilyOutbox({} as never);
    jest
      .spyOn(outbox as never, 'databases')
      .mockReturnValue([
        { key: 'primary', client: { $queryRaw: queryRaw } },
      ] as never);
    return { outbox, queryRaw };
  }

  it('parses a setting value; anything unknown means auto', () => {
    expect(parseOutboxSweepMode('off')).toBe('off');
    expect(parseOutboxSweepMode('on')).toBe('on');
    expect(parseOutboxSweepMode('auto')).toBe('auto');
    expect(parseOutboxSweepMode('weird')).toBe('auto');
  });

  it('off never touches the database', async () => {
    const { outbox, queryRaw } = setup(true);
    await expect(outbox.sweep('off')).resolves.toEqual({
      applied: 0,
      failed: 0,
      skipped: 'off',
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('auto with an empty outbox does one cheap look and stops', async () => {
    const { outbox, queryRaw } = setup(false);
    await expect(outbox.sweep('auto')).resolves.toEqual({
      applied: 0,
      failed: 0,
      skipped: 'empty',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('auto with a waiting event goes on to claim and apply', async () => {
    const { outbox, queryRaw } = setup(true);
    // the claim returns the same one-element list; apply() fails on the
    // bare stub, which is counted, not thrown
    jest.spyOn(outbox as never, 'apply').mockResolvedValue(true as never);
    await expect(outbox.sweep('auto')).resolves.toEqual({
      applied: 1,
      failed: 0,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('on sweeps every tick without the look', async () => {
    const { outbox, queryRaw } = setup(false);
    await expect(outbox.sweep('on')).resolves.toEqual({
      applied: 0,
      failed: 0,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('auto treats an unreachable database as «maybe waiting»', async () => {
    const { outbox } = setup(false, true);
    await expect(outbox.hasPending()).resolves.toBe(true);
  });
});
