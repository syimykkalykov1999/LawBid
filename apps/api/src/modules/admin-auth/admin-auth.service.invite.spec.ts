import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminAuthService, INVITE_TTL_SECONDS } from './admin-auth.service';
import type { AdminActor } from './admin-auth.decorators';

const KEY = 'k'.repeat(40);
const actor = {
  id: 'owner',
  ip: '1.2.3.4',
  adminRole: 'super_admin',
} as unknown as AdminActor;

function build(
  opts: {
    status?: string;
    deleted?: Date | null;
    panelUrl?: string;
    loginTaken?: boolean;
  } = {},
) {
  const store = new Map<string, { v: string; ex?: number }>();
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k)?.v ?? null)),
    set: jest.fn((k: string, v: string, _ex?: string, ttl?: number) => {
      store.set(k, { v, ex: ttl });
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
  };
  const user = { id: 'u2', email: 'ann@x.io', status: opts.status ?? 'active' };
  const prisma = {
    user: {
      findFirst: jest.fn(() => Promise.resolve(opts.deleted ? null : user)),
    },
    adminCredential: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn(() => {
        if (opts.loginTaken) {
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'x',
          });
        }
        return {};
      }),
    },
  };
  const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(1) };
  const rateLimit = {
    hashIdentifier: (s: string) => `h:${s}`,
    consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: (k: string) =>
      k === 'ADMIN_TOTP_ENC_KEY'
        ? KEY
        : k === 'ADMIN_PANEL_URL'
          ? opts.panelUrl
          : undefined,
    getOrThrow: () => 50,
  };
  const svc = new AdminAuthService(
    prisma as never,
    redis as never,
    {} as never,
    sessions as never,
    rateLimit as never,
    audit as never,
    config as never,
  );
  return { svc, redis, store, prisma, sessions, audit, rateLimit };
}

describe('admin invite link (owner 2026-10-16)', () => {
  it('issues a 72 h one-time link, stores only its hash, and audits it', async () => {
    const { svc, store, audit } = build({
      panelUrl: 'https://admin.lawbid.dev/',
    });
    const inv = await svc.createInvite(actor, 'u2');
    expect(inv.token.length).toBeGreaterThanOrEqual(40);
    expect(inv.url).toBe(`https://admin.lawbid.dev/invite/${inv.token}`);
    expect(INVITE_TTL_SECONDS).toBe(72 * 3600);
    const ttl = inv.expiresAt;
    expect(new Date(ttl).getTime() - Date.now()).toBeGreaterThan(
      71.9 * 3600 * 1000,
    );
    expect(new Date(ttl).getTime() - Date.now()).toBeLessThanOrEqual(
      72 * 3600 * 1000,
    );
    // Redis holds the hash, never the token itself.
    const keys = [...store.keys()];
    expect(keys.some((k) => k.includes(inv.token))).toBe(false);
    expect([...store.values()].every((e) => e.ex === 72 * 3600)).toBe(true);
    expect(JSON.stringify([...store.values()])).not.toContain(inv.token);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.invite_created',
        targetId: 'u2',
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(inv.token);
  });

  it('url is null without ADMIN_PANEL_URL (the panel builds it)', async () => {
    const { svc } = build();
    expect((await svc.createInvite(actor, 'u2')).url).toBeNull();
  });

  it('a new link ends the previous one', async () => {
    const { svc } = build();
    const a = await svc.createInvite(actor, 'u2');
    const b = await svc.createInvite(actor, 'u2');
    await expect(svc.previewInvite(a.token, null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.previewInvite(b.token, null)).resolves.toEqual({
      email: 'ann@x.io',
    });
  });

  it('refuses an invite for a disabled or missing account', async () => {
    await expect(
      build({ status: 'suspended' }).svc.createInvite(actor, 'u2'),
    ).rejects.toThrow();
    await expect(
      build({ deleted: new Date() }).svc.createInvite(actor, 'u2'),
    ).rejects.toThrow();
  });

  it('unknown or expired links answer 404', async () => {
    const { svc } = build();
    await expect(
      svc.previewInvite('nope'.repeat(10), null),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.acceptInvite(
        'nope'.repeat(10),
        { login: 'ann.lee', password: 'Str0ng-pass-2026' },
        null,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepting sets login + password once, ends sessions and spends the link', async () => {
    const { svc, prisma, sessions, audit } = build();
    const inv = await svc.createInvite(actor, 'u2');
    const out = await svc.acceptInvite(
      inv.token,
      { login: 'Ann.Lee', password: 'Str0ng-pass-2026' },
      '9.9.9.9',
    );
    expect(out.login).toBe('ann.lee');
    expect(prisma.adminCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          login: 'ann.lee',
          password_hash: expect.any(String),
        }),
      }),
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.invite_accepted',
        targetId: 'u2',
      }),
    );
    // The same link cannot be used twice.
    await expect(
      svc.acceptInvite(
        inv.token,
        { login: 'other.one', password: 'Str0ng-pass-2026' },
        null,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.previewInvite(inv.token, null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('a weak password is refused and the link stays usable', async () => {
    const { svc } = build();
    const inv = await svc.createInvite(actor, 'u2');
    await expect(
      svc.acceptInvite(
        inv.token,
        { login: 'ann.lee', password: 'short' },
        null,
      ),
    ).rejects.toThrow();
    await expect(svc.previewInvite(inv.token, null)).resolves.toEqual({
      email: 'ann@x.io',
    });
  });

  it('a taken login gives the link back', async () => {
    const { svc, store } = build({ loginTaken: true });
    const inv = await svc.createInvite(actor, 'u2');
    await expect(
      svc.acceptInvite(
        inv.token,
        { login: 'ann.lee', password: 'Str0ng-pass-2026' },
        null,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.size).toBe(2);
    await expect(svc.previewInvite(inv.token, null)).resolves.toBeDefined();
  });

  it('is rate limited per IP', async () => {
    const { svc, rateLimit } = build();
    rateLimit.consumeFixedWindow.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 60,
    });
    await expect(
      svc.previewInvite('x'.repeat(40), '1.1.1.1'),
    ).rejects.toMatchObject({ status: 429 });
  });
});
