import type { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../common/app-settings/app-settings.service';
import type { AppSettingsWriter } from '../common/app-settings/app-settings.writer';
import type { PrismaService } from '../prisma/prisma.service';
import { PartitionService } from './partition.service';

function make(values: Record<string, string | number>) {
  const writes: unknown[] = [];
  const settings = {
    string: (k: string) => Promise.resolve(String(values[k] ?? 'off')),
    number: (k: string) => Promise.resolve(Number(values[k] ?? 50_000_000)),
  } as unknown as AppSettingsService;
  const writer = {
    write: (...a: unknown[]) => {
      writes.push(a);
      return Promise.resolve();
    },
  } as unknown as AppSettingsWriter;
  const svc = new PartitionService(
    {} as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
    settings,
    writer,
  );
  return { svc, writes };
}

describe('PartitionService modes (hash tables and post_view_events)', () => {
  it('everything is «off» by default and for unknown values', async () => {
    const { svc } = make({ 'partition.notifications_mode': 'sometimes' });
    expect(await svc.mode('messages')).toBe('off');
    expect(await svc.mode('notifications')).toBe('off');
    expect(await svc.mode('audit_log')).toBe('off');
  });

  it('reads «on» and «auto» and the admin-editable threshold', async () => {
    const { svc } = make({
      'partition.messages_mode': 'auto',
      'partition.chat_group_messages_mode': 'on',
      'partition.auto_rows': 20_000_000,
    });
    expect(await svc.mode('messages')).toBe('auto');
    expect(await svc.mode('chat_group_messages')).toBe('on');
    expect(await svc.autoRows()).toBe(20_000_000);
  });

  it('setMode writes one audited setting, only for switchable tables', async () => {
    const { svc, writes } = make({});
    await svc.setMode('messages', 'auto', 'admin-1');
    expect(writes).toEqual([
      ['admin-1', 'ops.partition_mode', { 'partition.messages_mode': 'auto' }],
    ]);
    await expect(svc.setMode('audit_log', 'on', 'admin-1')).rejects.toThrow();
  });

  it('resetMode (after undo / abort) turns a non-off mode back to off', async () => {
    const { svc, writes } = make({ 'partition.notifications_mode': 'on' });
    await svc.resetMode('notifications', 'admin-1');
    expect(writes).toHaveLength(1);
    const again = make({});
    await again.svc.resetMode('notifications', 'admin-1');
    expect(again.writes).toHaveLength(0);
  });

  it('autoStart does nothing without the runner role', async () => {
    const { svc } = make({ 'partition.messages_mode': 'on' });
    expect(await svc.autoStart()).toEqual([]);
  });

  describe('autoStart for the monthly post_view_events', () => {
    const build = (
      values: Record<string, string | number>,
      rows: number,
      job: { phase: string } | null = null,
    ) => {
      const started: string[] = [];
      const run = {
        activeJobs: () => Promise.resolve([]),
        stats: () =>
          Promise.resolve({ exists: true, partitioned: false, rows }),
        job: () => Promise.resolve(job),
        precheck: () => Promise.resolve({ ok: true, reasons: [] }),
        start: (spec: { table: string }) => {
          started.push(spec.table);
          return Promise.resolve({});
        },
      };
      const { svc } = make(values);
      Object.defineProperty(svc, 'runnerConfigured', { get: () => true });
      (svc as unknown as { runnerRw: () => unknown }).runnerRw = () => run;
      return { svc, started };
    };

    it('reads and writes its mode like the hash tables', async () => {
      const { svc, writes } = make({
        'partition.post_view_events_mode': 'auto',
      });
      expect(await svc.mode('post_view_events')).toBe('auto');
      await svc.setMode('post_view_events', 'on', 'admin-1');
      expect(writes).toEqual([
        [
          'admin-1',
          'ops.partition_mode',
          { 'partition.post_view_events_mode': 'on' },
        ],
      ]);
    });

    it('«auto» waits for the threshold, then starts the month conversion', async () => {
      const values = {
        'partition.post_view_events_mode': 'auto',
        'partition.auto_rows': 1000,
      };
      const small = build(values, 999);
      expect(await small.svc.autoStart()).toEqual([]);
      const big = build(values, 1000);
      expect(await big.svc.autoStart()).toEqual(['post_view_events']);
      expect(big.started).toEqual(['post_view_events']);
    });

    it('a table that is already partitioned or has an active job is skipped', async () => {
      const values = { 'partition.post_view_events_mode': 'on' };
      const { svc, started } = build(values, 5);
      const rw = (
        svc as unknown as { runnerRw: () => Record<string, unknown> }
      ).runnerRw();
      rw.activeJobs = () => Promise.resolve([{ tbl: 'messages' }]);
      expect(await svc.autoStart()).toEqual([]);
      expect(started).toEqual([]);
      rw.activeJobs = () => Promise.resolve([]);
      rw.stats = () =>
        Promise.resolve({ exists: true, partitioned: true, rows: 9e9 });
      expect(await svc.autoStart()).toEqual([]);
    });

    it('a failing precheck is skipped, not started', async () => {
      const { svc, started } = build(
        { 'partition.post_view_events_mode': 'on' },
        5,
      );
      const rw = (
        svc as unknown as { runnerRw: () => Record<string, unknown> }
      ).runnerRw();
      rw.precheck = () => Promise.resolve({ ok: false, reasons: ['x'] });
      expect(await svc.autoStart()).toEqual([]);
      expect(started).toEqual([]);
    });

    it('«off» never starts, «on» starts at any size, an undone job is not repeated', async () => {
      expect(
        await build(
          { 'partition.post_view_events_mode': 'off' },
          9e9,
        ).svc.autoStart(),
      ).toEqual([]);
      expect(
        await build(
          { 'partition.post_view_events_mode': 'on' },
          5,
        ).svc.autoStart(),
      ).toEqual(['post_view_events']);
      expect(
        await build({ 'partition.post_view_events_mode': 'on' }, 5, {
          phase: 'aborted',
        }).svc.autoStart(),
      ).toEqual([]);
    });
  });
});
