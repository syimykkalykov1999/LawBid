import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * docs/02_DATABASE.md §8, stage 2.3 acceptance (real CockroachDB): one
 * state bar_number can't belong to two attorneys; username_lower is
 * unique regardless of case. Plus the §4.C length CHECKs.
 */
// 23514 = check_violation (CockroachDB reports the expression, not the
// constraint name).
describe('DB schema — stage 2.3 acceptance', () => {
  const prisma = new PrismaClient();
  const UNIQUE_VIOLATION = { code: 'P2002' };

  beforeAll(async () => {
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function attorney(username: string) {
    const user = await prisma.user.create({ data: { role: 'attorney' } });
    return prisma.attorneyProfile.create({
      data: {
        user_id: user.id,
        username,
        username_lower: username.toLowerCase(),
      },
    });
  }

  it('rejects the same state bar_number on two attorneys', async () => {
    const a = await attorney(`a_${randomUUID().slice(0, 8)}`);
    const b = await attorney(`b_${randomUUID().slice(0, 8)}`);
    const bar_number = `BAR-${randomUUID().slice(0, 8)}`;
    await prisma.attorneyLicense.create({
      data: { attorney_id: a.user_id, state_code: 'NY', bar_number },
    });
    await expect(
      prisma.attorneyLicense.create({
        data: { attorney_id: b.user_id, state_code: 'NY', bar_number },
      }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('username_lower is unique regardless of case', async () => {
    const name = `JohnLaw${randomUUID().slice(0, 6)}`;
    await attorney(name);
    await expect(attorney(name.toUpperCase())).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
  });

  it('rejects username_lower that is not lower(username)', async () => {
    const user = await prisma.user.create({ data: { role: 'attorney' } });
    await expect(
      prisma.attorneyProfile.create({
        data: { user_id: user.id, username: 'Mixed', username_lower: 'Mixed' },
      }),
    ).rejects.toThrow(/23514/);
  });

  it('enforces bio ≤ 300 and contact note ≤ 200', async () => {
    const user = await prisma.user.create({ data: { role: 'attorney' } });
    await expect(
      prisma.attorneyProfile.create({
        data: {
          user_id: user.id,
          username: 'bio_x',
          username_lower: 'bio_x',
          bio: 'x'.repeat(301),
        },
      }),
    ).rejects.toThrow(/23514/);

    const client = await prisma.user.create({ data: { role: 'client' } });
    await expect(
      prisma.clientProfile.create({
        data: {
          user_id: client.id,
          state_code: 'NY',
          preferred_languages: ['en'],
          preferred_contact_note: 'y'.repeat(201),
        },
      }),
    ).rejects.toThrow(/23514/);
  });
});
