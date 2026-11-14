/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { FirmsService } from './firms.service';

/**
 * R2B-1 (detective R2, 14.11): a plain firm member could send a bid in the
 * name of another member (the owner's licence, plan, credits and fee terms).
 * Only the firm owner picks who sends; the sender's legal acceptance is
 * checked too, and a plain member's «who fits» list is only themselves.
 */
function world(opts: { callerRole: 'owner' | 'member'; pending?: boolean }) {
  const members = [
    { firm_id: 'f1', attorney_id: 'owner', role: 'owner', status: 'active' },
    { firm_id: 'f1', attorney_id: 'il', role: 'member', status: 'active' },
    { firm_id: 'f1', attorney_id: 'il2', role: 'member', status: 'active' },
  ];
  const caller = opts.callerRole === 'owner' ? 'owner' : 'il';
  const prisma = {
    featureFlag: { findUnique: jest.fn(async () => ({ enabled: true })) },
    firmMember: {
      findUnique: jest.fn(
        async (q: { where: { attorney_id: string } }) =>
          members.find((m) => m.attorney_id === q.where.attorney_id) ?? null,
      ),
    },
    case: {
      findUnique: jest.fn(async () => ({
        primary_state_code: 'IL',
        states: [{ state_code: 'IL' }],
      })),
    },
  };
  const acceptance = {
    assertAccepted: jest.fn(async (id: string) => {
      if (opts.pending && id !== caller) {
        throw Object.assign(new Error('LEGAL_REACCEPT_REQUIRED'), {
          status: 403,
        });
      }
    }),
  };
  const svc = new FirmsService(prisma as never, acceptance as never);
  // The firm page: every member holds an IL licence.
  jest.spyOn(svc as never, 'view').mockImplementation((async () => ({
    id: 'f1',
    name: 'F',
    ownerId: 'owner',
    states: ['IL'],
    members: members.map((m) => ({
      attorneyId: m.attorney_id,
      firstName: null,
      lastName: null,
      role: m.role,
      status: m.status,
      states: ['IL'],
    })),
  })) as never);
  return { svc, caller, acceptance };
}

describe('firm bid sender (R2B-1)', () => {
  it('a plain member cannot send a bid as the owner or a colleague', async () => {
    const w = world({ callerRole: 'member' });
    await expect(
      w.svc.resolveSender(w.caller, 'owner', 'c1'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      w.svc.resolveSender(w.caller, 'il2', 'c1'),
    ).rejects.toMatchObject({ status: 403 });
    // Sending as themselves still works.
    await expect(w.svc.resolveSender(w.caller, w.caller, 'c1')).resolves.toBe(
      w.caller,
    );
  });

  it("a plain member's list of who can send is only themselves", async () => {
    const w = world({ callerRole: 'member' });
    const fit = await w.svc.eligibleForCase(w.caller, 'c1');
    expect(fit.map((m) => m.attorneyId)).toEqual(['il']);
  });

  it('the owner picks a member whose licence fits', async () => {
    const w = world({ callerRole: 'owner' });
    await expect(w.svc.resolveSender('owner', 'il', 'c1')).resolves.toBe('il');
    expect(w.acceptance.assertAccepted).toHaveBeenCalledWith('il');
    const fit = await w.svc.eligibleForCase('owner', 'c1');
    expect(fit.map((m) => m.attorneyId)).toEqual(['owner', 'il', 'il2']);
  });

  it("the sender's own legal acceptance is required, not only the caller's", async () => {
    const w = world({ callerRole: 'owner', pending: true });
    await expect(
      w.svc.resolveSender('owner', 'il', 'c1'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
