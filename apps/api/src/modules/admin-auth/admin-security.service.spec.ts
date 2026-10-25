import { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import { AdminSecurityService } from './admin-security.service';
import type { AdminSessionService } from './admin-session.service';

function make(
  settings: Record<string, unknown>,
  env: Record<string, string> = {},
  extra: {
    logins?: { ip: string | null; after: unknown }[];
    sessions?: {
      sessionId: string;
      createdAt: string;
      device: string | null;
      ip: string | null;
    }[];
  } = {},
) {
  const sessions = {
    listForUsers: jest.fn().mockResolvedValue(extra.sessions ?? []),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const sendEmail = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    auditLog: { findMany: jest.fn().mockResolvedValue(extra.logins ?? []) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ email: 'lawyer@example.com' }),
      findMany: jest.fn().mockResolvedValue([{ email: 'owner@example.com' }]),
    },
  };
  const appSettings = {
    boolean: jest.fn(async (k: string) => settings[k] === true),
    number: jest.fn(async (k: string) => Number(settings[k] ?? 0)),
    stringList: jest.fn(async (k: string) => (settings[k] as string[]) ?? []),
  };
  const svc = new AdminSecurityService(
    prisma as unknown as PrismaService,
    sessions as unknown as AdminSessionService,
    audit as unknown as AuditLogService,
    { get: (k: string) => env[k] } as unknown as ConfigService,
    appSettings as unknown as AppSettingsService,
    { sendEmail },
  );
  return { svc, sessions, audit, sendEmail, prisma };
}

describe('AdminSecurityService.assertIpAllowed', () => {
  it('does nothing while the allowlist is off (default)', async () => {
    const { svc } = make({ 'admin.ip_allowlist_enabled': false });
    await expect(svc.assertIpAllowed('198.51.100.1')).resolves.toBeUndefined();
  });

  it('refuses an address that is not on the list', async () => {
    const { svc } = make({
      'admin.ip_allowlist_enabled': true,
      'admin.ip_allowlist': ['203.0.113.0/24'],
    });
    await expect(svc.assertIpAllowed('198.51.100.1')).rejects.toMatchObject({
      response: { code: 'ADMIN_IP_NOT_ALLOWED' },
    });
    await expect(svc.assertIpAllowed('203.0.113.5')).resolves.toBeUndefined();
  });

  it('the emergency env switch bypasses the list', async () => {
    const { svc } = make(
      { 'admin.ip_allowlist_enabled': true, 'admin.ip_allowlist': [] },
      { ADMIN_IP_ALLOWLIST_BYPASS: '1' },
    );
    await expect(svc.assertIpAllowed('198.51.100.1')).resolves.toBeUndefined();
  });
});

describe('AdminSecurityService.assertSafeToChange (no self lock-out)', () => {
  it('refuses to switch the list on without the editor’s own address', async () => {
    const { svc } = make({ 'admin.ip_allowlist': ['203.0.113.7'] });
    await expect(
      svc.assertSafeToChange('admin.ip_allowlist_enabled', true, '198.51.100.1'),
    ).rejects.toThrow(/lock yourself out/);
    await expect(
      svc.assertSafeToChange('admin.ip_allowlist_enabled', true, '203.0.113.7'),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertSafeToChange('admin.ip_allowlist_enabled', false, '198.51.100.1'),
    ).resolves.toBeUndefined();
  });

  it('refuses a new list that drops the editor while the list is on', async () => {
    const { svc } = make({ 'admin.ip_allowlist_enabled': true });
    await expect(
      svc.assertSafeToChange('admin.ip_allowlist', ['203.0.113.7'], '198.51.100.1'),
    ).rejects.toThrow(/lock yourself out/);
    await expect(
      svc.assertSafeToChange('admin.ip_allowlist', ['nonsense'], '198.51.100.1'),
    ).rejects.toThrow(/not an IP address/);
    await expect(
      svc.assertSafeToChange('admin.ip_allowlist', ['198.51.100.0/24'], '198.51.100.1'),
    ).resolves.toBeUndefined();
  });

  it('ignores other keys', async () => {
    const { svc } = make({});
    await expect(
      svc.assertSafeToChange('billing.trial_days', 3, null),
    ).resolves.toBeUndefined();
  });
});

describe('AdminSecurityService.enforceSessionCap', () => {
  const live = (id: string, at: string) => ({
    sessionId: id,
    createdAt: at,
    device: 'Chrome · macOS',
    ip: '203.0.113.1',
  });

  it('is off at 0', async () => {
    const { svc, sessions } = make({ 'admin.max_concurrent_sessions': 0 });
    expect(await svc.enforceSessionCap('a1', 'new')).toBe(0);
    expect(sessions.listForUsers).not.toHaveBeenCalled();
  });

  it('ends the oldest sessions beyond the cap and audits each', async () => {
    const { svc, sessions, audit } = make(
      { 'admin.max_concurrent_sessions': 2 },
      {},
      {
        sessions: [
          live('old', '2026-10-01T00:00:00Z'),
          live('mid', '2026-10-02T00:00:00Z'),
          live('new', '2026-10-03T00:00:00Z'),
        ],
      },
    );
    expect(await svc.enforceSessionCap('a1', 'new')).toBe(1);
    expect(sessions.revoke).toHaveBeenCalledTimes(1);
    expect(sessions.revoke).toHaveBeenCalledWith('old', 'a1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session_evicted' }),
    );
  });

  it('never ends the session that was just created', async () => {
    const { svc, sessions } = make(
      { 'admin.max_concurrent_sessions': 1 },
      {},
      {
        sessions: [
          live('new', '2026-10-01T00:00:00Z'),
          live('other', '2026-10-05T00:00:00Z'),
        ],
      },
    );
    await svc.enforceSessionCap('a1', 'new');
    expect(sessions.revoke).toHaveBeenCalledWith('other', 'a1');
  });
});

describe('AdminSecurityService new device / IP alert', () => {
  const prior = [{ ip: '203.0.113.1', after: { device: 'Chrome · macOS' } }];

  it('the very first sign-in is not an alert', async () => {
    const { svc } = make({}, {}, { logins: [] });
    expect(await svc.checkNewContext('a1', '198.51.100.1', 'Firefox · Linux')).toEqual({
      newIp: false,
      newDevice: false,
    });
  });

  it('flags a new address and a new device separately', async () => {
    const { svc } = make({}, {}, { logins: prior });
    expect(await svc.checkNewContext('a1', '203.0.113.1', 'Chrome · macOS')).toEqual({
      newIp: false,
      newDevice: false,
    });
    expect(await svc.checkNewContext('a1', '198.51.100.1', 'Chrome · macOS')).toEqual({
      newIp: true,
      newDevice: false,
    });
    expect(await svc.checkNewContext('a1', '203.0.113.1', 'Safari · iOS')).toEqual({
      newIp: false,
      newDevice: true,
    });
  });

  it('e-mails every owner when something is new, nobody when not', async () => {
    const t = make({ 'admin.login_alert_enabled': true });
    await t.svc.alertOwners(
      'a1',
      { ip: '198.51.100.1', device: 'Safari · iOS' },
      { newIp: true, newDevice: true },
    );
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    expect(t.sendEmail.mock.calls[0][0].to).toBe('owner@example.com');
    expect(t.sendEmail.mock.calls[0][0].text).toContain('a new device and a new IP');
    await t.svc.alertOwners('a1', { ip: null, device: null }, {
      newIp: false,
      newDevice: false,
    });
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('respects the switch and never throws when the mail fails', async () => {
    const off = make({ 'admin.login_alert_enabled': false });
    await off.svc.alertOwners('a1', { ip: 'x', device: 'y' }, { newIp: true, newDevice: false });
    expect(off.sendEmail).not.toHaveBeenCalled();
    const broken = make({ 'admin.login_alert_enabled': true });
    broken.sendEmail.mockRejectedValue(new Error('SES down'));
    await expect(
      broken.svc.alertOwners('a1', { ip: 'x', device: 'y' }, { newIp: true, newDevice: false }),
    ).resolves.toBeUndefined();
  });
});
