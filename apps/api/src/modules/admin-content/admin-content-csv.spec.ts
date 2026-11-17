import { exportWhere } from './export-filter';
import {
  AdminContentService,
  CSV_EXPORT_LIMIT,
  CSV_TRUNCATED_NOTE,
  csvCell,
} from './admin-content.service';

describe('csvCell (S18-2: formula injection guard)', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'prefixes an apostrophe to text starting with %j',
    (v) => {
      expect(csvCell(v).replace(/^"|"$/g, '').replace(/""/g, '"')).toBe(
        `'${v}`,
      );
    },
  );

  it('keeps numbers, booleans, dates and plain text untouched', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(true)).toBe('true');
    expect(csvCell('Anna')).toBe('Anna');
    expect(csvCell(null)).toBe('');
    expect(csvCell(new Date('2026-10-25T00:00:00Z'))).toBe(
      '2026-10-25T00:00:00.000Z',
    );
  });

  it('still quotes commas, quotes and newlines', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it('neutralises a HYPERLINK payload in a name', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
  });
});

describe('exportCsvStream (S18-3: keyset pages, cap notice)', () => {
  const user = (i: number) => ({
    id: `u${i}`,
    role: 'client',
    status: 'active',
    first_name: 'A',
    last_name: 'B',
    phone_e164: null,
    email: null,
    created_at: new Date(1_700_000_000_000 - i * 1000),
  });

  function serviceWith(total: number) {
    const findMany = jest.fn(
      (args: { take: number; cursor?: { id: string } }) => {
        const start = args.cursor ? Number(args.cursor.id.slice(1)) + 1 : 0;
        const out = [];
        for (let i = start; i < Math.min(total, start + args.take); i++) {
          out.push(user(i));
        }
        return out;
      },
    );
    const svc = new AdminContentService(
      { user: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { svc, findMany };
  }

  it('streams every row in pages of at most 2 000 and does not flag a complete table', async () => {
    const { svc, findMany } = serviceWith(4_500);
    const chunks: string[] = [];
    const out = await svc.exportCsvStream('users', (c) => {
      chunks.push(c);
    });
    expect(out).toEqual({ rows: 4_500, truncated: false });
    expect(findMany.mock.calls.every(([a]) => a.take <= 2_000)).toBe(true);
    const text = chunks.join('');
    expect(text.split('\n').length - 1).toBe(4_501); // header + rows
    expect(text).not.toContain('ОБРЕЗАНА');
  });

  it('stops at the cap and writes the truncation line', async () => {
    const { svc } = serviceWith(CSV_EXPORT_LIMIT + 10);
    const chunks: string[] = [];
    const out = await svc.exportCsvStream('users', (c) => {
      chunks.push(c);
    });
    expect(out).toEqual({ rows: CSV_EXPORT_LIMIT, truncated: true });
    const text = chunks.join('');
    expect(text.trimEnd().endsWith(`"${CSV_TRUNCATED_NOTE}"`)).toBe(true);
  });

  it('owner 12.11: unlimited (the owner) streams past the cap, in pages', async () => {
    const { svc, findMany } = serviceWith(CSV_EXPORT_LIMIT + 10);
    const chunks: string[] = [];
    const out = await svc.exportCsvStream(
      'users',
      (c) => {
        chunks.push(c);
      },
      { unlimited: true },
    );
    expect(out).toEqual({ rows: CSV_EXPORT_LIMIT + 10, truncated: false });
    expect(findMany.mock.calls.every(([a]) => a.take <= 2_000)).toBe(true);
    expect(chunks.join('')).not.toContain(CSV_TRUNCATED_NOTE);
  });

  it('a table of exactly the cap is complete, not truncated', async () => {
    const { svc } = serviceWith(CSV_EXPORT_LIMIT);
    const out = await svc.exportCsvStream('users', () => undefined);
    expect(out).toEqual({ rows: CSV_EXPORT_LIMIT, truncated: false });
  });
});

/** Owner 14.11 (row 180, B7 / detective R3A-8): the CSV is what the list
 * shows — the page's filters go with the export (Stripe «Export» of the
 * filtered list), not the whole table. */
describe('exportCsvStream honours the page filters', () => {
  const where = async (entity: string, filter: Record<string, unknown>) => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const model = { findMany };
    const svc = new AdminContentService(
      {
        user: model,
        case: model,
        bid: model,
        payment: model,
        casePayment: model,
        post: model,
        assistantMembership: model,
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await svc.exportCsvStream(entity, () => undefined, { filter });
    return (findMany.mock.calls[0] as unknown as [{ where?: unknown }])[0]
      .where;
  };
  const U = '11111111-1111-4111-8111-111111111111';

  it('users: role, status and the date range', async () => {
    expect(
      await where('users', {
        role: 'attorney',
        status: 'suspended',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-14T00:00:00.000Z',
      }),
    ).toEqual({
      AND: [
        { role: 'attorney' },
        { status: 'suspended' },
        {
          created_at: {
            gte: new Date('2026-11-01T00:00:00.000Z'),
            lt: new Date('2026-11-14T00:00:00.000Z'),
          },
        },
      ],
    });
  });

  it('payments: one person and one status (e.g. only refunded)', async () => {
    expect(await where('payments', { status: 'refunded', userId: U })).toEqual({
      AND: [{ status: 'refunded' }, { user_id: U }],
    });
  });

  it('a value the list cannot take is a 400 before the file starts', () => {
    expect(() => exportWhere('payments', { status: 'nope' })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => exportWhere('teams', { q: 'x' })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('cases: the title search and the state', async () => {
    expect(await where('cases', { q: 'divorce', stateCode: 'NV' })).toEqual({
      AND: [
        { title: { contains: 'divorce', mode: 'insensitive' } },
        { primary_state_code: 'NV' },
      ],
    });
  });

  it('case payments: either side of the payment, and the case', async () => {
    expect(await where('case_payments', { userId: U, caseId: U })).toEqual({
      AND: [{ OR: [{ client_id: U }, { attorney_id: U }] }, { case_id: U }],
    });
  });

  it('no filter → the whole table, as before', async () => {
    expect(await where('bids', {})).toBeUndefined();
  });
});

/** Row 180 follow-up B7: the payments and case-payments CSV take the page
 * filters too, and the cases CSV «Только с жалобами» and «С датой». */
describe('exportCsvStream: payments, case payments, cases with reports / a date', () => {
  const U = '11111111-1111-4111-8111-111111111111';
  const where = async (
    entity: string,
    filter: Record<string, unknown>,
    tz = 'America/Los_Angeles',
  ) => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const report = {
      findMany: jest.fn(() => Promise.resolve([{ target_id: 'r1' }])),
    };
    const model = { findMany };
    const svc = new AdminContentService(
      {
        case: model,
        payment: model,
        casePayment: model,
        report,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      { string: jest.fn(() => Promise.resolve(tz)) } as never,
    );
    await svc.exportCsvStream(entity, () => undefined, { filter });
    return {
      where: (findMany.mock.calls[0] as unknown as [{ where?: unknown }])[0]
        .where,
      report,
    };
  };

  it('payments: status and the date window of the Payments tab', async () => {
    const r = await where('payments', {
      status: 'failed',
      from: '2026-11-01T07:00:00.000Z',
      to: '2026-11-08T08:00:00.000Z',
    });
    expect(r.where).toEqual({
      AND: [
        { status: 'failed' },
        {
          created_at: {
            gte: new Date('2026-11-01T07:00:00.000Z'),
            lt: new Date('2026-11-08T08:00:00.000Z'),
          },
        },
      ],
    });
  });

  it('case payments: status, «Споры» (disputed), person and case', async () => {
    const r = await where('case_payments', {
      status: 'succeeded',
      disputed: true,
      userId: U,
      caseId: U,
    });
    expect(r.where).toEqual({
      AND: [
        { status: 'succeeded' },
        { OR: [{ client_id: U }, { attorney_id: U }] },
        { case_id: U },
        { dispute_status: { not: null } },
      ],
    });
  });

  it('cases «Только с жалобами»: the open-report case ids, as the list', async () => {
    const r = await where('cases', { hasReports: true });
    expect(r.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { target_type: 'case', status: 'open' },
      }),
    );
    expect(r.where).toEqual({ AND: [{ id: { in: ['r1'] } }] });
  });

  it('cases «С датой»: a deadline from local midnight of the report zone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T03:00:00Z'));
    try {
      const r = await where('cases', { withDeadline: true });
      // 03:00 UTC on the 14th is still the 13th in Nevada (PST, UTC-8).
      expect(r.where).toEqual({
        AND: [{ deadline_at: { gte: new Date('2026-11-13T08:00:00.000Z') } }],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('disputed / hasReports / withDeadline on a list without them: 400 before the file', () => {
    expect(() => exportWhere('payments', { disputed: true })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => exportWhere('users', { hasReports: true })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => exportWhere('bids', { withDeadline: true })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});
