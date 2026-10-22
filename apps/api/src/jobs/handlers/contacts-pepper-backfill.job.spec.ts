import { createHmac } from 'node:crypto';
import { ContactsPepper } from '../../modules/contacts-sync/contacts-pepper';
import {
  CONTACTS_PEPPER_BATCH,
  ContactsPepperBackfillJob,
} from './contacts-pepper-backfill.job';

const PEPPER = 'unit_test_contacts_pepper_at_least_32_chars';
const hmac = (h: string) =>
  createHmac('sha256', PEPPER).update(h).digest('hex');
const logger = { setContext: jest.fn(), info: jest.fn() };

function setup(
  rows: { owner_id: string; phone_hash: string }[],
  value?: string,
) {
  const prisma = {
    contactBookHash: {
      findMany: jest.fn().mockResolvedValue(
        rows.map((r) => ({
          ...r,
          created_at: new Date('2026-10-01T00:00:00Z'),
        })),
      ),
      deleteMany: jest.fn((a: unknown) => ({ op: 'deleteMany', a })),
      createMany: jest.fn((a: unknown) => ({ op: 'createMany', a })),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const pepper = new ContactsPepper({
    get: (k: string) => (k === 'CONTACTS_PEPPER' ? value : 'test'),
  } as never);
  const job = new ContactsPepperBackfillJob(
    prisma as never,
    pepper,
    logger as never,
  );
  return { job, prisma };
}

/** Security research #5 (2026-10-22), A7. */
describe('ContactsPepperBackfillJob', () => {
  it('does nothing without a pepper', async () => {
    const { job, prisma } = setup([
      { owner_id: 'u1', phone_hash: 'a'.repeat(64) },
    ]);
    await expect(job.run()).resolves.toEqual({ rehashed: 0, remaining: false });
    expect(prisma.contactBookHash.findMany).not.toHaveBeenCalled();
  });

  it('re-hashes a batch of plain rows in one transaction', async () => {
    const rows = [
      { owner_id: 'u1', phone_hash: 'a'.repeat(64) },
      { owner_id: 'u2', phone_hash: 'b'.repeat(64) },
    ];
    const { job, prisma } = setup(rows, PEPPER);
    await expect(job.run()).resolves.toEqual({ rehashed: 2, remaining: false });
    expect(prisma.contactBookHash.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { peppered: false },
        take: CONTACTS_PEPPER_BATCH,
      }),
    );
    expect(prisma.contactBookHash.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: rows.map((r) => ({ ...r, peppered: false })),
      },
    });
    expect(prisma.contactBookHash.createMany).toHaveBeenCalledWith({
      data: rows.map((r) => ({
        owner_id: r.owner_id,
        phone_hash: hmac(r.phone_hash),
        peppered: true,
        created_at: new Date('2026-10-01T00:00:00Z'),
      })),
      skipDuplicates: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reports more work when the batch was full', async () => {
    const rows = Array.from({ length: CONTACTS_PEPPER_BATCH }, (_, i) => ({
      owner_id: 'u',
      phone_hash: i.toString(16).padStart(64, '0'),
    }));
    const { job } = setup(rows, PEPPER);
    await expect(job.run()).resolves.toEqual({
      rehashed: CONTACTS_PEPPER_BATCH,
      remaining: true,
    });
  });

  it('is done when no plain row is left', async () => {
    const { job, prisma } = setup([], PEPPER);
    await expect(job.run()).resolves.toEqual({ rehashed: 0, remaining: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
