/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { tokenMatches } from './alarm-events.controller';
import { alarmComponent, IncidentsService } from './incidents.service';

describe('alarm events (S12-14)', () => {
  it('compares the internal token in constant time and refuses an unset one', () => {
    expect(tokenMatches('a'.repeat(30), 'a'.repeat(30))).toBe(true);
    expect(tokenMatches('a'.repeat(30), 'b'.repeat(30))).toBe(false);
    expect(tokenMatches('a'.repeat(30), 'short')).toBe(false);
    expect(tokenMatches(undefined, 'x')).toBe(false);
    expect(tokenMatches('x', undefined)).toBe(false);
  });

  it('shortens an alarm name to a component that fits the column', () => {
    expect(alarmComponent('lawbid-prod-api-5xx-ratio')).toBe(
      'alarm:api-5xx-ratio',
    );
    expect(alarmComponent('x'.repeat(100)).length).toBe(40);
  });

  it('opens one row on ALARM, closes it on OK, ignores the rest', async () => {
    const rows: { component: string; closed_at: Date | null }[] = [];
    const prisma = {
      systemIncident: {
        findFirst: async ({ where }: { where: { component: string } }) =>
          rows.find((r) => r.component === where.component && !r.closed_at) ??
          null,
        create: async ({ data }: { data: { component: string } }) => {
          rows.push({ component: data.component, closed_at: null });
        },
        updateMany: async ({ where }: { where: { component: string } }) => {
          const open = rows.filter(
            (r) => r.component === where.component && !r.closed_at,
          );
          open.forEach((r) => (r.closed_at = new Date()));
          return { count: open.length };
        },
      },
    };
    const svc = new IncidentsService(prisma as never, {} as never);
    expect(await svc.recordAlarm('lawbid-prod-db-down', 'ALARM', 'x')).toBe(
      'opened',
    );
    expect(await svc.recordAlarm('lawbid-prod-db-down', 'ALARM', 'x')).toBe(
      'ignored',
    );
    expect(
      await svc.recordAlarm('lawbid-prod-db-down', 'INSUFFICIENT_DATA', 'x'),
    ).toBe('ignored');
    expect(await svc.recordAlarm('lawbid-prod-db-down', 'OK', 'x')).toBe(
      'closed',
    );
    expect(await svc.recordAlarm('lawbid-prod-db-down', 'OK', 'x')).toBe(
      'ignored',
    );
  });
});
