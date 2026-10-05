/* eslint-disable @typescript-eslint/require-await -- an in-memory Prisma: async fakes keep the real call shape. */
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClientFraudService } from './client-fraud.service';

type Fp = {
  id: string;
  user_id: string;
  kind: string;
  hash: string;
  last_seen_at: Date;
  banned_at: Date | null;
};
type U = { id: string; role: string; status: string; admin_profile: null };

/** A small in-memory Prisma: just what the service reads and writes. */
function world(overrides: Record<string, unknown> = {}) {
  const fps: Fp[] = [];
  const users = new Map<string, U>();
  const profiles = new Map<string, Record<string, unknown>>();
  const events: Record<string, unknown>[] = [];
  let reports: { reporter_id: string; reason: string }[] = [];
  let dealt: string[] = [];
  const matchPair = (f: Fp, w: Record<string, unknown>) => {
    const not = (w.user_id as { not?: string } | undefined)?.not;
    if (not && f.user_id === not) return false;
    if (typeof w.user_id === 'string' && f.user_id !== w.user_id) return false;
    const or = w.OR as { kind: string; hash: string }[] | undefined;
    return !or || or.some((p) => p.kind === f.kind && p.hash === f.hash);
  };
  const prisma = {
    identityFingerprint: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        fps.filter((f) => matchPair(f, where)),
      ),
      upsert: jest.fn(async ({ create }: { create: Fp }) => {
        const hit = fps.find(
          (f) =>
            f.user_id === create.user_id &&
            f.kind === create.kind &&
            f.hash === create.hash,
        );
        if (hit) hit.last_seen_at = new Date();
        else
          fps.push({
            ...create,
            id: String(fps.length),
            last_seen_at: new Date(),
            banned_at: null,
          });
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          users.get(where.id) ?? null,
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] }; status?: string };
        }) =>
          [...users.values()].filter(
            (u) =>
              where.id.in.includes(u.id) &&
              (!where.status || u.status === where.status),
          ),
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { status: string };
        }) => {
          const u = users.get(where.id)!;
          u.status = data.status;
          return u;
        },
      ),
    },
    accountBan: { findMany: jest.fn(async () => []) },
    adminProfile: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    subscription: { findUnique: jest.fn(async () => null) },
    clientFraudProfile: {
      findUnique: jest.fn(
        async ({ where }: { where: { user_id: string } }) =>
          profiles.get(where.user_id) ?? null,
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { user_id: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const cur = profiles.get(where.user_id);
          const next = cur
            ? { ...cur, ...update }
            : { cleared_score: null, ...create };
          profiles.set(where.user_id, next);
          return next;
        },
      ),
    },
    clientFraudEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
      }),
    },
    case: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findUnique: jest.fn(async () => null),
    },
    report: { findMany: jest.fn(async () => reports) },
    contactIssueReport: { count: jest.fn(async () => 0) },
    casePayment: { count: jest.fn(async () => 0) },
    bid: {
      findMany: jest.fn(async () => dealt.map((a) => ({ attorney_id: a }))),
    },
    conversation: { findMany: jest.fn(async () => []) },
  };
  const values: Record<string, unknown> = { ...APP_SETTINGS, ...overrides };
  const settings = {
    boolean: jest.fn(async (k: string) => values[k] as boolean),
    number: jest.fn(async (k: string) => values[k] as number),
    string: jest.fn(async (k: string) => String(values[k])),
  };
  const config = { getOrThrow: () => 'x'.repeat(40) };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const revoke = jest.fn(async () => []);
  const moduleRef = {
    get: jest.fn(() => ({
      revokeAllChainsForUser: revoke,
      archiveOpenCasesOfClient: jest.fn(async () => []),
    })),
  };
  const svc = new ClientFraudService(
    prisma as unknown as PrismaService,
    settings as unknown as AppSettingsService,
    config as unknown as ConfigService,
    moduleRef as unknown as ModuleRef,
    logger as unknown as PinoLogger,
    {} as Redis,
  );
  const addUser = (id: string, role = 'client', status = 'active') =>
    users.set(id, { id, role, status, admin_profile: null });
  return {
    svc,
    users,
    profiles,
    events,
    revoke,
    addUser,
    setReports: (r: typeof reports, d: string[]) => {
      reports = r;
      dealt = d;
    },
  };
}

describe('ClientFraudService — repeat accounts', () => {
  it('refuses a blocked fraudster coming back with the same phone', async () => {
    const w = world();
    w.addUser('fraud');
    await w.svc.recordSignIn('fraud', {
      phone: '+15550001111',
      deviceKey: 'android-1',
    });
    w.users.get('fraud')!.status = 'suspended';

    await expect(
      w.svc.assertSignInAllowed({ phone: '+1 555 000 1111' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.events.some((e) => e.kind === 'sign_in_blocked')).toBe(true);
  });

  it('a new e-mail on the blocked phone (device) is held for review, not refused', async () => {
    const w = world();
    w.addUser('fraud');
    await w.svc.recordSignIn('fraud', {
      email: 'scam@mail.com',
      deviceKey: 'android-1',
    });
    w.users.get('fraud')!.status = 'suspended';

    const v = await w.svc.assertSignInAllowed({
      email: 'new@mail.com',
      deviceKey: 'android-1',
    });
    expect(v.action).toBe('review');

    w.addUser('alt');
    await w.svc.recordSignIn('alt', {
      email: 'new@mail.com',
      deviceKey: 'android-1',
    });
    expect(w.profiles.get('alt')?.status).toBe('restricted');
    await expect(w.svc.assertNotRestricted('alt')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the strict preset refuses the blocked device too', async () => {
    const w = world({ 'fraud.device_action': 'block' });
    w.addUser('fraud');
    await w.svc.recordSignIn('fraud', { deviceKey: 'android-1' });
    w.users.get('fraud')!.status = 'suspended';
    await expect(
      w.svc.assertSignInAllowed({ email: 'x@y.com', deviceKey: 'android-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a block takes the other existing accounts of the same person down', async () => {
    const w = world();
    w.addUser('fraud');
    w.addUser('alt');
    await w.svc.recordSignIn('fraud', {
      social: { provider: 'apple', uid: 'apple-sub-1' },
    });
    await w.svc.recordSignIn('alt', {
      social: { provider: 'apple', uid: 'apple-sub-1' },
    });
    expect(w.users.get('alt')!.status).toBe('active');

    w.users.get('fraud')!.status = 'suspended';
    await w.svc.onBanned('fraud');
    expect(w.users.get('alt')!.status).toBe('suspended');
    expect(w.revoke).toHaveBeenCalledWith('alt', 'admin_block');
    expect(w.events.some((e) => e.kind === 'linked_banned')).toBe(true);
  });

  it('switched off, nothing is checked', async () => {
    const w = world({ 'fraud.enabled': false });
    w.addUser('fraud', 'client', 'suspended');
    await w.svc.recordSignIn('fraud', { phone: '+15550001111' });
    const v = await w.svc.assertSignInAllowed({ phone: '+15550001111' });
    expect(v.action).toBe('allow');
  });
});

describe('ClientFraudService — complaint score', () => {
  it('fraud complaints of attorneys who dealt with the client block it', async () => {
    const w = world();
    w.addUser('client');
    const attorneys = ['a1', 'a2', 'a3', 'a4'];
    w.setReports(
      attorneys.map((a) => ({ reporter_id: a, reason: 'fraud' })),
      attorneys,
    );
    await w.svc.recompute('client');
    expect(w.profiles.get('client')?.score).toBe(100);
    expect(w.users.get('client')!.status).toBe('suspended');
    expect(w.events.some((e) => e.kind === 'auto_banned')).toBe(true);
  });

  it('complaints from strangers do not count', async () => {
    const w = world();
    w.addUser('client');
    w.setReports(
      ['x1', 'x2', 'x3', 'x4', 'x5'].map((a) => ({
        reporter_id: a,
        reason: 'fraud',
      })),
      [],
    );
    await w.svc.recompute('client');
    expect(w.profiles.get('client')?.status).toBe('ok');
    expect(w.users.get('client')!.status).toBe('active');
  });

  it('without automation the account only waits in the queue', async () => {
    const w = world({ 'fraud.auto': false });
    w.addUser('client');
    const attorneys = ['a1', 'a2', 'a3', 'a4'];
    w.setReports(
      attorneys.map((a) => ({ reporter_id: a, reason: 'fraud' })),
      attorneys,
    );
    await w.svc.recompute('client');
    expect(w.profiles.get('client')?.status).toBe('review');
    expect(w.users.get('client')!.status).toBe('active');
  });

  it('the same case text from many accounts never restricts anyone by itself', async () => {
    const w = world();
    const text =
      'I need a lawyer for a dispute with my landlord about the deposit and repairs.';
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    for (const id of ids) {
      w.addUser(id);
      await w.svc.onCaseCreated(id, text);
    }
    await w.svc.recompute('c0');
    expect(w.profiles.get('c0')?.score).toBe(20);
    expect(w.profiles.get('c0')?.status).toBe('ok');
    expect(ids.every((id) => w.users.get(id)!.status === 'active')).toBe(true);
  });

  it('two complaints restrict, they do not block', async () => {
    const w = world();
    w.addUser('client');
    w.setReports(
      [
        { reporter_id: 'a1', reason: 'fraud' },
        { reporter_id: 'a2', reason: 'fraud' },
        { reporter_id: 'a3', reason: 'spam' },
      ],
      ['a1', 'a2', 'a3'],
    );
    await w.svc.recompute('client');
    expect(w.profiles.get('client')?.score).toBe(58);
    expect(w.profiles.get('client')?.status).toBe('review');
  });
});
