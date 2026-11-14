import { AdminAuthService } from './admin-auth.service';
import type { AdminActor } from './admin-auth.decorators';

/**
 * Owner 14.11 (row 179, B6 / detective R3A-7): «Выбрать всё по фильтру»
 * stopped at a fixed 2 000. The owner has no cap at all; staff get the
 * owner's setting `admin.bulk_select_cap` (0 = no cap). `me` carries it.
 */
function build(role: string, cap: number) {
  const prisma = {
    country: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'boss@x.io',
        avatar_file_id: null,
        admin_profile: { admin_role: role, permissions: {} },
        admin_credential: null,
      }),
    },
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'admin.bulk_select_cap' ? cap : 0),
    ),
    boolean: jest.fn().mockResolvedValue(false),
    stringList: jest.fn().mockResolvedValue([]),
  };
  return new AdminAuthService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined, getOrThrow: () => 50 } as never,
    settings as never,
  );
}

const actor = (adminRole: string) => ({ id: 'u1', adminRole }) as AdminActor;

describe('me.bulkSelectCap (row 179)', () => {
  it('the owner: no cap (null), whatever the setting', async () => {
    const me = await build('super_admin', 2000).me(actor('super_admin'));
    expect(me.bulkSelectCap).toBeNull();
  });

  it('staff: the owner’s number', async () => {
    const me = await build('moderator', 3500).me(actor('moderator'));
    expect(me.bulkSelectCap).toBe(3500);
  });

  it('staff with 0: no cap', async () => {
    const me = await build('moderator', 0).me(actor('moderator'));
    expect(me.bulkSelectCap).toBeNull();
  });
});
