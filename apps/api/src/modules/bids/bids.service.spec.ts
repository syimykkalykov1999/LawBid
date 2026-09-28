import { BadRequestException } from '@nestjs/common';
import type { CreateBidDto } from './dto/bid-requests.dto';
import { assertNotPast, normalizeAmount } from './bids.service';

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
