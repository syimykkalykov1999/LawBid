import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminDataRequestsService } from './admin-data-requests.service';

const admin = {
  id: 'a0000000-0000-4000-8000-000000000001',
  sessionId: 's1',
  ip: '1.2.3.4',
} as unknown as AdminActor;
const REQ = 'r0000000-0000-4000-8000-000000000001';
const USER = 'u0000000-0000-4000-8000-000000000001';
const OTHER = 'u0000000-0000-4000-8000-000000000002';

function build(request: { status: string; subject_user_id: string | null }) {
  const prisma = {
    dataAccessRequest: {
      findUnique: jest.fn().mockResolvedValue({ id: REQ, ...request }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: USER,
        role: 'client',
        status: 'active',
        first_name: 'A',
        last_name: 'B',
        email: null,
        phone_e164: null,
        ui_language: 'en',
        created_at: new Date(),
        deleted_at: null,
        attorney_profile: null,
        client_profile: null,
      }),
    },
    dataAccessLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (t: typeof prisma) => unknown) =>
    fn(prisma),
  );
  const audit = { record: jest.fn() } as unknown as AuditLogService;
  return {
    svc: new AdminDataRequestsService(
      prisma as unknown as PrismaService,
      audit,
    ),
    prisma,
  };
}

describe('AdminDataRequestsService.preparePackage (verify 18.11, LD1)', () => {
  it.each(['fulfilled', 'rejected'])(
    'refuses a %s (closed) request and reads no personal data',
    async (status) => {
      const { svc, prisma } = build({ status, subject_user_id: USER });
      await expect(
        svc.preparePackage(admin, REQ, { userId: USER, sections: ['profile'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('refuses a person who is not the subject named on the request', async () => {
    const { svc, prisma } = build({
      status: 'in_progress',
      subject_user_id: OTHER,
    });
    await expect(
      svc.preparePackage(admin, REQ, { userId: USER, sections: ['profile'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('prepares the package for the named subject of an open request', async () => {
    const { svc, prisma } = build({
      status: 'in_progress',
      subject_user_id: USER,
    });
    const pkg = await svc.preparePackage(admin, REQ, {
      userId: USER,
      sections: ['profile'],
    });
    expect(pkg).toBeDefined();
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});
