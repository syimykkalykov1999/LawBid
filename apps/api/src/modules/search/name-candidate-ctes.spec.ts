import { Prisma } from '@prisma/client';
import { NAME_SCAN_CAP, nameCandidateCtes } from './postgres-search.provider';

describe('nameCandidateCtes (load test 2026-11-02)', () => {
  const m = Prisma.sql`full_name_lower LIKE ${'%x%'}`;

  it('defines both CTEs the people query reads, each capped and comma-terminated', () => {
    const q = nameCandidateCtes(m, true, true);
    expect(q.sql).toMatch(/att_by_name AS MATERIALIZED \(/);
    expect(q.sql).toMatch(/cli_by_name AS MATERIALIZED \(/);
    expect(q.sql).toContain("role = 'attorney'");
    expect(q.sql).toContain("role = 'client'");
    expect(q.sql.match(/LIMIT \?/g)).toHaveLength(2);
    expect(q.values.filter((v) => v === NAME_SCAN_CAP)).toHaveLength(2);
    // the caller writes `WITH <ctes>cand AS (...)`: every CTE ends with ", "
    expect(q.sql.trimEnd().endsWith(',')).toBe(true);
  });

  it('a role that cannot be returned is an empty CTE (no table scan)', () => {
    const q = nameCandidateCtes(m, false, false);
    expect(q.sql).not.toContain('FROM users');
    expect(q.sql).toContain('att_by_name AS MATERIALIZED (SELECT NULL::UUID');
    expect(q.sql).toContain('cli_by_name AS MATERIALIZED (SELECT NULL::UUID');
    const onlyAttorneys = nameCandidateCtes(m, true, false);
    expect(onlyAttorneys.sql.match(/FROM users/g)).toHaveLength(1);
  });
});
