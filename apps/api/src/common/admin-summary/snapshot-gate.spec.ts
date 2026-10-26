import { dailyDue } from './snapshot-gate';

const at = (iso: string) => new Date(iso);
describe('dailyDue', () => {
  it('is due when nothing is stored', () => {
    expect(dailyDue(undefined)).toBe(true);
  });
  it('is not due for a recent value outside the quiet hour', () => {
    expect(dailyDue('2026-10-25T10:00:00Z', at('2026-10-25T20:00:00Z'))).toBe(
      false,
    );
  });
  it('is due in the 04 UTC hour when at least 20 h old', () => {
    expect(dailyDue('2026-10-24T07:00:00Z', at('2026-10-25T04:10:00Z'))).toBe(
      true,
    );
    expect(dailyDue('2026-10-25T01:00:00Z', at('2026-10-25T04:10:00Z'))).toBe(
      false,
    );
  });
  it('is due after 26 h at any hour', () => {
    expect(dailyDue('2026-10-24T00:00:00Z', at('2026-10-25T03:00:00Z'))).toBe(
      true,
    );
  });
});
