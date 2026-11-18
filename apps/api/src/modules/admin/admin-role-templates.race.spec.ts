import { ConflictException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { AdminRoleTemplatesService } from './admin-role-templates.service';

/**
 * Verify batch 11 (B9d): two saves of the same new name at once (a double
 * click) both pass the "name free?" read; the unique index refuses the
 * second, which reached the client as a 500. It is the same 409 as a name
 * that was already taken.
 */
describe('AdminRoleTemplatesService: a racing duplicate name (B9d)', () => {
  const owner = { id: 'o', adminRole: 'super_admin', ip: null } as never;
  const unique = () =>
    new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
  function build() {
    const prisma = {
      adminRoleTemplate: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(unique()),
        update: jest.fn().mockRejectedValue(unique()),
      },
    };
    const audit = { record: jest.fn() };
    return {
      svc: new AdminRoleTemplatesService(prisma as never, audit as never),
      prisma,
    };
  }

  it('create answers 409, not 500', async () => {
    const { svc } = build();
    await expect(
      svc.create(owner, 'Support', { support: 'manage' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rename answers 409, not 500', async () => {
    const { svc, prisma } = build();
    prisma.adminRoleTemplate.findUnique
      .mockResolvedValueOnce({ id: 't1', name: 'Old', permissions: {} })
      .mockResolvedValue(null);
    await expect(
      svc.update(owner, 't1', 'Support', { support: 'manage' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
