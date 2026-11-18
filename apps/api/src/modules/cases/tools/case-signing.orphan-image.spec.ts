/* eslint-disable @typescript-eslint/require-await */
import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { CaseSigningService } from './case-signing.service';

/**
 * Final pass 18.11 (FO8): the drawn picture is stored in the private
 * bucket before the signature row. A repeat signature (double tap, already
 * signed: P2002) or a request that stopped waiting in the meantime failed
 * the transaction and left the picture there with no row pointing at it.
 */
describe('CaseSigningService.sign: no orphan signature picture', () => {
  // 1x1 PNG.
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const doc = Buffer.from('the document');

  function setup(fail: 'p2002' | 'not_pending') {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { status: fail === 'not_pending' ? 'signed' : 'pending' },
        ]),
      caseSignRequest: { count: jest.fn().mockResolvedValue(1) },
      caseSignature: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const prisma = {
      caseSignRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          case_id: 'c1',
          status: 'pending',
          expires_at: null,
          source_file_id: 'f1',
          source_sha256: createHash('sha256').update(doc).digest('hex'),
          signatures: [],
        }),
      },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const files = {
      readClean: jest.fn().mockResolvedValue({ data: doc }),
      storeSignatureImage: jest
        .fn()
        .mockResolvedValue('case-signatures/r1/x.png'),
      dropSignatureImage: jest.fn().mockResolvedValue(undefined),
    };
    const ws = {
      side: jest.fn().mockResolvedValue({
        role: 'client',
        clientId: 'u1',
        attorneyId: 'a1',
      }),
    };
    const svc = new CaseSigningService(
      prisma as never,
      ws as never,
      files as never,
      { append: jest.fn() } as never,
      { publish: jest.fn() } as never,
      {} as never,
    );
    return { svc, files };
  }

  for (const fail of ['p2002', 'not_pending'] as const) {
    it(`FO8: a signature that fails (${fail}) removes the picture it stored`, async () => {
      const h = setup(fail);
      await expect(
        h.svc.sign(
          { sub: 'u1', role: 'client' } as never,
          'c1',
          'r1',
          { method: 'drawn', name: 'Ann', imagePngBase64: PNG } as never,
          { ip: null, userAgent: null },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(h.files.dropSignatureImage).toHaveBeenCalledWith(
        'case-signatures/r1/x.png',
      );
    });
  }
});
