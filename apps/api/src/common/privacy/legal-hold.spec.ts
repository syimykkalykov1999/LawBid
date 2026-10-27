import { heldIds, heldSql, isAnyHeld, isHeld } from './legal-hold';

describe('legal hold helper (privacy round 13, S13-6)', () => {
  const now = new Date('2026-10-25T00:00:00Z');

  it('asks for an in-force hold on the target (not released, not expired)', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'h1' });
    expect(await isHeld({ legalHold: { findFirst } }, 'case', 'c1', now)).toBe(
      true,
    );
    const where = JSON.stringify(findFirst.mock.calls[0][0].where);
    expect(where).toContain('"target_type":"case"');
    expect(where).toContain('"target_id":"c1"');
    expect(where).toContain('"released_at":null');
    expect(where).toContain('expires_at');
  });

  it('is false without a hold and for an empty target list', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    expect(await isHeld({ legalHold: { findFirst } }, 'user', 'u', now)).toBe(
      false,
    );
    expect(await isAnyHeld({ legalHold: { findFirst } }, [], now)).toBe(false);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('heldIds returns the held subset', async () => {
    const findMany = jest.fn().mockResolvedValue([{ target_id: 'f2' }]);
    const held = await heldIds(
      { legalHold: { findMany } },
      'file',
      ['f1', 'f2'],
      now,
    );
    expect([...held]).toEqual(['f2']);
  });

  it('heldSql is an EXISTS over legal_holds for the type', () => {
    const sql = heldSql('user', { sql: 'x', values: [] } as never);
    expect(sql.sql).toContain('EXISTS');
    expect(sql.sql).toContain('legal_holds');
    expect(sql.values).toContain('user');
  });
});
