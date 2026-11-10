import type Redis from 'ioredis';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminRealtimeController } from './admin-realtime.controller';

const admin = {
  id: 'admin-1',
  sessionId: 'sess-1',
  countries: ['US'],
} as unknown as AdminActor;

function build(enabled: boolean) {
  const redis = { set: jest.fn(() => Promise.resolve('OK')) };
  const settings = { boolean: jest.fn(() => Promise.resolve(enabled)) };
  const ctl = new AdminRealtimeController(
    redis as unknown as Redis,
    settings as unknown as AppSettingsService,
  );
  return { ctl, redis };
}

describe('AdminRealtimeController', () => {
  it('stores a one-shot ticket bound to the admin session for 60 s', async () => {
    const { ctl, redis } = build(true);
    const out = await ctl.ticket(admin);
    expect(out.enabled).toBe(true);
    expect(out.namespace).toBe('/admin');
    expect(out.ttlSec).toBe(60);
    expect(out.ticket).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(redis.set).toHaveBeenCalledWith(
      `adm:rt:ticket:${out.ticket}`,
      JSON.stringify({
        adminId: 'admin-1',
        sessionId: 'sess-1',
        countries: ['US'],
      }),
      'EX',
      60,
    );
    // every ticket is its own secret
    expect((await ctl.ticket(admin)).ticket).not.toBe(out.ticket);
  });

  it('the switch off: no ticket, the panel keeps polling', async () => {
    const { ctl, redis } = build(false);
    expect(await ctl.ticket(admin)).toEqual({
      enabled: false,
      ticket: null,
      namespace: '/admin',
      ttlSec: 0,
    });
    expect(redis.set).not.toHaveBeenCalled();
  });
});
