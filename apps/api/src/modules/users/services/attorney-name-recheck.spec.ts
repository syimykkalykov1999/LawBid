import type { Prisma } from '@prisma/client';
import {
  nameChanged,
  namesClose,
  startNameRecheckIfVerified,
} from './attorney-name-recheck';

/** Owner decision 2026-09-30 (OQ-029): name changes never block; a big
 * change hides the blue check automatically. */
describe('attorney name change (OQ-029)', () => {
  const verified = { first_name: 'Anna', last_name: 'Kowalski' };

  it('detects a changed first or last name', () => {
    expect(nameChanged(verified, { ...verified })).toBe(false);
    expect(nameChanged(verified, { ...verified, last_name: 'Lee' })).toBe(true);
  });

  it.each([
    ['typo fix', { first_name: 'Ana', last_name: 'Kowalski' }],
    ['case and accents', { first_name: 'ANNA', last_name: 'Kowálski' }],
    ['swapped order', { first_name: 'Kowalski', last_name: 'Anna' }],
    ['middle name added', { first_name: 'Anna Maria', last_name: 'Kowalski' }],
    ['two typos in a long word', { first_name: 'Anna', last_name: 'Kovalsky' }],
  ])('close: %s', (_label, after) => {
    expect(namesClose(verified, after)).toBe(true);
  });

  it.each([
    ['other surname', { first_name: 'Anna', last_name: 'Lee' }],
    ['other person', { first_name: 'Saul', last_name: 'Goodman' }],
    ['two extra words', { first_name: 'Anna B C', last_name: 'Kowalski' }],
  ])('far: %s', (_label, after) => {
    expect(namesClose(verified, after)).toBe(false);
  });

  function tx(snapshot: typeof verified | null) {
    return {
      attorneyProfile: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            snapshot
              ? {
                  verified_first_name: snapshot.first_name,
                  verified_last_name: snapshot.last_name,
                }
              : { verified_first_name: null, verified_last_name: null },
          ),
        ),
        update: jest.fn(() => Promise.resolve({})),
      },
    };
  }
  const run = (t: ReturnType<typeof tx>, after: typeof verified) =>
    startNameRecheckIfVerified(
      t as unknown as Prisma.TransactionClient,
      'u1',
      verified,
      after,
    );

  it('far change sets name_mismatch; the status is never touched', async () => {
    const t = tx(verified);
    expect(await run(t, { first_name: 'Saul', last_name: 'Goodman' })).toBe(
      true,
    );
    expect(t.attorneyProfile.update).toHaveBeenCalledWith({
      where: { user_id: 'u1' },
      data: { name_mismatch: true },
    });
  });

  it('close change clears name_mismatch', async () => {
    const t = tx(verified);
    expect(await run(t, { first_name: 'Ana', last_name: 'Kowalski' })).toBe(
      false,
    );
    expect(t.attorneyProfile.update).toHaveBeenCalledWith({
      where: { user_id: 'u1' },
      data: { name_mismatch: false },
    });
  });

  it('never verified (no snapshot): nothing changes', async () => {
    const t = tx(null);
    expect(await run(t, { first_name: 'Saul', last_name: 'Goodman' })).toBe(
      false,
    );
    expect(t.attorneyProfile.update).not.toHaveBeenCalled();
  });

  it('unchanged name: no DB access', async () => {
    const t = tx(verified);
    expect(await run(t, { ...verified })).toBe(false);
    expect(t.attorneyProfile.findUnique).not.toHaveBeenCalled();
  });
});
