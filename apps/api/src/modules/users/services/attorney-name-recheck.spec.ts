import type { Prisma } from '@prisma/client';
import {
  NAME_RECHECK_NOTE_PREFIX,
  nameChanged,
  startNameRecheckIfVerified,
} from './attorney-name-recheck';

describe('attorney name re-check (docs/03 §4.1)', () => {
  const before = { first_name: 'Anna', last_name: 'Kim' };

  function tx(opts: { verifiedRows: number; openRequest: boolean }) {
    return {
      attorneyProfile: {
        updateMany: jest.fn(() =>
          Promise.resolve({ count: opts.verifiedRows }),
        ),
      },
      verificationRequest: {
        findFirst: jest.fn(() =>
          Promise.resolve(opts.openRequest ? { id: 'r' } : null),
        ),
        create: jest.fn(() => Promise.resolve({})),
      },
    };
  }
  const run = (t: ReturnType<typeof tx>, after: typeof before) =>
    startNameRecheckIfVerified(
      t as unknown as Prisma.TransactionClient,
      'u1',
      before,
      after,
      new Date('2026-09-27T00:00:00Z'),
    );

  it('detects a changed first or last name', () => {
    expect(nameChanged(before, { ...before })).toBe(false);
    expect(nameChanged(before, { ...before, last_name: 'Lee' })).toBe(true);
    expect(nameChanged(before, { ...before, first_name: null })).toBe(true);
  });

  it('does nothing when the name is unchanged', async () => {
    const t = tx({ verifiedRows: 1, openRequest: false });
    expect(await run(t, { ...before })).toBe(false);
    expect(t.attorneyProfile.updateMany).not.toHaveBeenCalled();
  });

  it('verified attorney: profile -> pending and a submitted request is queued', async () => {
    const t = tx({ verifiedRows: 1, openRequest: false });
    expect(await run(t, { ...before, last_name: 'Lee' })).toBe(true);
    expect(t.attorneyProfile.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'u1', verification_status: 'verified' },
      data: { verification_status: 'pending' },
    });
    expect(t.verificationRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attorney_id: 'u1',
        status: 'submitted',
        admin_note: `${NAME_RECHECK_NOTE_PREFIX}: "Anna Kim" -> "Anna Lee"`,
      }) as unknown,
    });
  });

  it('does not open a second request when one is already open', async () => {
    const t = tx({ verifiedRows: 1, openRequest: true });
    expect(await run(t, { ...before, last_name: 'Lee' })).toBe(true);
    expect(t.verificationRequest.create).not.toHaveBeenCalled();
  });

  it('not verified (unverified/pending/suspended): no re-check', async () => {
    const t = tx({ verifiedRows: 0, openRequest: false });
    expect(await run(t, { ...before, last_name: 'Lee' })).toBe(false);
    expect(t.verificationRequest.findFirst).not.toHaveBeenCalled();
  });
});
