import type { User } from '../../generated/prisma/client';
import { cancelDeletionOnLogin } from './auth.service';

/** Verify 18.11 (PV1): a sign-in never revives an account whose erasure
 * already started. */
describe('cancelDeletionOnLogin', () => {
  const user = { id: 'u1', status: 'deletion_pending' } as User;

  it('a pending deletion is cancelled with one conditional write', async () => {
    const db = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ ...user, status: 'active' }),
      },
    };
    const out = await cancelDeletionOnLogin(db as never, user);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', status: 'deletion_pending' },
      data: { status: 'active', deletion_requested_at: null },
    });
    expect(out.cancelled).toBe(true);
    expect(out.user.status).toBe('active');
  });

  it('the erasure claimed it first: the sign-in gets the deleted account', async () => {
    const db = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ ...user, status: 'deleted' }),
      },
    };
    const out = await cancelDeletionOnLogin(db as never, user);
    expect(out.cancelled).toBe(false);
    expect(out.user.status).toBe('deleted');
  });
});
