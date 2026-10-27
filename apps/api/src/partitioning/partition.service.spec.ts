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

describe('PartitionService modes (hash tables are opt-in)', () => {
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

  it('setMode writes one audited setting, only for hash tables', async () => {
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
});
