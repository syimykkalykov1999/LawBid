import { csvCell, csvQuoted, csvRow } from './csv-cell';

/** ASVS 5.0 V1.2.10 / OWASP CSV Injection (STAGE2_SECURITY #10). */
describe('csvCell', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'a text cell starting with %j is shown as text',
    (c) => {
      const raw = `${c}1+1`;
      const out = csvCell(raw);
      expect(out.replace(/^"|"$/g, '').replace(/""/g, '"')).toBe(`'${raw}`);
    },
  );

  it('neutralises a formula and quotes it per RFC 4180', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(
      `"'=HYPERLINK(""http://x"",""y"")"`,
    );
    expect(csvQuoted('=cmd|"/c calc"!A0')).toBe(`"'=cmd|""/c calc""!A0"`);
  });

  it('numbers, booleans, dates stay values; null is empty', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(10n)).toBe('10');
    expect(csvCell(new Date('2026-11-25T00:00:00Z'))).toBe(
      '2026-11-25T00:00:00.000Z',
    );
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvQuoted(null)).toBe('""');
  });

  it('plain text is untouched; commas, quotes and new lines are quoted', () => {
    expect(csvCell('Anna')).toBe('Anna');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvRow(['x', 1, '=1'])).toBe("x,1,'=1");
  });

  it('a JSON value that starts like a formula is guarded too', () => {
    expect(csvCell(['=1'])).toBe(`"[""=1""]"`);
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});
