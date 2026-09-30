import type { Prisma } from '@prisma/client';
import {
  nameChanged,
  namesClose,
  startNameRecheckIfVerified,
} from './attorney-name-recheck';

/** Owner decision 2026-09-30, final (OQ-029): name changes never touch the
 * account status or the blue check. */
describe('attorney name change (OQ-029 final)', () => {
  const verified = { first_name: 'Anna', last_name: 'Kowalski' };

  it('detects a changed first or last name', () => {
    expect(nameChanged(verified, { ...verified })).toBe(false);
    expect(nameChanged(verified, { ...verified, last_name: 'Lee' })).toBe(true);
  });

  it('keeps the helper for typo-level comparisons', () => {
    expect(
      namesClose(verified, { first_name: 'Ana', last_name: 'Kowalski' }),
    ).toBe(true);
    expect(
      namesClose(verified, { first_name: 'Saul', last_name: 'Goodman' }),
    ).toBe(false);
  });

  it('a completely different name changes nothing in the database', async () => {
    const tx = {
      attorneyProfile: { update: jest.fn(), findUnique: jest.fn() },
    };
    expect(
      await startNameRecheckIfVerified(
        tx as unknown as Prisma.TransactionClient,
        'u1',
        verified,
        { first_name: 'Saul', last_name: 'Goodman' },
      ),
    ).toBe(false);
    expect(tx.attorneyProfile.findUnique).not.toHaveBeenCalled();
    expect(tx.attorneyProfile.update).not.toHaveBeenCalled();
  });
});
