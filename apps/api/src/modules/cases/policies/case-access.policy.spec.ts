import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CaseAccessPolicy, type CaseViewer } from './case-access.policy';

function fakeDb(opts: {
  caseRow?: { client_id: string } | null;
  attorneyRow?: { participant: boolean; visible: boolean } | null;
}) {
  const db = {
    case: {
      findUnique: jest.fn().mockResolvedValue(opts.caseRow ?? null),
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValue(opts.attorneyRow ? [opts.attorneyRow] : []),
  };
  return { db, policy: new CaseAccessPolicy(db as unknown as PrismaService) };
}

const client: CaseViewer = { userId: 'client-1', role: 'client' };
const attorney: CaseViewer = { userId: 'att-1', role: 'attorney' };

describe('CaseAccessPolicy (deny by default)', () => {
  it('the owning client sees their case', async () => {
    const { policy } = fakeDb({ caseRow: { client_id: 'client-1' } });
    expect(await policy.decide(client, 'c1')).toEqual({
      kind: 'owner',
      clientIdentityVisible: true,
    });
  });

  it('another client, a missing or soft-deleted case → denied', async () => {
    expect(
      await fakeDb({ caseRow: { client_id: 'client-2' } }).policy.decide(
        client,
        'c1',
      ),
    ).toBeNull();
    expect(
      await fakeDb({ caseRow: null }).policy.decide(client, 'c1'),
    ).toBeNull();
  });

  it.each([
    ['admin', { userId: 'x', role: 'admin' }],
    ['no role yet', { userId: 'x', role: null }],
    ['unknown role', { userId: 'x', role: 'superuser' }],
  ])('%s → denied without touching the DB', async (_l, viewer) => {
    const { db, policy } = fakeDb({
      caseRow: { client_id: 'x' },
      attorneyRow: { participant: true, visible: true },
    });
    expect(await policy.decide(viewer, 'c1')).toBeNull();
    expect(db.case.findUnique).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    [{ participant: true, visible: false }, 'attorney_participant'],
    [{ participant: true, visible: true }, 'attorney_participant'],
    [{ participant: false, visible: true }, 'attorney_prospect'],
  ])('attorney %j → %s, client identity hidden', async (row, kind) => {
    const { policy } = fakeDb({ attorneyRow: row });
    expect(await policy.decide(attorney, 'c1')).toEqual({
      kind,
      clientIdentityVisible: false,
    });
  });

  it('attorney without bid/conversation and not §5.4-visible → denied', async () => {
    const { policy } = fakeDb({
      attorneyRow: { participant: false, visible: false },
    });
    expect(await policy.decide(attorney, 'c1')).toBeNull();
    expect(
      await fakeDb({ attorneyRow: null }).policy.decide(attorney, 'c1'),
    ).toBeNull();
  });

  it('the attorney query checks verification, verified license, practice and the §4.1 exception', async () => {
    const { db, policy } = fakeDb({ attorneyRow: null });
    await policy.decide(attorney, 'c1');
    const sql = (db.$queryRaw.mock.calls[0][0] as string[]).join('?');
    for (const part of [
      "c.status = 'open'",
      "verification_status = 'verified'",
      "license_status = 'verified'",
      'attorney_practice_areas',
      'c.deleted_at IS NULL',
      'FROM bids',
      'FROM conversations',
    ]) {
      expect(sql).toContain(part);
    }
    expect(db.$queryRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([
        'general_practice.not_sure_or_other',
        'general_practice.general_practice',
      ]),
    );
  });

  it('assertCanView turns a denial into CASE_NOT_FOUND (no existence leak)', async () => {
    const { policy } = fakeDb({ caseRow: { client_id: 'client-2' } });
    await expect(policy.assertCanView(client, 'c1')).rejects.toMatchObject({
      status: 404,
      response: { code: ErrorCode.CASE_NOT_FOUND },
    });
  });

  it('uses the given transaction client', async () => {
    const { policy } = fakeDb({});
    const tx = fakeDb({ caseRow: { client_id: 'client-1' } }).db;
    expect(
      await policy.decide(
        client,
        'c1',
        tx as unknown as Prisma.TransactionClient,
      ),
    ).toMatchObject({ kind: 'owner' });
  });
});
