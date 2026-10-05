import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateBidDto } from './dto/bid-requests.dto';
import {
  assertNotPast,
  BidsService,
  normalizeAmount,
  reusableBid,
} from './bids.service';

const dto = (overrides: Partial<CreateBidDto> = {}): CreateBidDto => ({
  feeType: 'fixed',
  amountCents: 50_000,
  message: 'x'.repeat(20),
  startAvailability: 'immediately',
  ...overrides,
});

describe('normalizeAmount (docs/04 §5.1)', () => {
  it('free_consultation is always stored as 0, whatever was sent', () => {
    expect(
      normalizeAmount(dto({ feeType: 'free_consultation', amountCents: 999 })),
    ).toBe(0);
    expect(
      normalizeAmount(
        dto({ feeType: 'free_consultation', amountCents: undefined }),
      ),
    ).toBe(0);
  });

  it('fixed/hourly require a positive amountCents', () => {
    expect(
      normalizeAmount(dto({ feeType: 'hourly', amountCents: 15_000 })),
    ).toBe(15_000);
    expect(() =>
      normalizeAmount(dto({ feeType: 'fixed', amountCents: undefined })),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizeAmount(dto({ feeType: 'fixed', amountCents: 0 })),
    ).toThrow(BadRequestException);
  });
});

describe('assertNotPast (docs/04 §5.1 start_date "не в прошлом")', () => {
  it('accepts today and future dates', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(() => assertNotPast(today)).not.toThrow();
    expect(() => assertNotPast('2999-01-01')).not.toThrow();
  });

  it('rejects a past date', () => {
    expect(() => assertNotPast('2000-01-01')).toThrow(BadRequestException);
  });

  it('is a no-op when undefined (only required for custom_date)', () => {
    expect(() => assertNotPast(undefined)).not.toThrow();
  });
});

describe('reusableBid (one bid per attorney per case)', () => {
  const txWith = (payloads: unknown[]) =>
    ({
      caseJournal: {
        findMany: jest.fn(() => payloads.map((payload) => ({ payload }))),
      },
    }) as unknown as Prisma.TransactionClient;

  it('a bid auto-rejected by archiving is reusable once the case is open', async () => {
    await expect(
      reusableBid(txWith([]), 'c', 'a', { id: 'b', status: 'rejected_auto' }),
    ).resolves.toBe(true);
  });

  it('a bid withdrawn by the subscription lapse is reusable', async () => {
    const tx = txWith([
      { bidId: 'b', reason: 'subscription_lapsed' },
      { bidId: 'b' },
    ]);
    await expect(
      reusableBid(tx, 'c', 'a', { id: 'b', status: 'withdrawn' }),
    ).resolves.toBe(true);
  });

  it("the attorney's own withdrawal and the client's rejection stay final", async () => {
    await expect(
      reusableBid(txWith([{ bidId: 'b', action: 'withdraw' }]), 'c', 'a', {
        id: 'b',
        status: 'withdrawn',
      }),
    ).resolves.toBe(false);
    await expect(
      reusableBid(txWith([]), 'c', 'a', {
        id: 'b',
        status: 'rejected_by_client',
      }),
    ).resolves.toBe(false);
    await expect(
      reusableBid(txWith([]), 'c', 'a', { id: 'b', status: 'active' }),
    ).resolves.toBe(false);
  });
});

describe('BidsService.create over an earlier bid row', () => {
  const attorney = { sub: 'att-1', role: 'attorney' } as never;

  function setup(previous: { id: string; status: string } | null) {
    const tx = {
      case: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            client_id: 'cl-1',
            status: 'open',
            deleted_at: null,
          }),
        ),
        update: jest.fn(() => Promise.resolve({})),
      },
      bid: {
        findUnique: jest.fn(() => Promise.resolve(previous)),
        create: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({
            id: 'new',
            ...row(),
            ...data,
          }),
        ),
        update: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({
            id: previous?.id,
            ...row(),
            ...data,
          }),
        ),
      },
      bidOffer: {
        deleteMany: jest.fn(() => Promise.resolve({ count: 2 })),
        create: jest.fn(() =>
          Promise.resolve({
            id: 'o',
            round_no: 0,
            from_role: 'attorney',
            fee_type: 'fixed',
            amount_cents: 50_000,
            message: 'm',
            status: 'pending',
            created_at: new Date(),
          }),
        ),
      },
      caseJournal: { findMany: jest.fn(() => Promise.resolve([])) },
      caseInvite: {
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
      bidDraft: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    };
    const service = new BidsService(
      prisma as never,
      {} as never,
      { append: jest.fn() } as never,
      { emit: jest.fn() } as never,
      { isActive: jest.fn(() => Promise.resolve(true)) } as never,
      {
        assertCanView: jest.fn(() =>
          Promise.resolve({
            kind: 'attorney_eligible',
            inPractice: true,
          }),
        ),
      } as never,
      {} as never,
      { assertCanBid: jest.fn(() => Promise.resolve()) } as never,
    );
    return { service, tx };
  }

  function row() {
    return {
      case_id: 'case-1',
      attorney_id: 'att-1',
      decided_at: null,
      created_at: new Date(),
    };
  }

  it('revives an auto-rejected bid (case restored) as a fresh active bid', async () => {
    const { service, tx } = setup({ id: 'old', status: 'rejected_auto' });
    const bid = await service.create(attorney, 'case-1', dto());
    expect(bid.id).toBe('old');
    expect(bid.status).toBe('active');
    expect(bid.roundCount).toBe(0);
    expect(tx.bidOffer.deleteMany).toHaveBeenCalledWith({
      where: { bid_id: 'old' },
    });
    expect(tx.bid.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active',
          round_count: 0,
          turn: 'client',
          decided_at: null,
        }),
      }),
    );
    expect(tx.bid.create).not.toHaveBeenCalled();
    // A reused row is already counted in bids_count.
    expect(tx.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { last_activity_at: expect.any(Date) },
    });
  });

  it('still refuses a re-bid after the client rejected the bid', async () => {
    const { service, tx } = setup({ id: 'old', status: 'rejected_by_client' });
    await expect(service.create(attorney, 'case-1', dto())).rejects.toThrow(
      ConflictException,
    );
    expect(tx.bid.update).not.toHaveBeenCalled();
  });
});
