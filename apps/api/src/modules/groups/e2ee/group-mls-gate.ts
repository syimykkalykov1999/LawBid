import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  readSwitchMode,
  type SwitchMode,
} from '../../../common/app-settings/switch-mode';
import type { ChatGroup } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { readApplicationMessage } from '../../chat/chat-e2ee.public';

/** The MLS tables' scope of a group chat (MlsGroup.scope). */
export const GROUP_SCOPE = 'group';

/** Plain kinds that carry the members' own words: refused in an end-to-end
 * encrypted group (design §5: text, attachment, voice, poll go inside MLS). */
export const GROUP_E2EE_PLAIN_REFUSED = new Set([
  'text',
  'attachment',
  'voice',
  'poll',
]);

/** The realtime event that tells a group's devices to re-read its MLS
 * state (a commit, a member who must be removed, a new member to add). */
export const GROUP_E2EE_EVENT = 'e2ee:group';

export function epochConflict(
  epoch: number | null,
  why?: 'lease_held' | 'lease_required',
  holder?: string | null,
): ConflictException {
  return new ConflictException({
    code: ErrorCode.E2EE_EPOCH_CONFLICT,
    message: why
      ? 'Another device is changing the group’s encryption; wait for its commit.'
      : 'The group’s encryption moved on; catch up first.',
    details: { epoch, ...(why ? { why, holderDeviceId: holder ?? null } : {}) },
  });
}

export function membershipInvalid(
  deviceIds: string[],
  why: string,
): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.E2EE_MEMBERSHIP_INVALID,
    message: `The commit cannot change these devices (${why}).`,
    details: { deviceIds, why },
  });
}

export function invalidMls(field: string, why: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `Not a valid MLS object (${why}).`,
    details: { field, why },
  });
}

export function groupE2eeOff(reason: string | null): ConflictException {
  return new ConflictException({
    code: ErrorCode.E2EE_OFF,
    message: 'End-to-end encryption is not on for this group.',
    details: { reason },
  });
}

/**
 * Group E2EE G1 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4.1,
 * §4.5, §5): the checks the group chat's own send path makes, kept apart
 * from GroupE2eeService so GroupsService can call them without a cycle.
 *
 * - An `mls` message goes only into the group's MLS group, in its current
 *   epoch, from a device of the caller that is in it, and only after every
 *   device that must go (its person left / was removed, or it was signed
 *   out) has been removed by a commit (Wire / RFC 9420: nobody writes to a
 *   removed member).
 * - Plain words are refused once the group is encrypted (e2ee_since). The
 *   switch Выкл does not undo that (design §5: an encrypted group cannot be
 *   «decrypted» back); it only stops new groups from being encrypted.
 */
@Injectable()
export class GroupMlsGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  mode(): Promise<SwitchMode> {
    return readSwitchMode(this.settings, 'groups.e2ee_mode');
  }

  /** Devices still in the group's MLS group that must be removed first:
   * their person is no longer a live member, the device was signed out or
   * erased, or it asked to be re-added (rejoin). */
  async removeDevices(
    groupId: string,
    activeUserIds?: string[],
  ): Promise<string[]> {
    const inGroup = await this.prisma.mlsGroupDevice.findMany({
      where: { conversation_id: groupId, scope: GROUP_SCOPE },
      select: { device_id: true, user_id: true, rejoin_at: true },
    });
    if (inGroup.length === 0) return [];
    const members = new Set(
      activeUserIds ??
        (
          await this.prisma.chatGroupMember.findMany({
            where: {
              group_id: groupId,
              left_at: null,
              user_id: { in: [...new Set(inGroup.map((g) => g.user_id))] },
            },
            select: { user_id: true },
          })
        ).map((r) => r.user_id),
    );
    const live = new Set(
      (
        await this.prisma.mlsDevice.findMany({
          where: {
            id: { in: inGroup.map((g) => g.device_id) },
            revoked_at: null,
          },
          select: { id: true },
        })
      ).map((d) => d.id),
    );
    return inGroup
      .filter(
        (g) =>
          !members.has(g.user_id) ||
          !live.has(g.device_id) ||
          g.rejoin_at !== null,
      )
      .map((g) => g.device_id);
  }

  /** Before the group stores an `mls` message. */
  async assertMlsSend(
    user: RequestUser,
    groupId: string,
    input: { deviceId: string; epoch: number; ciphertext: Uint8Array },
  ): Promise<void> {
    if (user.demo === true) throw groupE2eeOff('demo');
    const header = readApplicationMessage(input.ciphertext);
    if (!header) {
      throw invalidMls('ciphertext', 'not an MLS application message');
    }
    const group = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: groupId },
    });
    if (!group || group.scope !== GROUP_SCOPE) {
      throw groupE2eeOff('devices_missing');
    }
    if (Buffer.compare(Buffer.from(group.group_id), header.groupId) !== 0) {
      throw invalidMls('ciphertext', 'the message is for another group');
    }
    if (header.epoch !== input.epoch || group.epoch !== input.epoch) {
      throw epochConflict(group.epoch);
    }
    const device = await this.prisma.mlsDevice.findUnique({
      where: { id: input.deviceId },
    });
    if (!device || device.user_id !== user.sub || device.revoked_at) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Device not found.',
      });
    }
    const mine = await this.prisma.mlsGroupDevice.findUnique({
      where: {
        conversation_id_device_id: {
          conversation_id: groupId,
          device_id: device.id,
        },
      },
    });
    if (!mine || mine.scope !== GROUP_SCOPE) {
      throw membershipInvalid([device.id], 'sender_not_in_group');
    }
    const stale = await this.removeDevices(groupId);
    if (stale.length) {
      throw new ConflictException({
        code: ErrorCode.E2EE_MEMBERSHIP_INVALID,
        message: 'Remove the devices that left the group first.',
        details: { deviceIds: stale, why: 'remove_first' },
      });
    }
  }

  /** A plain message (or poll) in an end-to-end encrypted group. */
  assertPlainAllowed(group: Pick<ChatGroup, 'e2ee_since'>, type: string): void {
    if (!group.e2ee_since || !GROUP_E2EE_PLAIN_REFUSED.has(type)) return;
    throw new ConflictException({
      code: ErrorCode.E2EE_REQUIRED,
      message:
        'This group is end-to-end encrypted. Update the app to write here.',
    });
  }

  /** The group's devices re-read its MLS state (GET /e2ee/groups/:id):
   * after a membership change somebody adds the new person's devices or
   * removes the old ones (design §4.2). Nothing for a group that is not
   * encrypted. */
  async announce(groupId: string, memberIds?: string[]): Promise<void> {
    const group = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: groupId },
      select: { epoch: true, scope: true },
    });
    if (!group || group.scope !== GROUP_SCOPE) return;
    const to =
      memberIds ??
      (
        await this.prisma.chatGroupMember.findMany({
          where: { group_id: groupId, left_at: null },
          select: { user_id: true },
        })
      ).map((r) => r.user_id);
    if (to.length === 0) return;
    this.realtime.toUsers(to, GROUP_E2EE_EVENT, {
      groupId,
      epoch: group.epoch,
    });
  }
}
