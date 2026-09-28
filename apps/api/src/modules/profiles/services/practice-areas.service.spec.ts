import type Redis from 'ioredis';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  buildPracticeTree,
  PracticeAreasService,
} from './practice-areas.service';

const row = (
  id: string,
  parent_id: string | null,
  code: string,
  sort: number,
) => ({
  id,
  parent_id,
  code,
  name_en: code,
  i18n_key: `practice.${code}`,
  sort,
});

describe('buildPracticeTree (docs/02 §3.2)', () => {
  it('nests active leaves under categories, sorted, dropping empty categories', () => {
    const tree = buildPracticeTree([
      row('c2', null, 'traffic', 1),
      row('c1', null, 'dui', 0),
      row('c3', null, 'empty', 2),
      row('l2', 'c2', 'traffic.b', 1),
      row('l1', 'c2', 'traffic.a', 0),
      row('l3', 'c1', 'dui.x', 0),
    ]);
    expect(tree.map((c) => c.code)).toEqual(['dui', 'traffic']);
    expect(tree[1].children.map((l) => l.code)).toEqual([
      'traffic.a',
      'traffic.b',
    ]);
    expect(tree[1].children[0]).toEqual({
      id: 'l1',
      code: 'traffic.a',
      i18nKey: 'practice.traffic.a',
      nameEn: 'traffic.a',
    });
  });
});

describe('PracticeAreasService.replace', () => {
  function service(opts: {
    role?: string;
    status?: string;
    validIds?: string[];
    current?: string[];
  }) {
    const tx = {
      attorneyProfile: {
        findUnique: jest.fn(() =>
          Promise.resolve({ verification_status: opts.status ?? 'verified' }),
        ),
      },
      attorneyPracticeArea: {
        findMany: jest.fn(() =>
          Promise.resolve(
            (opts.current ?? []).map((practice_area_id) => ({
              practice_area_id,
            })),
          ),
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
        createMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      auditLog: { create: jest.fn(() => Promise.resolve({})) },
    };
    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            role: opts.role ?? 'attorney',
            attorney_profile: {
              verification_status: opts.status ?? 'verified',
            },
          }),
        ),
      },
      practiceArea: {
        findMany: jest.fn(() =>
          Promise.resolve((opts.validIds ?? []).map((id) => ({ id }))),
        ),
      },
      attorneyPracticeArea: { findMany: jest.fn(() => Promise.resolve([])) },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const svc = new PracticeAreasService(
      prisma as unknown as PrismaService,
      {} as Redis,
    );
    return { svc, tx, prisma };
  }

  it.each(['unverified', 'pending', 'rejected', 'suspended'])(
    '%s attorney -> 403 ATTORNEY_NOT_VERIFIED, nothing written',
    async (status) => {
      const { svc, prisma } = service({ status, validIds: ['a'] });
      await expect(svc.replace('u', ['a'])).rejects.toMatchObject({
        status: 403,
        response: { code: ErrorCode.ATTORNEY_NOT_VERIFIED },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('client -> 403 FORBIDDEN', async () => {
    const { svc } = service({ role: 'client' });
    await expect(svc.replace('u', [])).rejects.toMatchObject({
      status: 403,
      response: { code: ErrorCode.FORBIDDEN },
    });
  });

  it('rejects categories / inactive ids with their list', async () => {
    const { svc, prisma } = service({ validIds: ['a'] });
    await expect(svc.replace('u', ['a', 'cat'])).rejects.toMatchObject({
      status: 400,
      response: {
        code: ErrorCode.VALIDATION_ERROR,
        details: { invalidIds: ['cat'] },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces the set (delete removed, add new) and audits it', async () => {
    const { svc, tx } = service({ validIds: ['b', 'c'], current: ['a', 'b'] });
    await svc.replace('u', ['b', 'c'], '1.2.3.4');
    expect(tx.attorneyPracticeArea.deleteMany).toHaveBeenCalledWith({
      where: { attorney_id: 'u', practice_area_id: { in: ['a'] } },
    });
    expect(tx.attorneyPracticeArea.createMany).toHaveBeenCalledWith({
      data: [{ attorney_id: 'u', practice_area_id: 'c' }],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'u',
        action: 'attorney.practice_areas.replace',
        before: { practiceAreaIds: ['a', 'b'] },
        after: { practiceAreaIds: ['b', 'c'] },
        ip: '1.2.3.4',
      }) as unknown,
    });
  });

  it('an unchanged set writes nothing (no audit row)', async () => {
    const { svc, tx } = service({ validIds: ['a'], current: ['a'] });
    await svc.replace('u', ['a']);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
