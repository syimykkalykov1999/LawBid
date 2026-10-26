import type { PrismaService } from '../../prisma/prisma.service';
import { LegalLookupService } from './legal-lookup.service';

const U1 = '11111111-1111-4111-8111-111111111111';
const user = (id: string, extra = {}) => ({
  id,
  role: 'attorney',
  status: 'active',
  first_name: 'Thomas',
  last_name: 'Brennan',
  email: 't@x.com',
  phone_e164: '+12125550101',
  ...extra,
});

function build(users: ReturnType<typeof user>[] = [user(U1)]) {
  const findMany = jest.fn().mockResolvedValue(users);
  const prisma = {
    user: { findMany },
    username: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { username_lower: 'tbrennan', owner_type: 'user', owner_id: U1 },
        ]),
    },
    channel: { findMany: jest.fn().mockResolvedValue([]) },
    chatGroup: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return { svc: new LegalLookupService(prisma), findMany, prisma };
}

describe('LegalLookupService.search', () => {
  it('finds by a formatted phone number as exact E.164', async () => {
    const { svc, findMany } = build();
    const hits = await svc.search('+1 (212) 555-0101');
    expect(hits[0]).toMatchObject({
      userId: U1,
      matchedBy: 'phone',
      username: 'tbrennan',
    });
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain(
      '+12125550101',
    );
  });

  it('finds by user id', async () => {
    const { svc } = build();
    expect((await svc.search(U1))[0].matchedBy).toBe('id');
  });

  it('finds by an @username and returns each person once', async () => {
    const { svc } = build();
    const hits = await svc.search('@tbrennan');
    expect(hits.filter((h) => h.userId === U1)).toHaveLength(1);
    expect(hits[0].matchedBy).toBe('username');
  });

  it('e-mail and name use prefix matches (no full scans)', async () => {
    const { svc, findMany } = build();
    await svc.search('t@x.com');
    await svc.search('Thom');
    const where = findMany.mock.calls
      .map((c) => JSON.stringify(c[0].where))
      .join(' ');
    expect(where).toContain('startsWith');
    expect(where).not.toContain('contains');
  });

  it('caps the result list', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      user(`${i}`.padStart(8, '0') + '-1111-4111-8111-111111111111'),
    );
    const { svc } = build(many);
    expect((await svc.search('Thomas')).length).toBeLessThanOrEqual(20);
  });
});
