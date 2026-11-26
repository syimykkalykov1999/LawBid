import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Conversation, MlsDevice } from '../../../generated/prisma/client';
import { Prisma } from '../../../generated/prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  readSwitchMode,
  type SwitchMode,
} from '../../../common/app-settings/switch-mode';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import {
  type ClaimedKeyPackageDto,
  type ConversationE2eeDto,
  type CreateMlsGroupDto,
  type E2eeOffReason,
  type E2eeState,
  type KeyPackageCountDto,
  type MlsCommitDto,
  type MlsCommitRowDto,
  type MlsDeviceDto,
  type MlsWelcomeDto,
  type RegisterMlsDeviceDto,
  type UploadKeyPackagesDto,
} from './e2ee.dto';
import {
  checkKeyPackage,
  deviceIdentity,
  isWelcome,
  readApplicationMessage,
  readCommit,
} from './mls-codec';

/** Plain message kinds that carry the person's own words: refused in an
 * end-to-end encrypted chat (the app must send them as `mls`). Files and
 * voice move into MLS with encrypted attachments (plan §5, PR 4). */
export const E2EE_PLAIN_REFUSED = new Set(['text', 'place']);

const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
const bytes = (s: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(s, 'base64'));

function conversationNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CONVERSATION_NOT_FOUND,
    message: 'Conversation not found.',
  });
}

function deviceNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Device not found.',
  });
}

function epochConflict(epoch: number | null): ConflictException {
  return new ConflictException({
    code: ErrorCode.E2EE_EPOCH_CONFLICT,
    message: 'The chat’s encryption moved on; catch up first.',
    details: { epoch },
  });
}

function membershipInvalid(deviceIds: string[], why: string) {
  return new BadRequestException({
    code: ErrorCode.E2EE_MEMBERSHIP_INVALID,
    message: `The commit cannot change these devices (${why}).`,
    details: { deviceIds, why },
  });
}

function invalidMls(field: string, why: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `Not a valid MLS object (${why}).`,
    details: { field, why },
  });
}

type Eligibility = {
  mode: SwitchMode;
  state: E2eeState;
  reason: E2eeOffReason | null;
};

/**
 * Item 25 (owner 25.11; docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §3):
 * the MLS Delivery Service and Authentication Service directory (RFC 9750).
 *
 * - Devices: one MLS client per device, public signature key only; a
 *   KeyPackage is accepted only when its basic credential names exactly
 *   that device ("<userId>:<deviceId>"), with that key, and its signature
 *   verifies (Wire's backend checks the same).
 * - KeyPackages: one-time ones are handed out once and deleted in the same
 *   statement (FOR UPDATE SKIP LOCKED: two claims never get the same one);
 *   the last-resort one when none is left.
 * - Groups: one per conversation; commits are ordered by a compare-and-set
 *   on the epoch (strongly consistent DS, RFC 9750 §5.2), a stale commit
 *   gets 409 E2EE_EPOCH_CONFLICT and the client catches up first. Adds and
 *   removes are checked against the chat's participants; the adds of a
 *   PublicMessage commit are read and must match what the sender declared.
 * - Messages: `mls` messages go through the normal chat send (order, ticks,
 *   push) via [assertMlsSend]; the server checks the public header (group
 *   id, epoch, application content type) and stores only the ciphertext.
 */
@Injectable()
export class E2eeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  mode(): Promise<SwitchMode> {
    return readSwitchMode(this.settings, 'chat.e2ee_mode');
  }

  // ---------------------------------------------------------------- devices

  async registerDevice(
    user: RequestUser,
    dto: RegisterMlsDeviceDto,
  ): Promise<MlsDeviceDto> {
    const key = Buffer.from(dto.signatureKey, 'base64');
    if (key.length !== 32) {
      throw invalidMls('signatureKey', 'an Ed25519 public key is 32 bytes');
    }
    const existing = await this.prisma.mlsDevice.findUnique({
      where: {
        user_id_signature_key: { user_id: user.sub, signature_key: key },
      },
    });
    if (existing && !existing.revoked_at) {
      await this.prisma.mlsDevice.update({
        where: { id: existing.id },
        data: { last_seen_at: new Date(), platform: dto.platform },
      });
      return this.deviceDto(existing);
    }
    if (existing) {
      // A signed-out key never comes back (its groups removed it).
      throw new ConflictException({
        code: ErrorCode.E2EE_MEMBERSHIP_INVALID,
        message: 'This device key was signed out; make a new one.',
        details: { deviceIds: [existing.id], why: 'revoked' },
      });
    }
    const max = await this.settings.number('chat.e2ee_max_devices');
    const created = await this.prisma.global().$transaction(async (tx) => {
      // One registration at a time per person, so two new devices at once
      // cannot both pass the cap.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mls-dev:${user.sub}`}))::TEXT AS locked`;
      if (max > 0) {
        const active = await tx.mlsDevice.count({
          where: { user_id: user.sub, revoked_at: null },
        });
        if (active >= max) {
          throw new ConflictException({
            code: ErrorCode.E2EE_DEVICE_LIMIT,
            message: `At most ${max} devices can read encrypted chats.`,
            details: { max },
          });
        }
      }
      return tx.mlsDevice.create({
        data: { user_id: user.sub, signature_key: key, platform: dto.platform },
      });
    });
    return this.deviceDto(created);
  }

  async myDevices(user: RequestUser): Promise<MlsDeviceDto[]> {
    const rows = await this.prisma.mlsDevice.findMany({
      where: { user_id: user.sub, revoked_at: null },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((d) => this.deviceDto(d));
  }

  /** Signs a device out of encrypted chats: its KeyPackages go, and every
   * group it sits in must remove it before the next MLS message. */
  async revokeDevice(user: RequestUser, id: string): Promise<void> {
    const d = await this.ownDevice(user, id);
    await this.prisma.global().$transaction([
      this.prisma.mlsKeyPackage.deleteMany({ where: { device_id: d.id } }),
      this.prisma.mlsWelcome.deleteMany({ where: { device_id: d.id } }),
      this.prisma.mlsDevice.update({
        where: { id: d.id },
        data: { revoked_at: new Date() },
      }),
    ]);
    const groups = await this.prisma.mlsGroupDevice.findMany({
      where: { device_id: d.id },
      select: { conversation_id: true },
    });
    for (const g of groups) await this.announce(g.conversation_id);
  }

  async uploadKeyPackages(
    user: RequestUser,
    deviceId: string,
    dto: UploadKeyPackagesDto,
  ): Promise<KeyPackageCountDto> {
    const d = await this.ownDevice(user, deviceId);
    const target = await this.settings.number('chat.e2ee_key_packages_target');
    if (dto.keyPackages.length > Math.max(target, 1)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `At most ${target} KeyPackages per upload.`,
        details: { field: 'keyPackages', max: target },
      });
    }
    const expect = {
      identity: deviceIdentity(user.sub, d.id),
      signatureKey: new Uint8Array(d.signature_key),
    };
    const all = [
      ...dto.keyPackages.map((k) => ({ k, last: false })),
      ...(dto.lastResort ? [{ k: dto.lastResort, last: true }] : []),
    ];
    for (const [i, { k }] of all.entries()) {
      const check = await checkKeyPackage(bytes(k), expect);
      if (!check.ok) invalidKeyPackage(i, check.why);
    }
    await this.prisma.global().$transaction(async (tx) => {
      if (dto.lastResort) {
        await tx.mlsKeyPackage.deleteMany({
          where: { device_id: d.id, last_resort: true },
        });
      }
      if (all.length) {
        await tx.mlsKeyPackage.createMany({
          data: all.map(({ k, last }) => ({
            device_id: d.id,
            data: Buffer.from(k, 'base64'),
            last_resort: last,
          })),
        });
      }
      // Never more than the target one-time packages per device: the
      // oldest go first.
      if (target > 0) {
        await tx.$executeRaw`
          DELETE FROM mls_key_packages WHERE id IN (
            SELECT id FROM mls_key_packages
            WHERE device_id = ${d.id}::UUID AND NOT last_resort
            ORDER BY created_at DESC, id DESC OFFSET ${target}
          )`;
      }
      await tx.mlsDevice.update({
        where: { id: d.id },
        data: { last_seen_at: new Date() },
      });
    });
    return this.keyPackageCount(user, deviceId);
  }

  async keyPackageCount(
    user: RequestUser,
    deviceId: string,
  ): Promise<KeyPackageCountDto> {
    const d = await this.ownDevice(user, deviceId);
    const [oneTime, last, target] = await Promise.all([
      this.prisma.mlsKeyPackage.count({
        where: { device_id: d.id, last_resort: false },
      }),
      this.prisma.mlsKeyPackage.count({
        where: { device_id: d.id, last_resort: true },
      }),
      this.settings.number('chat.e2ee_key_packages_target'),
    ]);
    return { oneTime, lastResort: last > 0, target };
  }

  // ------------------------------------------------------------ conversation

  /** The chat (404 unless the caller takes part) and its participants. */
  private async member(
    user: RequestUser,
    id: string,
  ): Promise<{ conv: Conversation; users: string[] }> {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv) throw conversationNotFound();
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversation_id: id },
      select: { user_id: true },
    });
    const users = [
      ...new Set([
        conv.client_id,
        conv.attorney_id,
        ...rows.map((r) => r.user_id),
      ]),
    ];
    if (!users.includes(user.sub)) throw conversationNotFound();
    return { conv, users };
  }

  /** Whether (and why not) this chat is / may be end-to-end encrypted. */
  private async eligibility(
    user: RequestUser,
    conv: Conversation,
    users: string[],
    hasGroup: boolean,
  ): Promise<Eligibility> {
    const mode = await this.mode();
    const off = (reason: E2eeOffReason): Eligibility => ({
      mode,
      state: 'off',
      reason,
    });
    if (mode === 'off') return off('mode_off');
    // The demo world: bots write from the server.
    if (user.demo === true) return off('demo');
    if (
      !conv.contacts_unlocked &&
      (await this.settings.boolean('chat.e2ee_after_unlock'))
    ) {
      return off('locked');
    }
    const max = await this.settings.number('chat.e2ee_max_group_members');
    if (max > 0 && users.length > max) return off('too_many_members');
    if (hasGroup) return { mode, state: 'on', reason: null };
    if (mode === 'auto') {
      // Авто: every member has a device that can be added (keys left).
      const ready = await this.prisma.$queryRaw<{ user_id: string }[]>`
        SELECT DISTINCT d.user_id::TEXT AS user_id
        FROM mls_devices d
        WHERE d.user_id = ANY(${users}::UUID[]) AND d.revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM mls_key_packages k WHERE k.device_id = d.id)`;
      if (ready.length < users.length) return off('devices_missing');
    }
    return { mode, state: 'pending', reason: null };
  }

  async conversationState(
    user: RequestUser,
    id: string,
  ): Promise<ConversationE2eeDto> {
    const { conv, users } = await this.member(user, id);
    const group = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: id },
    });
    const el = await this.eligibility(user, conv, users, group !== null);
    const [devices, inGroup] = await Promise.all([
      this.prisma.mlsDevice.findMany({
        where: { user_id: { in: users }, revoked_at: null },
        orderBy: [{ user_id: 'asc' }, { created_at: 'asc' }],
      }),
      group
        ? this.prisma.mlsGroupDevice.findMany({
            where: { conversation_id: id },
          })
        : Promise.resolve([]),
    ]);
    const members = new Set(inGroup.map((g) => g.device_id));
    const active = new Set(devices.map((d) => d.id));
    return {
      state: el.state,
      reason: el.reason,
      groupId: group ? b64(group.group_id) : null,
      epoch: group?.epoch ?? null,
      since: conv.e2ee_since,
      devices: devices.map((d) => ({
        deviceId: d.id,
        userId: d.user_id,
        signatureKey: b64(d.signature_key),
        inGroup: members.has(d.id),
      })),
      removeDevices: inGroup
        .filter((g) => !active.has(g.device_id) || !users.includes(g.user_id))
        .map((g) => g.device_id),
    };
  }

  /** The first device of a member creates the chat's MLS group (epoch 0,
   * only itself in it); it then adds the others with a commit. */
  async createGroup(
    user: RequestUser,
    id: string,
    dto: CreateMlsGroupDto,
  ): Promise<ConversationE2eeDto> {
    const { conv, users } = await this.member(user, id);
    const device = await this.ownDevice(user, dto.deviceId);
    const groupId = Buffer.from(dto.groupId, 'base64');
    if (groupId.length === 0 || groupId.length > 64) {
      throw invalidMls('groupId', 'a group id is 1–64 bytes');
    }
    const existing = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: id },
    });
    if (existing) {
      // The same request again: same answer.
      if (
        existing.created_by_device === device.id &&
        Buffer.compare(existing.group_id, groupId) === 0
      ) {
        return this.conversationState(user, id);
      }
      throw epochConflict(existing.epoch);
    }
    const el = await this.eligibility(user, conv, users, false);
    if (el.state !== 'pending') throw e2eeOff(el.reason);
    try {
      await this.prisma.global().$transaction([
        this.prisma.mlsGroup.create({
          data: {
            conversation_id: id,
            group_id: groupId,
            epoch: 0,
            created_by_device: device.id,
          },
        }),
        this.prisma.mlsGroupDevice.create({
          data: {
            conversation_id: id,
            device_id: device.id,
            user_id: user.sub,
            joined_epoch: 0,
          },
        }),
      ]);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Another device of the chat won the race.
        const won = await this.prisma.mlsGroup.findUnique({
          where: { conversation_id: id },
        });
        throw epochConflict(won?.epoch ?? 0);
      }
      throw e;
    }
    await this.prisma.conversation.update({
      where: { id },
      data: { e2ee_since: new Date() },
    });
    this.realtime.toUsers(users, 'e2ee:commit', {
      conversationId: id,
      epoch: 0,
    });
    return this.conversationState(user, id);
  }

  /** One KeyPackage for each asked device of the chat's members that is not
   * in the group yet (to add them with the next commit). */
  async claimKeyPackages(
    user: RequestUser,
    id: string,
    deviceIds: string[],
  ): Promise<ClaimedKeyPackageDto[]> {
    const { users } = await this.member(user, id);
    const devices = await this.prisma.mlsDevice.findMany({
      where: { id: { in: deviceIds }, revoked_at: null },
    });
    const foreign = deviceIds.filter(
      (d) => !devices.some((x) => x.id === d && users.includes(x.user_id)),
    );
    if (foreign.length) throw membershipInvalid(foreign, 'not_a_member');
    // RFC 9750 §6.3 (KeyPackage exhaustion): a KeyPackage is taken only to
    // ADD a device; a device already in this chat's group has nothing to be
    // added for, so its one-time keys cannot be drained from here.
    const already = await this.prisma.mlsGroupDevice.findMany({
      where: { conversation_id: id, device_id: { in: deviceIds } },
      select: { device_id: true },
    });
    if (already.length) {
      throw membershipInvalid(
        already.map((a) => a.device_id),
        'already_in_group',
      );
    }
    const out: ClaimedKeyPackageDto[] = [];
    for (const d of devices) {
      const [taken] = await this.prisma.$queryRaw<{ data: Uint8Array }[]>`
        DELETE FROM mls_key_packages WHERE id = (
          SELECT id FROM mls_key_packages
          WHERE device_id = ${d.id}::UUID AND NOT last_resort
          ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
        ) RETURNING data`;
      const kp =
        taken ??
        (await this.prisma.mlsKeyPackage.findFirst({
          where: { device_id: d.id, last_resort: true },
          select: { data: true },
        }));
      out.push({
        deviceId: d.id,
        userId: d.user_id,
        keyPackage: kp ? b64(kp.data) : null,
      });
    }
    return out;
  }

  async commit(
    user: RequestUser,
    id: string,
    dto: MlsCommitDto,
  ): Promise<{ epoch: number }> {
    const { users } = await this.member(user, id);
    const sender = await this.ownDevice(user, dto.deviceId);
    if ((await this.mode()) === 'off') throw e2eeOff('mode_off');
    const commitBytes = bytes(dto.commit);
    const parsed = readCommit(commitBytes);
    if (!parsed) throw invalidMls('commit', 'not a commit');
    if (parsed.epoch !== dto.epoch) {
      throw invalidMls('commit', 'the commit is for another epoch');
    }
    const added = [...new Set(dto.addedDevices)];
    const removed = [...new Set(dto.removedDevices)];
    if (added.some((d) => removed.includes(d))) {
      throw membershipInvalid(
        added.filter((d) => removed.includes(d)),
        'added_and_removed',
      );
    }
    if (added.length && (!dto.welcome || !isWelcome(bytes(dto.welcome)))) {
      throw invalidMls('welcome', 'added devices need a Welcome');
    }
    const addedRows = added.length
      ? await this.prisma.mlsDevice.findMany({
          where: { id: { in: added }, revoked_at: null },
        })
      : [];
    const notAddable = added.filter(
      (d) => !addedRows.some((r) => r.id === d && users.includes(r.user_id)),
    );
    if (notAddable.length) throw membershipInvalid(notAddable, 'not_a_member');
    if (parsed.addedIdentities) {
      const declared = addedRows
        .map((r) => deviceIdentity(r.user_id, r.id))
        .sort();
      const inCommit = [...parsed.addedIdentities].sort();
      if (JSON.stringify(declared) !== JSON.stringify(inCommit)) {
        throw membershipInvalid(added, 'adds_do_not_match_the_commit');
      }
    }
    const max = await this.settings.number('chat.e2ee_max_group_members');
    const result = await this.prisma.global().$transaction(async (tx) => {
      // The compare-and-set: one commit per epoch, the group never forks.
      const [g] = await tx.$queryRaw<{ epoch: number; group_id: Uint8Array }[]>`
        SELECT epoch, group_id FROM mls_groups
        WHERE conversation_id = ${id}::UUID FOR UPDATE`;
      if (!g) throw e2eeOff('mode_off');
      if (Buffer.compare(Buffer.from(g.group_id), parsed.groupId) !== 0) {
        throw invalidMls('commit', 'the commit is for another group');
      }
      if (g.epoch !== dto.epoch) throw epochConflict(g.epoch);
      const current = await tx.mlsGroupDevice.findMany({
        where: { conversation_id: id },
      });
      const inGroup = new Set(current.map((c) => c.device_id));
      if (!inGroup.has(sender.id)) {
        throw membershipInvalid([sender.id], 'sender_not_in_group');
      }
      const already = added.filter((d) => inGroup.has(d));
      if (already.length) throw membershipInvalid(already, 'already_in_group');
      const absent = removed.filter((d) => !inGroup.has(d));
      if (absent.length) throw membershipInvalid(absent, 'not_in_group');
      if (max > 0) {
        const after = new Set(
          current
            .filter((c) => !removed.includes(c.device_id))
            .map((c) => c.user_id),
        );
        for (const r of addedRows) after.add(r.user_id);
        if (after.size > max) {
          throw membershipInvalid(added, 'too_many_members');
        }
      }
      const next = g.epoch + 1;
      await tx.mlsCommit.create({
        data: {
          conversation_id: id,
          epoch: g.epoch,
          sender_device_id: sender.id,
          data: Buffer.from(commitBytes),
          added_devices: added,
          removed_devices: removed,
        },
      });
      await tx.mlsGroup.update({
        where: { conversation_id: id },
        data: { epoch: next },
      });
      if (removed.length) {
        await tx.mlsGroupDevice.deleteMany({
          where: { conversation_id: id, device_id: { in: removed } },
        });
      }
      if (addedRows.length) {
        await tx.mlsGroupDevice.createMany({
          data: addedRows.map((r) => ({
            conversation_id: id,
            device_id: r.id,
            user_id: r.user_id,
            joined_epoch: next,
          })),
        });
        await tx.mlsWelcome.createMany({
          data: addedRows.map((r) => ({
            conversation_id: id,
            device_id: r.id,
            epoch: next,
            data: Buffer.from(dto.welcome!, 'base64'),
          })),
        });
      }
      return { epoch: next };
    });
    this.realtime.toUsers(users, 'e2ee:commit', {
      conversationId: id,
      epoch: result.epoch,
    });
    const welcomed = [...new Set(addedRows.map((r) => r.user_id))];
    if (welcomed.length) {
      this.realtime.toUsers(welcomed, 'e2ee:welcome', { conversationId: id });
    }
    return result;
  }

  async commits(
    user: RequestUser,
    id: string,
    after = 0,
  ): Promise<MlsCommitRowDto[]> {
    await this.member(user, id);
    const rows = await this.prisma.mlsCommit.findMany({
      where: { conversation_id: id, epoch: { gte: after } },
      orderBy: { epoch: 'asc' },
      take: 200,
    });
    return rows.map((r) => ({
      epoch: r.epoch,
      senderDeviceId: r.sender_device_id,
      commit: b64(r.data),
      addedDevices: r.added_devices,
      removedDevices: r.removed_devices,
      createdAt: r.created_at,
    }));
  }

  /**
   * Nightly (cron `chat.e2ee-welcome-sweep`): a Welcome a device never took
   * within `chat.e2ee_welcome_keep_days` is deleted (0 = keep). It is useless
   * after that anyway: the group has moved on and the device joins again from
   * a fresh Welcome. Batches of 1 000 by the created_at index.
   */
  async sweepWelcomes(): Promise<number> {
    const keepDays = await this.settings.number('chat.e2ee_welcome_keep_days');
    if (keepDays <= 0) return 0;
    const before = new Date(Date.now() - keepDays * 86_400_000);
    let total = 0;
    for (;;) {
      const n = await this.prisma.$executeRaw`
        DELETE FROM mls_welcomes WHERE id IN (
          SELECT id FROM mls_welcomes WHERE created_at < ${before}
          ORDER BY created_at LIMIT 1000)`;
      total += n;
      if (n < 1000) return total;
    }
  }

  async welcomes(
    user: RequestUser,
    deviceId: string,
  ): Promise<MlsWelcomeDto[]> {
    const d = await this.ownDevice(user, deviceId);
    const keepDays = await this.settings.number('chat.e2ee_welcome_keep_days');
    const since =
      keepDays > 0 ? new Date(Date.now() - keepDays * 86_400_000) : undefined;
    const rows = await this.prisma.mlsWelcome.findMany({
      where: {
        device_id: d.id,
        ...(since ? { created_at: { gte: since } } : {}),
      },
      orderBy: { created_at: 'asc' },
      take: 200,
    });
    return rows.map((w) => ({
      id: w.id,
      conversationId: w.conversation_id,
      epoch: w.epoch,
      welcome: b64(w.data),
    }));
  }

  async ackWelcome(user: RequestUser, welcomeId: string): Promise<void> {
    const w = await this.prisma.mlsWelcome.findUnique({
      where: { id: welcomeId },
    });
    if (!w) return;
    await this.ownDevice(user, w.device_id);
    await this.prisma.mlsWelcome.delete({ where: { id: w.id } });
  }

  // ------------------------------------------------ used by the chat's send

  /**
   * Before a chat stores an `mls` message: encryption is on for this chat,
   * the sending device is the caller's and in the group, the ciphertext is
   * an application PrivateMessage of THIS group in its CURRENT epoch, and no
   * device that must be removed is still in the group.
   */
  async assertMlsSend(
    user: RequestUser,
    conv: Pick<Conversation, 'id'>,
    input: { deviceId: string; epoch: number; ciphertext: Uint8Array },
  ): Promise<void> {
    if ((await this.mode()) === 'off') throw e2eeOff('mode_off');
    if (user.demo === true) throw e2eeOff('demo');
    const header = readApplicationMessage(input.ciphertext);
    if (!header) {
      throw invalidMls('ciphertext', 'not an MLS application message');
    }
    const group = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: conv.id },
    });
    if (!group) throw e2eeOff('devices_missing');
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
      throw deviceNotFound();
    }
    const inGroup = await this.prisma.mlsGroupDevice.findMany({
      where: { conversation_id: conv.id },
    });
    if (!inGroup.some((g) => g.device_id === device.id)) {
      throw membershipInvalid([device.id], 'sender_not_in_group');
    }
    const users = await this.prisma.conversationParticipant.findMany({
      where: { conversation_id: conv.id },
      select: { user_id: true },
    });
    const c = await this.prisma.conversation.findUnique({
      where: { id: conv.id },
      select: { client_id: true, attorney_id: true },
    });
    const members = new Set([
      ...users.map((u) => u.user_id),
      ...(c ? [c.client_id, c.attorney_id] : []),
    ]);
    // A device that was signed out (revoked_at) or erased with its account
    // (row gone, its group place kept: personal-data-registry) must be
    // removed by a commit first.
    const known = await this.prisma.mlsDevice.findMany({
      where: { id: { in: inGroup.map((g) => g.device_id) } },
      select: { id: true, revoked_at: true },
    });
    const live = new Set(known.filter((k) => !k.revoked_at).map((k) => k.id));
    const stale = [
      ...inGroup.filter((g) => !members.has(g.user_id)).map((g) => g.device_id),
      ...inGroup.filter((g) => !live.has(g.device_id)).map((g) => g.device_id),
    ];
    if (stale.length) {
      // Wire / MLS: a person who left (or a signed-out phone) must be out of
      // the group before anyone writes again.
      throw new ConflictException({
        code: ErrorCode.E2EE_MEMBERSHIP_INVALID,
        message: 'Remove the devices that left the chat first.',
        details: { deviceIds: [...new Set(stale)], why: 'remove_first' },
      });
    }
  }

  /** A plain message in a chat that is end-to-end encrypted (and the
   * switch is not Выкл) is refused for the kinds that carry words. */
  async assertPlainAllowed(
    conv: Pick<Conversation, 'e2ee_since'>,
    type: string,
  ): Promise<void> {
    if (!conv.e2ee_since || !E2EE_PLAIN_REFUSED.has(type)) return;
    if ((await this.mode()) === 'off') return;
    throw new ConflictException({
      code: ErrorCode.E2EE_REQUIRED,
      message:
        'This chat is end-to-end encrypted. Update the app to write here.',
    });
  }

  // ---------------------------------------------------------------- helpers

  private async ownDevice(user: RequestUser, id: string): Promise<MlsDevice> {
    const d = await this.prisma.mlsDevice.findUnique({ where: { id } });
    if (!d || d.user_id !== user.sub || d.revoked_at) throw deviceNotFound();
    return d;
  }

  private deviceDto(d: MlsDevice): MlsDeviceDto {
    return {
      id: d.id,
      userId: d.user_id,
      signatureKey: b64(d.signature_key),
      platform: d.platform,
      identity: deviceIdentity(d.user_id, d.id),
      createdAt: d.created_at,
    };
  }

  /** The chat's members re-read the state (a device left / must go). */
  private async announce(conversationId: string): Promise<void> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId },
      select: { user_id: true },
    });
    const group = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: conversationId },
      select: { epoch: true },
    });
    // A case chat's client and attorney are members without a participant
    // row (as in assertMlsSend), so they are told too.
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { client_id: true, attorney_id: true },
    });
    const to = new Set([
      ...rows.map((r) => r.user_id),
      ...(c ? [c.client_id, c.attorney_id] : []),
    ]);
    this.realtime.toUsers(
      [...to].filter((u): u is string => typeof u === 'string' && u.length > 0),
      'e2ee:commit',
      { conversationId, epoch: group?.epoch ?? 0 },
    );
  }
}

function e2eeOff(reason: E2eeOffReason | null): ConflictException {
  return new ConflictException({
    code: ErrorCode.E2EE_OFF,
    message: 'End-to-end encryption is not on for this chat.',
    details: { reason },
  });
}

function invalidKeyPackage(index: number, why: string): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `KeyPackage ${index} is not valid for this device (${why}).`,
    details: { field: 'keyPackages', index, why },
  });
}
