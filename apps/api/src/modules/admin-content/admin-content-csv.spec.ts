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

  it('a table of exactly the cap is complete, not truncated', async () => {
    const { svc } = serviceWith(CSV_EXPORT_LIMIT);
    const out = await svc.exportCsvStream('users', () => undefined);
    expect(out).toEqual({ rows: CSV_EXPORT_LIMIT, truncated: false });
  });
});
