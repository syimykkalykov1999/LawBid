import {
  createApplicationMessage,
  createGroup,
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  type CiphersuiteImpl,
} from 'ts-mls';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { MLS_CIPHERSUITE } from '../../chat/chat-e2ee.public';
import { GroupMlsGate } from './group-mls-gate';

/** Group E2EE G1 (GROUP_E2EE_DESIGN_2026-11-26.md §4.2, §4.5, §5): the
 * checks of the group's own send path. */
describe('GroupMlsGate (group E2EE G1)', () => {
  let cs: CiphersuiteImpl;
  beforeAll(async () => {
    cs = await getCiphersuiteImpl(getCiphersuiteFromName(MLS_CIPHERSUITE));
  });

  const GID = '00000000-0000-4000-8000-000000000001';
  const mlsId = Buffer.from(`lawbid:g:${GID}`);

  async function ciphertext(): Promise<Uint8Array> {
    const kp = await generateKeyPackageWithKey(
      { credentialType: 'basic', identity: new TextEncoder().encode('u:d') },
      defaultCapabilities(),
      defaultLifetime,
      [],
      await cs.signature.keygen(),
      cs,
    );
    const state = await createGroup(
      mlsId,
      kp.publicPackage,
      kp.privatePackage,
      [],
      cs,
    );
    const msg = await createApplicationMessage(
      state,
      new TextEncoder().encode('hi'),
      cs,
    );
    return encodeMlsMessage({
      privateMessage: msg.privateMessage,
      wireformat: 'mls_private_message',
      version: 'mls10',
    });
  }

  /** A group whose MLS group holds Ann's phone and Bob's phone. */
  function gate(opts: { bobLeft?: boolean; bobRevoked?: boolean } = {}) {
    const inGroup = [
      { device_id: 'd-ann', user_id: 'ann', rejoin_at: null, scope: 'group' },
      { device_id: 'd-bob', user_id: 'bob', rejoin_at: null, scope: 'group' },
    ];
    const prisma = {
      mlsGroup: {
        findUnique: jest.fn().mockResolvedValue({
          scope: 'group',
          group_id: mlsId,
          epoch: 0,
        }),
      },
      mlsDevice: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'd-ann',
          user_id: 'ann',
          revoked_at: null,
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'd-ann' },
            ...(opts.bobRevoked ? [] : [{ id: 'd-bob' }]),
          ]),
      },
      mlsGroupDevice: {
        findUnique: jest.fn().mockResolvedValue(inGroup[0]),
        findMany: jest.fn().mockResolvedValue(inGroup),
      },
      chatGroupMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { user_id: 'ann' },
            ...(opts.bobLeft ? [] : [{ user_id: 'bob' }]),
          ]),
      },
    };
    const realtime = { toUsers: jest.fn() };
    const settings = { string: jest.fn().mockResolvedValue('on') };
    return {
      gate: new GroupMlsGate(
        prisma as unknown as PrismaService,
        settings as unknown as AppSettingsService,
        realtime as unknown as RealtimePublisher,
      ),
      prisma,
      realtime,
    };
  }
  const ann = { sub: 'ann' } as never;

  it('plain words, files, voice and polls are refused once the group is encrypted; system lines and unencrypted groups are not', () => {
    const { gate: g } = gate();
    const since = { e2ee_since: new Date() };
    for (const type of ['text', 'attachment', 'voice', 'poll']) {
      expect(() => g.assertPlainAllowed(since, type)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'E2EE_REQUIRED' }),
        }),
      );
      expect(() =>
        g.assertPlainAllowed({ e2ee_since: null }, type),
      ).not.toThrow();
    }
    expect(() => g.assertPlainAllowed(since, 'system')).not.toThrow();
  });

  it('an MLS message is stored when every device in the group still belongs there', async () => {
    const { gate: g } = gate();
    await expect(
      g.assertMlsSend(ann, GID, {
        deviceId: 'd-ann',
        epoch: 0,
        ciphertext: await ciphertext(),
      }),
    ).resolves.toBeUndefined();
  });

  it('removal: a removed member’s (or a signed-out) device blocks every send until a commit removes it', async () => {
    for (const opts of [{ bobLeft: true }, { bobRevoked: true }]) {
      const { gate: g } = gate(opts);
      expect(await g.removeDevices(GID)).toEqual(['d-bob']);
      await expect(
        g.assertMlsSend(ann, GID, {
          deviceId: 'd-ann',
          epoch: 0,
          ciphertext: await ciphertext(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'E2EE_MEMBERSHIP_INVALID',
          details: { deviceIds: ['d-bob'], why: 'remove_first' },
        }),
      });
    }
  });

  it('a message of another epoch, or not an MLS application message, is refused', async () => {
    const { gate: g, prisma } = gate();
    prisma.mlsGroup.findUnique.mockResolvedValue({
      scope: 'group',
      group_id: mlsId,
      epoch: 3,
    });
    await expect(
      g.assertMlsSend(ann, GID, {
        deviceId: 'd-ann',
        epoch: 0,
        ciphertext: await ciphertext(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E2EE_EPOCH_CONFLICT' }),
    });
    await expect(
      g.assertMlsSend(ann, GID, {
        deviceId: 'd-ann',
        epoch: 0,
        ciphertext: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });

  it('a group that is not encrypted (or a chat’s MLS group) takes no MLS message and announces nothing', async () => {
    const { gate: g, prisma, realtime } = gate();
    prisma.mlsGroup.findUnique.mockResolvedValue({
      scope: 'conversation',
      group_id: mlsId,
      epoch: 0,
    });
    await expect(
      g.assertMlsSend(ann, GID, {
        deviceId: 'd-ann',
        epoch: 0,
        ciphertext: await ciphertext(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E2EE_OFF' }),
    });
    await g.announce(GID, ['ann']);
    expect(realtime.toUsers).not.toHaveBeenCalled();
  });

  it('a membership change tells the live members to re-read the MLS state', async () => {
    const { gate: g, realtime } = gate();
    await g.announce(GID, ['ann', 'bob']);
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['ann', 'bob'],
      'e2ee:group',
      {
        groupId: GID,
        epoch: 0,
      },
    );
  });
});
