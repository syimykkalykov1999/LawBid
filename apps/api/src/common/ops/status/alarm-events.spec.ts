/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { AlarmEventsController, tokenMatches } from './alarm-events.controller';
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

  describe('ALARM starts the AI assistant at once (12.11.2026)', () => {
    const TOKEN = 'test-alarm-hook-token-000000000000';
    const prev = process.env.ALARM_HOOK_TOKEN;
    beforeAll(() => {
      process.env.ALARM_HOOK_TOKEN = TOKEN;
    });
    afterAll(() => {
      process.env.ALARM_HOOK_TOKEN = prev;
    });

    function setup(ai: { trigger: jest.Mock } | null) {
      const incidents = { recordAlarm: jest.fn().mockResolvedValue('opened') };
      const moduleRef = {
        get: jest.fn(() => {
          if (!ai) throw new Error('not found');
          return ai;
        }),
      };
      const ctrl = new AlarmEventsController(
        incidents as never,
        moduleRef as never,
      );
      return { ctrl, incidents };
    }

    it('dispatches on ALARM only, with the alarm name', async () => {
      const ai = { trigger: jest.fn().mockResolvedValue('dispatched') };
      const { ctrl } = setup(ai);
      await ctrl.receive(TOKEN, {
        alarmName: 'lawbid-prod-api-5xx',
        state: 'ALARM',
      });
      expect(ai.trigger).toHaveBeenCalledWith(
        'alarm',
        'lawbid-prod-api-5xx',
        'lawbid-prod-api-5xx',
      );
      await ctrl.receive(TOKEN, {
        alarmName: 'lawbid-prod-api-5xx',
        state: 'OK',
      });
      expect(ai.trigger).toHaveBeenCalledTimes(1);
    });

    it('records the incident without the AI module (worker); a wrong token stops all', async () => {
      const { ctrl, incidents } = setup(null);
      await expect(
        ctrl.receive(TOKEN, { alarmName: 'a', state: 'ALARM' }),
      ).resolves.toEqual({ result: 'opened' });
      expect(incidents.recordAlarm).toHaveBeenCalled();
      const ai = { trigger: jest.fn() };
      const other = setup(ai);
      await expect(
        other.ctrl.receive('wrong', { alarmName: 'a', state: 'ALARM' }),
      ).rejects.toThrow();
      expect(ai.trigger).not.toHaveBeenCalled();
    });
  });
});
