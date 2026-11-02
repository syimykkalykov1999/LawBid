import { Prisma } from '@prisma/client';
import { NAME_SCAN_CAP, nameCandidateCtes } from './postgres-search.provider';

describe('nameCandidateCtes (load test 2026-11-02)', () => {
  const precise = Prisma.sql`full_name_lower LIKE ${'%x%'}`;
  const loose = Prisma.sql`full_name_lower % ${'x'}`;

  it('defines a precise and a loose CTE per role, each capped and comma-terminated', () => {
    const q = nameCandidateCtes(precise, loose, true, true);
    for (const n of ['att_exact', 'att_loose', 'cli_exact', 'cli_loose']) {
      expect(q.sql).toMatch(new RegExp(`${n} AS MATERIALIZED \\(`));
    }
    // the role is a literal, never a bound parameter (generic-plan risk)
    expect(q.sql).toContain("role = 'attorney'");
    expect(q.sql).toContain("role = 'client'");
    expect(q.values).not.toContain('attorney');
    expect(q.sql.match(/LIMIT \?/g)).toHaveLength(4);
    expect(q.values.filter((v) => v === NAME_SCAN_CAP)).toHaveLength(4);
    // the caller writes `WITH <ctes>cand AS (...)`: every CTE ends with ", "
    expect(q.sql.trimEnd().endsWith(',')).toBe(true);
  });

  it('a role that cannot be returned is an empty CTE (no table scan)', () => {
    const q = nameCandidateCtes(precise, loose, false, false);
    expect(q.sql).not.toContain('FROM users');
    for (const n of ['att_exact', 'att_loose', 'cli_exact', 'cli_loose']) {
      expect(q.sql).toContain(`${n} AS MATERIALIZED (SELECT NULL::UUID`);
    }
    const onlyAttorneys = nameCandidateCtes(precise, loose, true, false);
    expect(onlyAttorneys.sql.match(/FROM users/g)).toHaveLength(2);
  });
});
