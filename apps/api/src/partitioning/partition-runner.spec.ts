import {
  HASH_PARTITIONED,
  MIGRATED_PARTITIONED,
  PARTITION_TABLES,
  addMonths,
  monthStart,
  names,
  partitionDdl,
  partitionName,
  specOf,
} from './partition-runner';

describe('partition helpers', () => {
  it('names a month partition like pg_partman (pYYYY_MM)', () => {
    expect(partitionName('audit_log', new Date(Date.UTC(2026, 9, 1)))).toBe(
      'audit_log_p2026_10',
    );
  });

  it('builds one CREATE ... PARTITION OF per month, with UTC bounds', () => {
    const ddl = partitionDdl(
      't',
      new Date(Date.UTC(2026, 10, 15)),
      new Date(Date.UTC(2027, 0, 2)),
    );
    expect(ddl).toHaveLength(3);
    expect(ddl[0]).toContain('"t_p2026_11"');
    expect(ddl[0]).toContain(
      "FROM ('2026-11-01 00:00:00.000+00') TO ('2026-12-01 00:00:00.000+00')",
    );
    expect(ddl[2]).toContain('"t_p2027_01"');
  });

  it('month arithmetic crosses the year', () => {
    expect(
      addMonths(monthStart(new Date(Date.UTC(2026, 11, 20))), 1).toISOString(),
    ).toBe('2027-01-01T00:00:00.000Z');
  });

  it('only whitelisted tables, never a free name', () => {
    expect(specOf('users')).toBeUndefined();
    expect(specOf('messages')).toBeDefined();
    expect(() =>
      partitionDdl('x"; drop table users; --', new Date(), new Date()),
    ).toThrow();
    expect(MIGRATED_PARTITIONED.map((s) => s.table)).toEqual([
      'audit_log',
      'auth_events',
    ]);
    expect(PARTITION_TABLES.map((s) => s.table)).not.toContain('audit_log');
  });

  it('gives the helper objects stable names', () => {
    expect(names('audit_log').old).toBe('audit_log__old');
    expect(names('audit_log').part).toBe('audit_log__part');
  });

  it('hash-partitioned tables are known to the card but have no button', () => {
    expect(HASH_PARTITIONED.map((s) => [s.table, s.key])).toEqual([
      ['messages', 'conversation_id'],
      ['chat_group_messages', 'group_id'],
      ['notifications', 'user_id'],
    ]);
    // The admin card reads «хеш» in the label to say «по хешу».
    for (const s of HASH_PARTITIONED) {
      expect(s.label).toContain('хеш');
      expect(specOf(s.table)).toBe(s);
      // Not offered to the online (monthly) runner.
      expect(PARTITION_TABLES.map((x) => x.table)).not.toContain(s.table);
      expect(MIGRATED_PARTITIONED.map((x) => x.table)).not.toContain(s.table);
    }
  });
});
