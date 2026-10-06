import type { PrismaService } from '../../prisma/prisma.service';
import { LegalAcceptanceService } from './legal-acceptance.service';

function setup(opts: {
  role: 'attorney' | 'client';
  docs: Record<string, unknown>[];
  consents?: Record<string, unknown>[];
}) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ role: opts.role, ui_language: 'en' }),
    },
    legalDocument: {
      findMany: jest.fn().mockResolvedValue(opts.docs),
    },
    userConsent: {
      findMany: jest.fn().mockResolvedValue(opts.consents ?? []),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    prisma,
    svc: new LegalAcceptanceService(prisma as unknown as PrismaService),
  };
}

const d = (id: string, doc_type: string, over: object = {}) => ({
  id,
  doc_type,
  locale: 'en',
  version: '2026-10-05.1',
  published_at: new Date('2026-10-05T10:00:00Z'),
  is_current: true,
  requires_reacceptance: true,
  ...over,
});

describe('LegalAcceptanceService', () => {
  it('treats an enum value that is not yet public as nothing to accept, other errors still fail', async () => {
    const { svc, prisma } = setup({ role: 'client', docs: [] });
    prisma.legalDocument.findMany.mockRejectedValueOnce(
      new Error('cannot use enum value "eula": enum value is not yet public'),
    );
    await expect(svc.pending('u1')).resolves.toEqual([]);
    prisma.legalDocument.findMany.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.pending('u1')).rejects.toThrow('boom');
  });

  it('asks an attorney for the attorney agreement, terms, privacy and the EULA', async () => {
    const { svc } = setup({
      role: 'attorney',
      docs: [
        d('a', 'attorney_agreement'),
        d('c', 'client_agreement'),
        d('e', 'eula'),
      ],
    });
    const p = await svc.pending('u1');
    expect(p.map((x) => x.docType).sort()).toEqual([
      'attorney_agreement',
      'eula',
    ]);
    expect(p[0]).toMatchObject({ reason: 'new', title: expect.any(String) });
  });

  it('asks a client for the client agreement, not the attorney one', async () => {
    const { svc } = setup({
      role: 'client',
      docs: [d('a', 'attorney_agreement'), d('c', 'client_agreement')],
    });
    expect((await svc.pending('u1')).map((x) => x.docType)).toEqual([
      'client_agreement',
    ]);
  });

  it('blocks key actions with LEGAL_REACCEPT_REQUIRED until accepted', async () => {
    const { svc } = setup({
      role: 'client',
      docs: [d('c', 'client_agreement')],
    });
    await expect(svc.assertAccepted('u1')).rejects.toMatchObject({
      response: {
        code: 'LEGAL_REACCEPT_REQUIRED',
        details: { documents: ['client_agreement'] },
      },
    });
    const ok = setup({
      role: 'client',
      docs: [d('c', 'client_agreement')],
      consents: [
        {
          consent_type: 'client_agreement',
          granted: true,
          document: { id: 'c', published_at: new Date('2026-10-05T10:00:00Z') },
        },
      ],
    });
    await expect(ok.svc.assertAccepted('u1')).resolves.toBeUndefined();
  });

  it('does not block key actions for a missing first acceptance of terms/privacy', async () => {
    const { svc } = setup({
      role: 'client',
      docs: [d('t', 'terms'), d('p', 'privacy')],
    });
    await expect(svc.assertAccepted('u1')).resolves.toBeUndefined();
  });

  it('records one consent per ticked current document with ip and device', async () => {
    const { svc, prisma } = setup({ role: 'client', docs: [] });
    prisma.legalDocument.findMany.mockResolvedValueOnce([
      { id: 'c', doc_type: 'client_agreement', is_current: true },
      { id: 'e', doc_type: 'eula', is_current: true },
    ]);
    await svc.accept('u1', ['c', 'e', 'c'], { ip: '1.2.3.4', deviceId: 'dev' });
    expect(prisma.userConsent.createMany).toHaveBeenCalledWith({
      data: [
        {
          user_id: 'u1',
          consent_type: 'client_agreement',
          document_id: 'c',
          granted: true,
          ip: '1.2.3.4',
          device_id: 'dev',
        },
        {
          user_id: 'u1',
          consent_type: 'eula',
          document_id: 'e',
          granted: true,
          ip: '1.2.3.4',
          device_id: 'dev',
        },
      ],
    });
  });

  it('rejects an old version, an unknown id and a type that cannot be accepted', async () => {
    for (const rows of [
      [{ id: 'c', doc_type: 'eula', is_current: false }],
      [],
      [{ id: 'c', doc_type: 'refund', is_current: true }],
    ]) {
      const { svc, prisma } = setup({ role: 'client', docs: [] });
      prisma.legalDocument.findMany.mockResolvedValueOnce(rows);
      await expect(svc.accept('u1', ['c'], { ip: null })).rejects.toMatchObject(
        { response: { code: 'VALIDATION_ERROR' } },
      );
      expect(prisma.userConsent.createMany).not.toHaveBeenCalled();
    }
  });
});
