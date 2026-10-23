/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { HttpStatsService } from '../http-stats.service';
import { incidentBody, incidentTitle } from './incident-texts';
import { IncidentsService, REMINDER_MS } from './incidents.service';
import { firstTurnTarget, type ProbeResult } from './status-probes.service';

type Row = {
  id: string;
  component: string;
  severity: string;
  title: string;
  detail: unknown;
  opened_at: Date;
  closed_at: Date | null;
  last_notified_at: Date | null;
  notify_count: number;
};

function fakes() {
  const rows: Row[] = [];
  const counters = new Map<string, number>();
  const redis = {
    multi: () => {
      const ops: (() => number)[] = [];
      const m = {
        incr: (k: string) => {
          ops.push(() => {
            counters.set(k, (counters.get(k) ?? 0) + 1);
            return counters.get(k)!;
          });
          return m;
        },
        expire: () => m,
        del: (k: string) => {
          ops.push(() => (counters.delete(k) ? 1 : 0));
          return m;
        },
        exec: async () => ops.map((o) => [null, o()]),
      };
      return m;
    },
  };
  const prisma = {
    systemIncident: {
      findFirst: async ({ where }: { where: { component: string } }) =>
        rows.find((r) => r.component === where.component && !r.closed_at) ??
        null,
      create: async ({ data }: { data: Partial<Row> }) => {
        if (rows.some((r) => r.component === data.component && !r.closed_at)) {
          throw new Error('unique');
        }
        const row = {
          id: `i${rows.length + 1}`,
          severity: 'red',
          closed_at: null,
          ...data,
        } as Row;
        rows.push(row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; OR?: unknown[] };
        data: Record<string, unknown>;
      }) => {
        const r = rows.find((x) => x.id === where.id && !x.closed_at);
        if (!r) return { count: 0 };
        if (where.OR) {
          const due = (where.OR[1] as { last_notified_at: { lte: Date } })
            .last_notified_at.lte;
          if (r.last_notified_at && r.last_notified_at > due) {
            return { count: 0 };
          }
        }
        if (data.closed_at) r.closed_at = data.closed_at as Date;
        if (data.last_notified_at)
          r.last_notified_at = data.last_notified_at as Date;
        if (data.notify_count) r.notify_count += 1;
        return { count: 1 };
      },
    },
  };
  return {
    rows,
    svc: new IncidentsService(prisma as never, redis as never),
  };
}

const probe = (key: string, status: ProbeResult['status']): ProbeResult => ({
  key,
  status,
  detail: { error: 'boom' },
});

describe('IncidentsService', () => {
  const t0 = new Date('2026-10-23T10:00:00Z');
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);

  it('opens only after two red checks in a row', async () => {
    const { svc, rows } = fakes();
    expect(await svc.reconcile([probe('redis', 'red')], at(0))).toEqual([]);
    const e = await svc.reconcile([probe('redis', 'red')], at(1));
    expect(e.map((x) => x.kind)).toEqual(['opened']);
    expect(rows).toHaveLength(1);
  });

  it('a single blip does not open (a green check resets the streak)', async () => {
    const { svc, rows } = fakes();
    await svc.reconcile([probe('redis', 'red')], at(0));
    await svc.reconcile([probe('redis', 'green')], at(1));
    expect(await svc.reconcile([probe('redis', 'red')], at(2))).toEqual([]);
    expect(rows).toHaveLength(0);
  });

  it('does not repeat before 15 minutes, then reminds, then closes after two good checks', async () => {
    const { svc, rows } = fakes();
    await svc.reconcile([probe('database', 'red')], at(0));
    await svc.reconcile([probe('database', 'red')], at(1));
    // De-dup: every minute for 14 minutes → silence.
    for (let m = 2; m < 16; m++) {
      expect(await svc.reconcile([probe('database', 'red')], at(m))).toEqual(
        [],
      );
    }
    const rem = await svc.reconcile(
      [probe('database', 'red')],
      new Date(at(1).getTime() + REMINDER_MS),
    );
    expect(rem.map((x) => x.kind)).toEqual(['reminder']);
    expect(rows).toHaveLength(1);
    expect(await svc.reconcile([probe('database', 'yellow')], at(20))).toEqual(
      [],
    );
    const done = await svc.reconcile([probe('database', 'green')], at(21));
    expect(done.map((x) => x.kind)).toEqual(['resolved']);
    expect(rows[0].closed_at).not.toBeNull();
  });

  it('grey (not configured) never opens an incident', async () => {
    const { svc, rows } = fakes();
    for (let m = 0; m < 5; m++) {
      await svc.reconcile([probe('turn', 'grey')], at(m));
    }
    expect(rows).toHaveLength(0);
  });
});

describe('alert words', () => {
  it('speaks Russian and English', () => {
    expect(incidentTitle('database', 'opened', 'ru')).toBe('Сбой: База данных');
    expect(incidentTitle('push', 'resolved', 'en')).toBe(
      'Resolved: Push delivery',
    );
    const b = incidentBody(
      { error: 'no answer in 3000 ms' },
      'reminder',
      'en',
      new Date('2026-10-23T10:00:00Z'),
      new Date('2026-10-23T10:16:00Z'),
    );
    expect(b).toContain('Open for 16 min');
    expect(b).toContain('no answer');
  });
});

describe('probes helpers', () => {
  it('finds the first TURN host and port', () => {
    expect(firstTurnTarget('turn:turn.example.com:3478?transport=udp')).toEqual(
      { host: 'turn.example.com', port: 3478 },
    );
    expect(firstTurnTarget('turns:t.example.com')).toEqual({
      host: 't.example.com',
      port: 5349,
    });
    expect(firstTurnTarget('')).toBeNull();
  });

  it('p95 comes from the latency buckets', () => {
    // 100 requests: 94 fast (≤25 ms), 6 slow (≤1000 ms) → p95 in the slow bucket.
    const b = new Array(9).fill(0);
    b[0] = 94;
    b[5] = 6;
    expect(HttpStatsService.percentile(b, 0.95)).toBe(1000);
    b[0] = 96;
    b[5] = 4;
    expect(HttpStatsService.percentile(b, 0.95)).toBe(25);
    expect(HttpStatsService.bucketOf(26)).toBe(1);
    expect(HttpStatsService.bucketOf(99999)).toBe(8);
  });
});
