/* eslint-disable @typescript-eslint/require-await -- fakes with sync bodies */
import { NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroupExternal,
  type CiphersuiteImpl,
} from 'ts-mls';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import type { FilesService } from '../../files/files.service';
import { MLS_CIPHERSUITE } from '../../chat/chat-e2ee.public';
import type { GroupsService } from '../groups.service';
import { GroupE2eeService, groupMlsId, leaseKey } from './group-e2ee.service';
import type { GroupMlsGate } from './group-mls-gate';

/** A Redis with what the lease uses: SET NX PX, GET, PTTL and the two
 * compare-and-extend / compare-and-delete scripts. */
function fakeRedis() {
  const kv = new Map<string, { v: string; until: number }>();
  const live = (k: string) => {
    const e = kv.get(k);
    if (e && e.until < Date.now()) kv.delete(k);
    return kv.get(k);
  };
  return {
    status: 'ready',
    set: jest.fn(async (k: string, v: string, _px: string, ms: number) => {
      if (live(k)) return null;
      kv.set(k, { v, until: Date.now() + ms });
      return 'OK';
    }),
    get: jest.fn(async (k: string) => live(k)?.v ?? null),
    pttl: jest.fn(async (k: string) => {
      const e = live(k);
      return e ? e.until - Date.now() : -2;
    }),
    eval: jest.fn(
      async (script: string, _n: number, k: string, v: string, ms?: string) => {
        const e = live(k);
        if (!e || e.v !== v) return 0;
        if (script.includes('PEXPIRE')) e.until = Date.now() + Number(ms);
        else kv.delete(k);
        return 1;
      },
    ),
  };
}

/** Group E2EE G1 (GROUP_E2EE_DESIGN_2026-11-26.md §4.2–4.4, §5). */
describe('GroupE2eeService (group E2EE G1)', () => {
  let cs: CiphersuiteImpl;
  beforeAll(async () => {
    cs = await getCiphersuiteImpl(getCiphersuiteFromName(MLS_CIPHERSUITE));
  });

  const GID = '00000000-0000-4000-8000-0000000000aa';
  const settingsOf = (over: Record<string, unknown> = {}) => {
    const v: Record<string, unknown> = {
      'groups.e2ee_lease_ms': 15000,
      'groups.e2ee_update_days': 7,
      'groups.e2ee_history_max': 100,
      'groups.e2ee_group_info_inline_kb': 256,
      'groups.e2ee_public': false,
      'chat.e2ee_max_group_members': 1024,
      ...over,
    };
    return {
      number: jest.fn(async (k: string) => Number(v[k] ?? 0)),
      boolean: jest.fn(async (k: string) => v[k] === true),
    };
  };

  function make(
    opts: {
      mode?: 'off' | 'on' | 'auto';
      member?: boolean;
      hasGroup?: boolean;
      device?: { id: string; user_id: string; signature_key: Buffer };
    } = {},
  ) {
    const redis = fakeRedis();
    const groupRow = {
      conversation_id: GID,
      scope: 'group',
      group_id: groupMlsId(GID),
      epoch: 0,
      group_info: null,
      group_info_epoch: 0,
      group_info_file_id: null,
      created_by_device: 'd-ann',
    };
    const prisma = {
      mlsGroup: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.hasGroup === false ? null : groupRow),
      },
      mlsDevice: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          opts.device && opts.device.id === where.id
            ? { ...opts.device, revoked_at: null }
            : { id: where.id, user_id: 'ann', revoked_at: null },
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      mlsGroupDevice: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ n: 2n }]),
    };
    const groups = {
      assertEnabled: jest.fn(),
      requireMember: jest.fn(async () => {
        if (opts.member === false) {
          throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });
        }
        return {
          group: {
            group_type: 'private',
            e2ee_since: null,
            history_sharing: true,
          },
        };
      }),
      activeMemberIds: jest.fn().mockResolvedValue(['ann', 'bob']),
      e2eeStarted: jest.fn(),
    };
    const gate = {
      mode: jest.fn().mockResolvedValue(opts.mode ?? 'on'),
      removeDevices: jest.fn().mockResolvedValue([]),
    };
    const svc = new GroupE2eeService(
      prisma as unknown as PrismaService,
      settingsOf() as unknown as AppSettingsService,
      { toUsers: jest.fn() } as unknown as RealtimePublisher,
      groups as unknown as GroupsService,
      gate as unknown as GroupMlsGate,
      {} as FilesService,
      redis as unknown as Redis,
    );
    return { svc, prisma, groups, redis };
  }
  const user = (sub: string) => ({ sub }) as never;

  it('Выкл: a group without an MLS group stays off and none can be created', async () => {
    const { svc } = make({ mode: 'off', hasGroup: false });
    const st = await svc.state(user('ann'), GID);
    expect(st).toMatchObject({ state: 'off', reason: 'mode_off', epoch: null });
    await expect(
      svc.createGroup(user('ann'), GID, {
        deviceId: 'd-ann',
        groupId: groupMlsId(GID).toString('base64'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E2EE_OFF' }),
    });
  });

  it('Выкл after encryption: an encrypted group stays on', async () => {
    const { svc } = make({ mode: 'off' });
    expect((await svc.state(user('ann'), GID)).state).toBe('on');
  });

  it('lease: one device at a time; the holder extends it; another device is told who holds it', async () => {
    const { svc } = make();
    const a = await svc.lease(user('ann'), GID, 'd-ann');
    expect(a).toMatchObject({ granted: true, holderDeviceId: 'd-ann' });
    const b = await svc.lease(user('ann'), GID, 'd-ann-pad');
    expect(b).toMatchObject({ granted: false, holderDeviceId: 'd-ann' });
    expect(b.ttlMs).toBeGreaterThan(0);
    const again = await svc.lease(user('ann'), GID, 'd-ann');
    expect(again.granted).toBe(true);
    // Without the lease no KeyPackage is handed out.
    await expect(
      svc.claimKeyPackages(user('ann'), GID, 'd-ann-pad', ['d-bob']),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'E2EE_EPOCH_CONFLICT',
        details: expect.objectContaining({
          why: 'lease_held',
          holderDeviceId: 'd-ann',
        }),
      }),
    });
  });

  it('lease 0 ms (admin): every device may commit, the epoch order alone decides', async () => {
    const { svc, redis } = make();
    (svc as unknown as { settings: unknown }).settings = settingsOf({
      'groups.e2ee_lease_ms': 0,
    });
    expect((await svc.lease(user('ann'), GID, 'd-x')).granted).toBe(true);
    expect((await svc.lease(user('ann'), GID, 'd-y')).granted).toBe(true);
    expect(redis.set).not.toHaveBeenCalled();
  });

  async function externalCommit(
    identity: string,
    sign: {
      signKey: Uint8Array;
      publicKey: Uint8Array;
    },
  ) {
    const owner = await generateKeyPackageWithKey(
      {
        credentialType: 'basic',
        identity: new TextEncoder().encode('ann:d-ann'),
      },
      defaultCapabilities(),
      defaultLifetime,
      [],
      await cs.signature.keygen(),
      cs,
    );
    const state = await createGroup(
      groupMlsId(GID),
      owner.publicPackage,
      owner.privatePackage,
      [],
      cs,
    );
    const info = await createGroupInfoWithExternalPubAndRatchetTree(
      state,
      [],
      cs,
    );
    const joiner = await generateKeyPackageWithKey(
      { credentialType: 'basic', identity: new TextEncoder().encode(identity) },
      defaultCapabilities(),
      defaultLifetime,
      [],
      sign,
      cs,
    );
    const out = await joinGroupExternal(
      info,
      joiner.publicPackage,
      joiner.privatePackage,
      false,
      cs,
    );
    return Buffer.from(
      encodeMlsMessage({
        publicMessage: out.publicMessage,
        wireformat: 'mls_public_message',
        version: 'mls10',
      }),
    ).toString('base64');
  }

  it('external commit: only a live member, only for the caller’s own device', async () => {
    const sign = await cs.signature.keygen();
    const device = {
      id: 'd-carol',
      user_id: 'carol',
      signature_key: Buffer.from(sign.publicKey),
    };
    const commit = await externalCommit('carol:d-carol', sign);
    // Not a member: the group does not exist for the caller.
    const out = make({ member: false, device });
    await expect(
      out.svc.externalCommit(user('carol'), GID, {
        deviceId: 'd-carol',
        epoch: 0,
        commit,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // A member whose commit names another device.
    const other = await externalCommit('carol:d-other', sign);
    const m = make({ device });
    await expect(
      m.svc.externalCommit(user('carol'), GID, {
        deviceId: 'd-carol',
        epoch: 0,
        commit: other,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'E2EE_MEMBERSHIP_INVALID',
        details: expect.objectContaining({ why: 'not_this_device' }),
      }),
    });
    // A member's commit while another device holds the lease waits.
    await m.redis.set(leaseKey(GID), 'd-ann', 'PX', 15000);
    await expect(
      m.svc.externalCommit(user('carol'), GID, {
        deviceId: 'd-carol',
        epoch: 0,
        commit,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E2EE_EPOCH_CONFLICT' }),
    });
  });

  it('the MLS id of a group is lawbid:g:<id> (a chat’s or another group’s is refused)', async () => {
    const { svc } = make({ hasGroup: false });
    await expect(
      svc.createGroup(user('ann'), GID, {
        deviceId: 'd-ann',
        groupId: Buffer.from(`lawbid:${GID}`).toString('base64'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });
});
