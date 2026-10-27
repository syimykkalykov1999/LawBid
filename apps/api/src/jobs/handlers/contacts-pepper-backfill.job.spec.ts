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
  done = false,
) {
  const prisma = {
    searchIndexState: {
      findUnique: jest.fn().mockResolvedValue(done ? { key: 'k' } : null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
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

  it('is done when no plain row is left, and says so in the checkpoint', async () => {
    const { job, prisma } = setup([], PEPPER);
    await expect(job.run()).resolves.toEqual({ rehashed: 0, remaining: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.searchIndexState.upsert).toHaveBeenCalledTimes(1);
  });

  it('idles once finished: no row query, and not even a checkpoint read the second time', async () => {
    const { job, prisma } = setup([], PEPPER);
    await job.run(); // finds nothing -> marks done
    prisma.contactBookHash.findMany.mockClear();
    prisma.searchIndexState.findUnique.mockClear();
    await expect(job.run()).resolves.toEqual({
      rehashed: 0,
      remaining: false,
      done: true,
    });
    expect(prisma.contactBookHash.findMany).not.toHaveBeenCalled();
    expect(prisma.searchIndexState.findUnique).not.toHaveBeenCalled();
  });

  it('a stored checkpoint stops the run before any row is read', async () => {
    const { job, prisma } = setup(
      [{ owner_id: 'u1', phone_hash: 'a'.repeat(64) }],
      PEPPER,
      true,
    );
    await expect(job.run()).resolves.toMatchObject({ done: true });
    expect(prisma.contactBookHash.findMany).not.toHaveBeenCalled();
  });

  it('force ignores the checkpoint and clears it when it finds rows', async () => {
    const { job, prisma } = setup(
      [{ owner_id: 'u1', phone_hash: 'a'.repeat(64) }],
      PEPPER,
      true,
    );
    await expect(job.run({ force: true })).resolves.toEqual({
      rehashed: 1,
      remaining: false,
    });
    expect(prisma.searchIndexState.deleteMany).toHaveBeenCalledTimes(1);
  });
});
