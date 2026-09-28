import { HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { syncProfileStatus } from '../verification.helpers';
import {
  documentShape,
  identityCompleteness,
} from './verification-requests.service';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return ((e as HttpException).getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('documentShape (docs/03 §2.1 document rules)', () => {
  it('bar_license needs a state and no side', () => {
    expect(documentShape({ docType: 'bar_license', stateCode: 'NY' })).toEqual({
      side: null,
      stateCode: 'NY',
    });
    expect(codeOf(() => documentShape({ docType: 'bar_license' }))).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(
      codeOf(() =>
        documentShape({
          docType: 'bar_license',
          stateCode: 'NY',
          side: 'front',
        }),
      ),
    ).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('driver license / state ID need a side; passport defaults to front', () => {
    expect(codeOf(() => documentShape({ docType: 'drivers_license' }))).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(documentShape({ docType: 'state_id', side: 'back' }).side).toBe(
      'back',
    );
    expect(documentShape({ docType: 'passport' }).side).toBe('front');
    expect(
      codeOf(() => documentShape({ docType: 'passport', side: 'back' })),
    ).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('selfie takes neither side nor state', () => {
    expect(documentShape({ docType: 'selfie' })).toEqual({
      side: null,
      stateCode: null,
    });
    expect(
      codeOf(() => documentShape({ docType: 'selfie', stateCode: 'NY' })),
    ).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

describe('identityCompleteness', () => {
  it('nothing → identity_document', () => {
    expect(identityCompleteness([])).toBe('identity_document');
  });
  it('passport front is enough', () => {
    expect(
      identityCompleteness([{ doc_type: 'passport', side: 'front' }]),
    ).toBe(null);
  });
  it('driver license front only → back missing; both → complete', () => {
    const front = { doc_type: 'drivers_license' as const, side: 'front' };
    expect(identityCompleteness([front])).toBe('identity_document_back');
    expect(
      identityCompleteness([
        front,
        { doc_type: 'drivers_license', side: 'back' },
      ]),
    ).toBe(null);
  });
  it('sides of different document types do not combine', () => {
    expect(
      identityCompleteness([
        { doc_type: 'drivers_license', side: 'front' },
        { doc_type: 'state_id', side: 'back' },
      ]),
    ).toBe('identity_document_back');
  });
});

describe('syncProfileStatus (§2.3 mapping)', () => {
  function tx() {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    return {
      updateMany,
      client: {
        attorneyProfile: { updateMany },
      } as unknown as Prisma.TransactionClient,
    };
  }

  it.each([
    ['draft', 'unverified'],
    ['submitted', 'pending'],
    ['in_review', 'pending'],
    ['needs_more_info', 'pending'],
    ['rejected', 'rejected'],
  ] as const)(
    '%s → %s, never touching verified or suspended profiles',
    async (status, target) => {
      const t = tx();
      await syncProfileStatus(t.client, 'a1', status, new Date());
      expect(t.updateMany).toHaveBeenCalledWith({
        where: {
          user_id: 'a1',
          verification_status: { notIn: ['suspended', 'verified'] },
        },
        data: { verification_status: target },
      });
    },
  );

  it('approved → verified (except suspended) and sets verified_at once', async () => {
    const t = tx();
    const now = new Date('2026-09-27T00:00:00Z');
    await syncProfileStatus(t.client, 'a1', 'approved', now);
    expect(t.updateMany).toHaveBeenNthCalledWith(1, {
      where: { user_id: 'a1', verification_status: { not: 'suspended' } },
      data: { verification_status: 'verified' },
    });
    expect(t.updateMany).toHaveBeenNthCalledWith(2, {
      where: { user_id: 'a1', verified_at: null },
      data: { verified_at: now },
    });
  });
});
