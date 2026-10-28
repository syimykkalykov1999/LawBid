import { ConflictException } from '@nestjs/common';
import type { DealRecordStatus } from '@prisma/client';
import {
  dealRecordTransition,
  LIVE_DEAL_RECORD_STATUSES,
  nextSigner,
} from './deal-record.machine';

const ALL: DealRecordStatus[] = [
  'preparing',
  'awaiting_signatures',
  'sealing',
  'sealed',
  'declined',
  'failed',
];

describe('dealRecordTransition', () => {
  it('accept → render → sign → sign → seal', () => {
    expect(dealRecordTransition('preparing', 'rendered')).toBe(
      'awaiting_signatures',
    );
    expect(dealRecordTransition('awaiting_signatures', 'sign', 0)).toBe(
      'awaiting_signatures',
    );
    expect(dealRecordTransition('awaiting_signatures', 'sign', 1)).toBe(
      'sealing',
    );
    expect(dealRecordTransition('sealing', 'sealed')).toBe('sealed');
  });

  it('either side may decline until the second signature, not after', () => {
    expect(dealRecordTransition('preparing', 'decline')).toBe('declined');
    expect(dealRecordTransition('awaiting_signatures', 'decline')).toBe(
      'declined',
    );
    for (const s of ['sealing', 'sealed', 'declined', 'failed'] as const) {
      expect(() => dealRecordTransition(s, 'decline')).toThrow(
        ConflictException,
      );
    }
  });

  it('a third signature or a signature outside the waiting state is refused', () => {
    expect(() =>
      dealRecordTransition('awaiting_signatures', 'sign', 2),
    ).toThrow(ConflictException);
    for (const s of ALL.filter((x) => x !== 'awaiting_signatures')) {
      expect(() => dealRecordTransition(s, 'sign', 0)).toThrow(
        ConflictException,
      );
    }
  });

  it('a sealed record never changes', () => {
    for (const a of [
      'rendered',
      'sign',
      'sealed',
      'decline',
      'fail',
    ] as const) {
      expect(() => dealRecordTransition('sealed', a, 0)).toThrow(
        ConflictException,
      );
    }
  });

  it('only the two job stages can fail', () => {
    expect(dealRecordTransition('preparing', 'fail')).toBe('failed');
    expect(dealRecordTransition('sealing', 'fail')).toBe('failed');
    expect(() => dealRecordTransition('awaiting_signatures', 'fail')).toThrow(
      ConflictException,
    );
  });

  it('the error carries the code and the state', () => {
    try {
      dealRecordTransition('declined', 'sign', 0);
      fail('expected a throw');
    } catch (e) {
      expect((e as ConflictException).getResponse()).toEqual({
        code: 'DEAL_RECORD_INVALID_STATE',
        message: 'The deal record is not in a state that allows this.',
        details: { action: 'sign', status: 'declined' },
      });
    }
  });

  it('live statuses are the three that still wait for people', () => {
    expect(LIVE_DEAL_RECORD_STATUSES).toEqual([
      'preparing',
      'awaiting_signatures',
      'sealing',
    ]);
  });
});

describe('nextSigner', () => {
  it('the acceptor signs first, then the other side', () => {
    expect(nextSigner('client', [])).toBe('client');
    expect(nextSigner('client', ['client'])).toBe('attorney');
    expect(nextSigner('client', ['client', 'attorney'])).toBeNull();
    expect(nextSigner('attorney', [])).toBe('attorney');
    expect(nextSigner('attorney', ['attorney'])).toBe('client');
  });
});
