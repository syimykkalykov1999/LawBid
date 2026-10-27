import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { RequestAdmin } from '../admin-auth/admin-auth.decorators';
import { deviceFingerprint } from '../admin-auth/admin-session.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffSecurityService } from './staff-security.service';

const USER_ID = '3f2b8a52-1c3e-4a6f-9d2e-0a1b2c3d4e5f';

function setup(
  stored: Record<string, unknown> = {},
  opts: { binding?: { ip: string; fp: string } } = {},
) {
  const store = new Map<string, number | string>();
  const redis = {
    incr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, n);
      return Promise.resolve(n);
    }),
    decr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? 0) - 1;
      store.set(k, n);
      return Promise.resolve(n);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    set: jest.fn((k: string, v: string) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const sessions = {
    binding: jest.fn(() => Promise.resolve(opts.binding ?? { ip: '', fp: '' })),
    revoke: jest.fn(() => Promise.resolve()),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ phone_e164: '+14155552680', email: 'a@b.co' }),
      ),
    },
    attorneyLicense: {
      findUnique: jest.fn(() => Promise.resolve({ bar_number: 'NY1234567' })),
    },
  };
  const watch = {
    noteOpened: jest.fn(() => Promise.resolve()),
    noteReveal: jest.fn(() => Promise.resolve()),
  };
  const all = { ...stored };
  const staff = new StaffSettingsService({
    all: () => Promise.resolve(all),
  } as unknown as AppSettingsService);
  const settings = {
    stringList: jest.fn((k: string) =>
      Promise.resolve((all[k] as string[]) ?? []),
    ),
  } as unknown as AppSettingsService;
  const svc = new StaffSecurityService(
    staff,
    sessions as never,
    audit as never,
    prisma as never,
    watch as never,
    redis as never,
    settings,
  );
  return { svc, redis, audit, sessions, prisma, watch, store };
}

const mass = (
  over: Partial<RequestAdmin> = {},
): RequestAdmin & { ip: string } => ({
  id: 'adm-1',
  adminRole: 'support',
  sessionId: 'jti-1',
  justification: null,
  permissions: { users: 'view', verification: 'manage' },
  manageAdmins: false,
  partner: null,
  workspace: 'mass',
  ip: '203.0.113.5',
  ...over,
});
const owner = () => mass({ adminRole: 'super_admin', workspace: 'owner' });
const req = (o: {
  url?: string;
  method?: string;
  ip?: string;
  headers?: Record<string, string>;
}) =>
  ({
    originalUrl: o.url ?? '/api/v1/admin/users',
    url: o.url ?? '/api/v1/admin/users',
    method: o.method ?? 'GET',
    ip: o.ip ?? '203.0.113.5',
    header: (n: string) => o.headers?.[n.toLowerCase()],
  }) as unknown as Request;

describe('StaffSecurityService — masking by workspace', () => {
  it('switch off (the default): nobody is masked', async () => {
    const { svc } = setup();
    expect(await svc.maskMode(mass())).toBe('none');
  });

  it('on: the mass workspace is masked; owner, finance, deputy and partners are not', async () => {
    const { svc } = setup({ 'staff.masking_enabled': true });
    expect(await svc.maskMode(mass())).toBe('partial');
    expect(await svc.maskMode(owner())).toBe('none');
    expect(
      await svc.maskMode(mass({ workspace: 'finance', adminRole: 'finance' })),
    ).toBe('none');
    expect(await svc.maskMode(mass({ manageAdmins: true }))).toBe('none');
    expect(
      await svc.maskMode(mass({ partner: { id: 'p', lead: false } as never })),
    ).toBe('none');
  });
});

describe('StaffSecurityService — reveal', () => {
  const dto = {
    targetType: 'user',
    targetId: USER_ID,
    field: 'phone',
  } as const;

  it('is a 404 while masking is off', async () => {
    const { svc, audit } = setup();
    await expect(svc.reveal(mass(), dto)).rejects.toMatchObject({
      status: 404,
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('gives the full value, writes the audit row first and counts the day', async () => {
    const { svc, audit, watch } = setup({ 'staff.masking_enabled': true });
    const r = await svc.reveal(mass(), dto);
    expect(r).toEqual({
      field: 'phone',
      value: '+14155552680',
      remainingToday: 19,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'adm-1',
        action: 'admin.pii_reveal',
        targetType: 'user',
        targetId: USER_ID,
        after: { field: 'phone', masked: true },
      }),
    );
    expect(watch.noteReveal).toHaveBeenCalledWith('adm-1');
  });

  it('the 21st reveal of the day is 429 STAFF_REVEAL_LIMIT (limit from the settings)', async () => {
    const { svc } = setup({ 'staff.masking_enabled': true });
    for (let i = 0; i < 20; i++) await svc.reveal(mass(), dto);
    const err = await svc.reveal(mass(), dto).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.STAFF_REVEAL_LIMIT,
      details: { limit: 20 },
    });
  });

  it('the limit follows the setting', async () => {
    const { svc } = setup({
      'staff.masking_enabled': true,
      'staff.reveal_per_day': 2,
    });
    await svc.reveal(mass(), dto);
    await svc.reveal(mass(), dto);
    await expect(svc.reveal(mass(), dto)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('a reveal that found nothing does not use up the day', async () => {
    const { svc, prisma } = setup({
      'staff.masking_enabled': true,
      'staff.reveal_per_day': 1,
    });
    prisma.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(svc.reveal(mass(), dto)).rejects.toMatchObject({
      status: 404,
    });
    await expect(svc.reveal(mass(), dto)).resolves.toMatchObject({
      remainingToday: 0,
    });
  });

  it('a failed audit row means no value (fail closed) and no day used', async () => {
    const { svc, audit } = setup({
      'staff.masking_enabled': true,
      'staff.reveal_per_day': 1,
    });
    audit.record.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.reveal(mass(), dto)).rejects.toThrow('db down');
    await expect(svc.reveal(mass(), dto)).resolves.toMatchObject({
      remainingToday: 0,
    });
  });

  it('a no-PII admin never gets a contact back', async () => {
    const { svc, audit } = setup({ 'staff.masking_enabled': true });
    await expect(
      svc.reveal(
        mass({ noPii: true, workspace: 'finance', adminRole: 'finance' }),
        dto,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('the owner reveals without a limit (and is audited)', async () => {
    const { svc, audit } = setup({
      'staff.masking_enabled': true,
      'staff.reveal_per_day': 1,
    });
    for (let i = 0; i < 3; i++) {
      const r = await svc.reveal(owner(), dto);
      expect(r.remainingToday).toBeNull();
    }
    expect(audit.record).toHaveBeenCalledTimes(3);
  });

  it('a wrong field for the target, or a section the admin lacks, is a 404', async () => {
    const { svc } = setup({ 'staff.masking_enabled': true });
    await expect(
      svc.reveal(mass(), {
        targetType: 'license',
        targetId: USER_ID,
        field: 'phone',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.reveal(mass({ permissions: { support: 'manage' } }), dto),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('reveals a document number of a licence', async () => {
    const { svc } = setup({ 'staff.masking_enabled': true });
    const r = await svc.reveal(mass(), {
      targetType: 'license',
      targetId: USER_ID,
      field: 'barNumber',
    });
    expect(r.value).toBe('NY1234567');
  });
});

describe('StaffSecurityService — exports and the card counter', () => {
  const csv = '/api/v1/admin/outreach/leads/export.csv';

  it('switch off: nothing changes (an export passes, no counter)', async () => {
    const { svc, audit, watch } = setup();
    await expect(
      svc.beforeHandler(req({ url: csv }), mass()),
    ).resolves.toBeUndefined();
    expect(audit.record).not.toHaveBeenCalled();
    expect(watch.noteOpened).not.toHaveBeenCalled();
  });

  it('on: 403 STAFF_EXPORT_BLOCKED + an audit row for the mass workspace', async () => {
    const { svc, audit } = setup({ 'staff.export_block_enabled': true });
    await expect(
      svc.beforeHandler(req({ url: csv }), mass()),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: ErrorCode.STAFF_EXPORT_BLOCKED },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.export_blocked',
        adminId: 'adm-1',
      }),
    );
  });

  it('on: the owner and finance export as before', async () => {
    const { svc, audit } = setup({ 'staff.export_block_enabled': true });
    await svc.beforeHandler(req({ url: csv }), owner());
    await svc.beforeHandler(
      req({ url: csv }),
      mass({ workspace: 'finance', adminRole: 'finance' }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a card opened by the mass workspace is counted only with the detector on', async () => {
    const card = req({ url: `/api/v1/admin/users/${USER_ID}` });
    const off = setup();
    await off.svc.beforeHandler(card, mass());
    expect(off.watch.noteOpened).not.toHaveBeenCalled();
    const on = setup({ 'staff.anomalies_enabled': true });
    await on.svc.beforeHandler(card, mass());
    expect(on.watch.noteOpened).toHaveBeenCalledWith('adm-1', {
      area: 'users',
      id: USER_ID,
    });
    await on.svc.beforeHandler(card, owner());
    expect(on.watch.noteOpened).toHaveBeenCalledTimes(1);
  });
});

describe('StaffSecurityService — session rules', () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36';
  const bound = { ip: '203.0.113.5', fp: deviceFingerprint(UA) };
  const on = { 'staff.session_binding_enforce_enabled': true };
  const r = (headers: Record<string, string> = {}, ip = '203.0.113.9') =>
    req({ ip, headers: { 'user-agent': UA, ...headers } });

  it('switch off: nothing is checked, not even Redis', async () => {
    const { svc, sessions } = setup(
      { 'admin.country_allowlist': ['US'] },
      { binding: bound },
    );
    await svc.checkSession(r({ 'cf-ipcountry': 'RU' }, '198.51.100.1'), mass());
    expect(sessions.binding).not.toHaveBeenCalled();
  });

  it('the owner is never checked', async () => {
    const { svc, sessions } = setup(
      { ...on, 'admin.country_allowlist': ['US'] },
      { binding: bound },
    );
    await svc.checkSession(
      r({ 'cf-ipcountry': 'RU' }, '198.51.100.1'),
      owner(),
    );
    expect(sessions.binding).not.toHaveBeenCalled();
  });

  it('same device, same network: passes', async () => {
    const { svc, sessions } = setup(on, { binding: bound });
    await svc.checkSession(r(), mass());
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('country list empty = no check; country not on the list = 403 + audit', async () => {
    const empty = setup(on, { binding: bound });
    await empty.svc.checkSession(r({ 'cf-ipcountry': 'RU' }), mass());
    const { svc, audit } = setup(
      { ...on, 'admin.country_allowlist': ['US', 'KG'] },
      { binding: bound },
    );
    await svc.checkSession(r({ 'cf-ipcountry': 'KG' }), mass());
    await svc.checkSession(r(), mass()); // unknown country: quiet
    await expect(
      svc.checkSession(r({ 'cf-ipcountry': 'RU' }), mass()),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: ErrorCode.ADMIN_COUNTRY_NOT_ALLOWED },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session_country_denied' }),
    );
  });

  it('another device: the session ends, 401 ADMIN_DEVICE_CHANGED, audit row', async () => {
    const { svc, sessions, audit } = setup(on, { binding: bound });
    await expect(
      svc.checkSession(
        r({ 'user-agent': 'Mozilla/5.0 (Linux; Android) Firefox/130' }),
        mass(),
      ),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: ErrorCode.ADMIN_DEVICE_CHANGED },
    });
    expect(sessions.revoke).toHaveBeenCalledWith('jti-1', 'adm-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session_device_changed' }),
    );
  });

  it('a session from before the rule (no pin) is not touched', async () => {
    const { svc } = setup(on, { binding: { ip: '', fp: '' } });
    await svc.checkSession(
      r({ 'user-agent': 'anything' }, '198.51.100.7'),
      mass(),
    );
  });

  it('network address changed in the middle: the session ends, 401 ADMIN_IP_CHANGED', async () => {
    const { svc, sessions, audit } = setup(on, { binding: bound });
    await expect(
      svc.checkSession(r({}, '198.51.100.7'), mass()),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: ErrorCode.ADMIN_IP_CHANGED },
    });
    expect(sessions.revoke).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.session_ip_changed' }),
    );
  });

  it('finance staff are watched too', async () => {
    const { svc } = setup(on, { binding: bound });
    await expect(
      svc.checkSession(
        r({}, '198.51.100.7'),
        mass({ workspace: 'finance', adminRole: 'finance' }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
