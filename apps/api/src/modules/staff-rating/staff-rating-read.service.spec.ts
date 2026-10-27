import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  StaffRatingReadService,
  ratingScope,
} from './staff-rating-read.service';
import { settingsOf } from './staff-rating.test-support';

describe('ratingScope: owner all, head own workspace, others 404', () => {
  it('the super admin and an owner-workspace admin read everything', () => {
    expect(
      ratingScope({ adminRole: 'super_admin', workspace: 'owner' }),
    ).toEqual({ workspace: null });
    expect(
      ratingScope({ adminRole: 'super_admin', workspace: 'owner' }, 'finance'),
    ).toEqual({ workspace: 'finance' });
    expect(ratingScope({ adminRole: 'support', workspace: 'owner' })).toEqual({
      workspace: null,
    });
  });

  it('a head reads only their own workspace, whatever they ask for', () => {
    const head = {
      adminRole: 'moderator',
      workspace: 'mass',
      workspaceHead: true,
    } as const;
    expect(ratingScope(head)).toEqual({ workspace: 'mass' });
    expect(ratingScope(head, 'finance')).toEqual({ workspace: 'mass' });
  });

  it('everybody else gets «not found»', () => {
    expect(() =>
      ratingScope({
        adminRole: 'verifier',
        workspace: 'mass',
        workspaceHead: false,
      }),
    ).toThrow(NotFoundException);
    expect(() =>
      ratingScope({ adminRole: 'finance', workspace: 'finance' }),
    ).toThrow(NotFoundException);
  });
});

const ID = '11111111-1111-4111-8111-111111111111';
const snapshot = (o: object = {}) => ({
  admin_id: ID,
  workspace: 'mass',
  snapshot_date: new Date('2026-10-27T00:00:00Z'),
  rating: 62,
  n_decisions: 44,
  accuracy: 50,
  clean: 80,
  users_verdict: null,
  speed: 100,
  status: 'yellow',
  flags: ['low_rating'],
  rank_pct: 80,
  evidence: { best: [], worst: [] },
  first_name: 'Ann',
  last_name: 'Lee',
  ...o,
});

function make(stored: Record<string, unknown>, rows: unknown[] = [snapshot()]) {
  const calls: string[] = [];
  const prisma = {
    $queryRaw: jest.fn((strings: string[]) => {
      calls.push('queryRaw');
      if (strings.join('?').includes('FROM staff_suggestions')) {
        return Promise.resolve([
          {
            id: 's1',
            admin_id: ID,
            kind: 'warn',
            status: 'open',
            snapshot_date: new Date('2026-10-27T00:00:00Z'),
            evidence: {},
            created_at: new Date('2026-10-27T01:40:00Z'),
            workspace: 'mass',
            first_name: 'Ann',
            last_name: 'Lee',
          },
        ]);
      }
      return Promise.resolve(rows);
    }),
    staffSuggestion: {
      findMany: jest.fn(() => {
        calls.push('suggestions');
        return Promise.resolve([
          {
            id: 's1',
            admin_id: ID,
            kind: 'warn',
            status: 'open',
            created_at: new Date('2026-10-27T01:40:00Z'),
            snapshot_date: new Date('2026-10-27T00:00:00Z'),
            evidence: {},
          },
        ]);
      }),
    },
  };
  const svc = new StaffRatingReadService(
    prisma as unknown as PrismaService,
    settingsOf(stored),
  );
  return { svc, prisma, calls };
}

describe('StaffRatingReadService', () => {
  const on = { 'staff.rating_enabled': true };

  it('switch off (the default): not found, no query', async () => {
    const { svc, calls } = make({});
    await expect(svc.people({ workspace: null }, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.person({ workspace: null }, ID)).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.shortlist({ workspace: null })).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.suggestions({ workspace: null }, {})).rejects.toThrow(
      NotFoundException,
    );
    expect(calls).toEqual([]);
  });

  it('every read costs at most three queries (it is two)', async () => {
    const { svc, calls } = make(on);
    const list = await svc.people({ workspace: null }, {});
    expect(list.items[0]).toMatchObject({
      name: 'Ann Lee',
      rating: 62,
      status: 'yellow',
      decisions: 44,
    });
    expect(list.items[0].openSuggestions).toHaveLength(1);
    expect(list.snapshotDate).toBe('2026-10-27');
    expect(calls.length).toBeLessThanOrEqual(3);

    calls.length = 0;
    const one = await svc.person({ workspace: 'mass' }, ID);
    expect(one.suggestions).toHaveLength(1);
    expect(calls.length).toBeLessThanOrEqual(3);

    calls.length = 0;
    await svc.shortlist({ workspace: null });
    expect(calls.length).toBeLessThanOrEqual(3);

    calls.length = 0;
    await svc.suggestions({ workspace: null }, {});
    expect(calls.length).toBeLessThanOrEqual(3);
  });

  it('a person outside the scope is «not found»', async () => {
    // The SQL filters by workspace; no row comes back for a foreign person.
    const { svc } = make(on, []);
    await expect(svc.person({ workspace: 'finance' }, ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('the workspace limit is a bound parameter of the query, not text', async () => {
    const { svc, prisma } = make(on);
    await svc.people({ workspace: 'mass' }, {});
    // bound as a value of the tagged template (never spliced into the text)
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as unknown as [
      string[],
      ...unknown[],
    ];
    expect(strings.join('?')).not.toContain('mass');
    expect(JSON.stringify(values)).toContain('mass');
  });

  it('shortlist splits the worst and the best', async () => {
    const { svc } = make(on, [
      { ...snapshot(), bucket: 'worst' },
      {
        ...snapshot({
          admin_id: '22222222-2222-4222-8222-222222222222',
          rating: 97,
          status: 'green',
        }),
        bucket: 'best',
      },
    ]);
    const r = await svc.shortlist({ workspace: null });
    expect(r.worst.map((p) => p.rating)).toEqual([62]);
    expect(r.best.map((p) => p.rating)).toEqual([97]);
  });
});
