import { gunzipSync, gzipSync } from 'node:zlib';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { Prisma } from '../../../generated/prisma/client';
import type { MlsDevice } from '../../../generated/prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import {
  deviceIdentity,
  isWelcome,
  readCommit,
  readExternalCommit,
  readGroupInfo,
  type ClaimedKeyPackageDto,
  type MlsCommitRowDto,
  type MlsEpochDto,
} from '../../chat/chat-e2ee.public';
import { GroupsService, type Membership } from '../groups.service';
import {
  GROUP_E2EE_EVENT,
  GROUP_SCOPE,
  GroupMlsGate,
  epochConflict,
  groupE2eeOff,
  invalidMls,
  membershipInvalid,
} from './group-mls-gate';
import type {
  CreateGroupMlsDto,
  GroupE2eeDto,
  GroupE2eeOffReason,
  GroupExternalCommitDto,
  GroupInfoResultDto,
  GroupMlsCommitDto,
  GroupMlsLeaseResultDto,
  GroupMlsWelcomeDto,
} from './group-e2ee.dto';

const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
const bytes = (s: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(s, 'base64'));

/** The MLS group_id of a group chat (design §4.1): a group's ciphertext can
 * never be passed off as another group's or a chat's (`lawbid:<id>`). */
export function groupMlsId(groupId: string): Buffer {
  return Buffer.from(`lawbid:g:${groupId}`, 'utf8');
}

/** One device at a time commits in a group (design §4.4). */
export const leaseKey = (groupId: string): string => `e2ee:lease:g:${groupId}`;
const LEASE_EXTEND = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`;
const LEASE_RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

type GroupInfoIn = { groupInfo?: string; groupInfoFileId?: string };
type StoredGroupInfo = {
  group_info: Uint8Array<ArrayBuffer> | null;
  group_info_file_id: string | null;
  group_info_epoch: number;
};

/**
 * Group E2EE G1 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4):
 * group chats (chat_groups) on the same MLS Delivery Service as the chats —
 * the same tables with scope = group, the same compare-and-set on the epoch,
 * the same key-less checks of commits (ts-mls). What groups add (Wire's
 * rules for large groups, §4.2):
 *
 * - membership ↔ MLS: a commit may add only devices of live members
 *   (chat_group_members, left_at IS NULL) and remove only devices that must
 *   go (their person left / was removed, signed out, rejoin). Who may add a
 *   person is the group's own rule (who_can_add) before the member row
 *   exists; the server itself can never add a device (no signature key).
 * - GroupInfo: every commit carries the next epoch's GroupInfo (with the
 *   ratchet tree); the server keeps the latest (gzip, or a file id when
 *   bigger than groups.e2ee_group_info_inline_kb).
 * - external commit (RFC 9420 §12.4.3.2): a member's device joins by itself
 *   (invite link, approved request, accepted invite, new device, resync
 *   after lost state) — only the caller's own device, only while the caller
 *   is a live member.
 * - lease: one device holds the right to claim KeyPackages and commit for
 *   groups.e2ee_lease_ms (Redis SET NX PX), so thousands of devices do not
 *   race for one epoch; the epoch compare-and-set stays the real guard.
 */
@Injectable()
export class GroupE2eeService {
  private readonly log = new Logger('GroupE2ee');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly realtime: RealtimePublisher,
    private readonly groups: GroupsService,
    private readonly gate: GroupMlsGate,
    private readonly files: FilesService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  // ------------------------------------------------------------------ state

  /** 404 unless the caller is a live member (never leaks the group). */
  private async member(user: RequestUser, id: string): Promise<Membership> {
    await this.groups.assertEnabled();
    return this.groups.requireMember(user.sub, id);
  }

  private async activeIds(id: string): Promise<string[]> {
    return this.groups.activeMemberIds(id);
  }

  private async mlsGroup(id: string) {
    const g = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: id },
    });
    return g && g.scope === GROUP_SCOPE ? g : null;
  }

  /** Whether (and why not) the group is / may be encrypted (design §5). */
  private async eligibility(
    user: RequestUser,
    m: Membership,
    users: string[],
    hasGroup: boolean,
  ): Promise<{
    state: 'off' | 'pending' | 'on';
    reason: GroupE2eeOffReason | null;
  }> {
    // An encrypted group stays encrypted, whatever the switch says now.
    if (hasGroup) return { state: 'on', reason: null };
    const off = (reason: GroupE2eeOffReason) => ({
      state: 'off' as const,
      reason,
    });
    const mode = await this.gate.mode();
    if (mode === 'off') return off('mode_off');
    if (user.demo === true) return off('demo');
    if (
      m.group.group_type === 'public' &&
      !(await this.settings.boolean('groups.e2ee_public'))
    ) {
      return off('public_group');
    }
    const max = await this.settings.number('chat.e2ee_max_group_members');
    if (max > 0 && users.length > max) return off('too_many_members');
    if (mode === 'auto') {
      const [r] = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT d.user_id) AS n
        FROM mls_devices d
        WHERE d.user_id = ANY(${users}::UUID[]) AND d.revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM mls_key_packages k WHERE k.device_id = d.id)`;
      if (Number(r?.n ?? 0) < users.length) return off('devices_missing');
    }
    return { state: 'pending', reason: null };
  }

  async state(user: RequestUser, id: string): Promise<GroupE2eeDto> {
    const m = await this.member(user, id);
    const users = await this.activeIds(id);
    const group = await this.mlsGroup(id);
    const el = await this.eligibility(user, m, users, group !== null);
    const [devices, inGroup, holder, updateDays, historyMax] =
      await Promise.all([
        this.prisma.mlsDevice.findMany({
          where: { user_id: { in: users }, revoked_at: null },
          orderBy: [{ user_id: 'asc' }, { created_at: 'asc' }],
        }),
        group
          ? this.prisma.mlsGroupDevice.findMany({
              where: { conversation_id: id, scope: GROUP_SCOPE },
            })
          : Promise.resolve([]),
        group ? this.leaseHolder(id) : Promise.resolve(null),
        this.settings.number('groups.e2ee_update_days'),
        this.settings.number('groups.e2ee_history_max'),
      ]);
    const byDevice = new Map(inGroup.map((g) => [g.device_id, g]));
    const removeDevices = group ? await this.gate.removeDevices(id, users) : [];
    return {
      state: el.state,
      reason: el.reason,
      groupId: group ? b64(group.group_id) : null,
      epoch: group?.epoch ?? null,
      since: m.group.e2ee_since,
      devices: devices.map((d) => ({
        deviceId: d.id,
        userId: d.user_id,
        signatureKey: b64(d.signature_key),
        inGroup: byDevice.has(d.id),
        lastCommitAt: byDevice.get(d.id)?.last_commit_at ?? null,
      })),
      removeDevices,
      leaseHolderDeviceId: holder,
      groupInfoEpoch: group?.group_info_epoch ?? null,
      updateDays,
      historyMax,
      historySharing: m.group.history_sharing,
    };
  }

  // ---------------------------------------------------------------- create

  /** The first device of a member creates the group's MLS group (epoch 0,
   * only itself in it), then adds the others by KeyPackage under the lease.
   * From now on the group is encrypted: a system line says so (design §5). */
  async createGroup(
    user: RequestUser,
    id: string,
    dto: CreateGroupMlsDto,
  ): Promise<GroupE2eeDto> {
    const m = await this.member(user, id);
    const device = await this.ownDevice(user, dto.deviceId);
    const groupId = Buffer.from(dto.groupId, 'base64');
    if (Buffer.compare(groupId, groupMlsId(id)) !== 0) {
      throw invalidMls('groupId', 'a group chat’s MLS id is lawbid:g:<id>');
    }
    const existing = await this.prisma.mlsGroup.findUnique({
      where: { conversation_id: id },
    });
    if (existing) {
      if (
        existing.scope === GROUP_SCOPE &&
        existing.created_by_device === device.id &&
        existing.epoch === 0
      ) {
        return this.state(user, id); // the same request again
      }
      throw epochConflict(existing.epoch);
    }
    const users = await this.activeIds(id);
    const el = await this.eligibility(user, m, users, false);
    if (el.state !== 'pending') throw groupE2eeOff(el.reason);
    const info =
      dto.groupInfo || dto.groupInfoFileId
        ? await this.groupInfoIn(user, groupId, 0, dto)
        : null;
    const since = new Date();
    try {
      await this.prisma.global().$transaction([
        this.prisma.mlsGroup.create({
          data: {
            conversation_id: id,
            scope: GROUP_SCOPE,
            group_id: groupId,
            epoch: 0,
            created_by_device: device.id,
            ...(info ?? {}),
          },
        }),
        this.prisma.mlsGroupDevice.create({
          data: {
            conversation_id: id,
            scope: GROUP_SCOPE,
            device_id: device.id,
            user_id: user.sub,
            joined_epoch: 0,
            last_commit_at: since,
          },
        }),
        this.prisma.chatGroup.update({
          where: { id },
          data: { e2ee_since: since },
        }),
      ]);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const won = await this.prisma.mlsGroup.findUnique({
          where: { conversation_id: id },
        });
        throw epochConflict(won?.epoch ?? 0);
      }
      throw e;
    }
    // The line «messages are end-to-end encrypted from now on», as in the
    // chats; the older messages stay readable as they are.
    await this.groups.e2eeStarted(id, user.sub);
    this.realtime.toUsers(users, GROUP_E2EE_EVENT, { groupId: id, epoch: 0 });
    return this.state(user, id);
  }

  // ------------------------------------------------------------------ lease

  private async leaseHolder(id: string): Promise<string | null> {
    if (!this.redis || this.redis.status !== 'ready') return null;
    try {
      return await this.redis.get(leaseKey(id));
    } catch {
      return null;
    }
  }

  /** Design §4.4: the right to commit for groups.e2ee_lease_ms; the holder
   * asking again extends it. 0 ms = no lease (every device may commit; the
   * epoch compare-and-set still orders them). */
  async lease(
    user: RequestUser,
    id: string,
    deviceId: string,
  ): Promise<GroupMlsLeaseResultDto> {
    await this.member(user, id);
    const d = await this.ownDevice(user, deviceId);
    if (!(await this.mlsGroup(id))) throw groupE2eeOff('devices_missing');
    const ttl = await this.settings.number('groups.e2ee_lease_ms');
    if (ttl <= 0 || !this.redis || this.redis.status !== 'ready') {
      return { granted: true, holderDeviceId: d.id, ttlMs: Math.max(ttl, 0) };
    }
    try {
      const key = leaseKey(id);
      const ok = await this.redis.set(key, d.id, 'PX', ttl, 'NX');
      if (ok === 'OK')
        return { granted: true, holderDeviceId: d.id, ttlMs: ttl };
      const extended = await this.redis.eval(
        LEASE_EXTEND,
        1,
        key,
        d.id,
        String(ttl),
      );
      if (Number(extended) === 1) {
        return { granted: true, holderDeviceId: d.id, ttlMs: ttl };
      }
      const [holder, left] = await Promise.all([
        this.redis.get(key),
        this.redis.pttl(key),
      ]);
      return {
        granted: false,
        holderDeviceId: holder,
        ttlMs: Math.max(left, 0),
      };
    } catch (e) {
      // Redis away: nobody is held back; the epoch CAS orders the commits.
      this.log.warn(`lease ${id}: ${(e as Error).message}`);
      return { granted: true, holderDeviceId: d.id, ttlMs: ttl };
    }
  }

  /** KeyPackages and commits only from the lease holder (design §4.4:
   * without the right a device may only send messages). */
  private async assertOwnLease(id: string, deviceId: string) {
    const ttl = await this.settings.number('groups.e2ee_lease_ms');
    if (ttl <= 0 || !this.redis || this.redis.status !== 'ready') return;
    const holder = await this.leaseHolder(id);
    if (holder !== deviceId) {
      const g = await this.mlsGroup(id);
      throw epochConflict(
        g?.epoch ?? null,
        holder ? 'lease_held' : 'lease_required',
        holder,
      );
    }
  }

  private async releaseLease(id: string, deviceId: string): Promise<void> {
    if (!this.redis || this.redis.status !== 'ready') return;
    try {
      await this.redis.eval(LEASE_RELEASE, 1, leaseKey(id), deviceId);
    } catch {
      // It runs out by itself.
    }
  }

  // ----------------------------------------------------------- KeyPackages

  /** One KeyPackage for each asked device of a live member that is not in
   * the group yet — only for the device holding the lease. */
  async claimKeyPackages(
    user: RequestUser,
    id: string,
    claimer: string,
    deviceIds: string[],
  ): Promise<ClaimedKeyPackageDto[]> {
    await this.member(user, id);
    const me = await this.ownDevice(user, claimer);
    if (!(await this.mlsGroup(id))) throw groupE2eeOff('devices_missing');
    await this.assertOwnLease(id, me.id);
    const users = new Set(await this.activeIds(id));
    const devices = await this.prisma.mlsDevice.findMany({
      where: { id: { in: deviceIds }, revoked_at: null },
    });
    const foreign = deviceIds.filter(
      (d) => !devices.some((x) => x.id === d && users.has(x.user_id)),
    );
    if (foreign.length) throw membershipInvalid(foreign, 'not_a_member');
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

  // --------------------------------------------------------------- GroupInfo

  /** The GroupInfo of a commit: inline (checked: this group, the epoch
   * after the commit; gzip in the database) or my uploaded file. */
  private async groupInfoIn(
    user: RequestUser,
    groupId: Uint8Array,
    epoch: number,
    dto: GroupInfoIn,
  ): Promise<StoredGroupInfo> {
    if (dto.groupInfo && dto.groupInfoFileId) {
      throw invalidMls('groupInfo', 'send groupInfo or groupInfoFileId');
    }
    if (dto.groupInfoFileId) {
      await this.files.assertAttachable(user.sub, dto.groupInfoFileId, [
        'chat_e2ee',
      ]);
      return {
        group_info: null,
        group_info_file_id: dto.groupInfoFileId,
        group_info_epoch: epoch,
      };
    }
    if (!dto.groupInfo) {
      throw invalidMls('groupInfo', 'a group commit carries the GroupInfo');
    }
    const raw = bytes(dto.groupInfo);
    const kb = await this.settings.number('groups.e2ee_group_info_inline_kb');
    if (kb > 0 && raw.length > kb * 1024) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `A GroupInfo over ${kb} KiB goes as a file (groupInfoFileId).`,
        details: { field: 'groupInfo', why: 'use_file', maxKb: kb },
      });
    }
    const info = readGroupInfo(raw);
    if (!info) invalidMlsThrow('groupInfo', 'not a GroupInfo');
    if (Buffer.compare(Buffer.from(info.groupId), Buffer.from(groupId)) !== 0) {
      throw invalidMls('groupInfo', 'the GroupInfo is for another group');
    }
    if (info.epoch !== epoch) {
      throw invalidMls('groupInfo', 'the GroupInfo is for another epoch');
    }
    return {
      group_info: new Uint8Array(gzipSync(raw)),
      group_info_file_id: null,
      group_info_epoch: epoch,
    };
  }

  async groupInfo(user: RequestUser, id: string): Promise<GroupInfoResultDto> {
    await this.member(user, id);
    const g = await this.mlsGroup(id);
    if (!g || g.group_info_epoch === null) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No GroupInfo yet.',
      });
    }
    const url = g.group_info_file_id
      ? ((await this.files.e2eeBlobUrls([g.group_info_file_id])).get(
          g.group_info_file_id,
        )?.url ?? null)
      : null;
    return {
      epoch: g.group_info_epoch,
      groupInfo: g.group_info ? b64(gunzipSync(g.group_info)) : null,
      url,
    };
  }

  // ---------------------------------------------------------------- commits

  /** A member's commit (adds / removes / self-update) for the current
   * epoch, with the next epoch's GroupInfo. */
  async commit(
    user: RequestUser,
    id: string,
    dto: GroupMlsCommitDto,
  ): Promise<MlsEpochDto> {
    await this.member(user, id);
    const sender = await this.ownDevice(user, dto.deviceId);
    const commitBytes = bytes(dto.commit);
    const parsed = readCommit(commitBytes);
    if (!parsed) throw invalidMls('commit', 'not a commit');
    if (parsed.external) {
      throw invalidMls('commit', 'an external commit goes to external-commit');
    }
    if (parsed.epoch !== dto.epoch) {
      throw invalidMls('commit', 'the commit is for another epoch');
    }
    const g0 = await this.mlsGroup(id);
    if (!g0) throw groupE2eeOff('devices_missing');
    await this.assertOwnLease(id, sender.id);
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
    const users = await this.activeIds(id);
    const live = new Set(users);
    const addedRows = added.length
      ? await this.prisma.mlsDevice.findMany({
          where: { id: { in: added }, revoked_at: null },
        })
      : [];
    const notAddable = added.filter(
      (d) => !addedRows.some((r) => r.id === d && live.has(r.user_id)),
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
    // Only devices that must go may be removed (design §4.2).
    if (removed.length) {
      const mustGo = new Set(await this.gate.removeDevices(id, users));
      const kept = removed.filter((d) => !mustGo.has(d));
      if (kept.length) throw membershipInvalid(kept, 'still_a_member');
    }
    const info = await this.groupInfoIn(user, g0.group_id, dto.epoch + 1, dto);
    const max = await this.settings.number('chat.e2ee_max_group_members');
    const result = await this.prisma.global().$transaction(async (tx) => {
      const [g] = await tx.$queryRaw<{ epoch: number; group_id: Uint8Array }[]>`
        SELECT epoch, group_id FROM mls_groups
        WHERE conversation_id = ${id}::UUID AND scope = ${GROUP_SCOPE} FOR UPDATE`;
      if (!g) throw groupE2eeOff('devices_missing');
      if (Buffer.compare(Buffer.from(g.group_id), parsed.groupId) !== 0) {
        throw invalidMls('commit', 'the commit is for another group');
      }
      if (g.epoch !== dto.epoch) throw epochConflict(g.epoch);
      const current = await tx.mlsGroupDevice.findMany({
        where: { conversation_id: id, scope: GROUP_SCOPE },
      });
      const inGroup = new Set(current.map((c) => c.device_id));
      if (!inGroup.has(sender.id)) {
        throw membershipInvalid([sender.id], 'sender_not_in_group');
      }
      if (removed.includes(sender.id)) {
        throw membershipInvalid([sender.id], 'sender_removes_itself');
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
        if (after.size > max)
          throw membershipInvalid(added, 'too_many_members');
      }
      const next = g.epoch + 1;
      const now = new Date();
      await tx.mlsCommit.create({
        data: {
          conversation_id: id,
          scope: GROUP_SCOPE,
          epoch: g.epoch,
          sender_device_id: sender.id,
          data: Buffer.from(commitBytes),
          added_devices: added,
          removed_devices: removed,
        },
      });
      await tx.mlsGroup.update({
        where: { conversation_id: id },
        data: { epoch: next, ...info },
      });
      if (removed.length) {
        await tx.mlsGroupDevice.deleteMany({
          where: { conversation_id: id, device_id: { in: removed } },
        });
      }
      await tx.mlsGroupDevice.update({
        where: {
          conversation_id_device_id: {
            conversation_id: id,
            device_id: sender.id,
          },
        },
        data: { last_commit_at: now },
      });
      if (addedRows.length) {
        await tx.mlsGroupDevice.createMany({
          data: addedRows.map((r) => ({
            conversation_id: id,
            scope: GROUP_SCOPE,
            device_id: r.id,
            user_id: r.user_id,
            joined_epoch: next,
          })),
        });
        await tx.mlsWelcome.createMany({
          data: addedRows.map((r) => ({
            conversation_id: id,
            scope: GROUP_SCOPE,
            device_id: r.id,
            epoch: next,
            data: Buffer.from(dto.welcome!, 'base64'),
          })),
        });
      }
      return { epoch: next };
    });
    await this.releaseLease(id, sender.id);
    this.realtime.toUsers(users, GROUP_E2EE_EVENT, {
      groupId: id,
      epoch: result.epoch,
    });
    const welcomed = [...new Set(addedRows.map((r) => r.user_id))];
    if (welcomed.length) {
      this.realtime.toUsers(welcomed, 'e2ee:group_welcome', { groupId: id });
    }
    return result;
  }

  /**
   * RFC 9420 §12.4.3.2 (design §4.2): my device joins the group by itself
   * from the stored GroupInfo — after the invite link, an approved request,
   * an accepted invitation, on a new device, or to resync a device that lost
   * its state (the commit then removes its own old leaf). The server admits
   * only the caller's own device and only while the caller is a live member.
   */
  async externalCommit(
    user: RequestUser,
    id: string,
    dto: GroupExternalCommitDto,
  ): Promise<MlsEpochDto> {
    await this.member(user, id);
    const device = await this.ownDevice(user, dto.deviceId);
    const commitBytes = bytes(dto.commit);
    const parsed = readExternalCommit(commitBytes);
    if (!parsed) throw invalidMls('commit', 'not an external commit');
    if (parsed.epoch !== dto.epoch) {
      throw invalidMls('commit', 'the commit is for another epoch');
    }
    if (
      parsed.identity !== deviceIdentity(user.sub, device.id) ||
      Buffer.compare(
        Buffer.from(parsed.signatureKey),
        Buffer.from(device.signature_key),
      ) !== 0
    ) {
      throw membershipInvalid([device.id], 'not_this_device');
    }
    const resync = dto.resync === true;
    if (parsed.removes !== (resync ? 1 : 0)) {
      throw membershipInvalid(
        [device.id],
        resync ? 'resync_removes_its_own_leaf' : 'external_commit_removes',
      );
    }
    const g0 = await this.mlsGroup(id);
    if (!g0) throw groupE2eeOff('devices_missing');
    await this.assertOwnLease(id, device.id);
    const info = await this.groupInfoIn(user, g0.group_id, dto.epoch + 1, dto);
    const users = await this.activeIds(id);
    const max = await this.settings.number('chat.e2ee_max_group_members');
    const result = await this.prisma.global().$transaction(async (tx) => {
      const [g] = await tx.$queryRaw<{ epoch: number; group_id: Uint8Array }[]>`
        SELECT epoch, group_id FROM mls_groups
        WHERE conversation_id = ${id}::UUID AND scope = ${GROUP_SCOPE} FOR UPDATE`;
      if (!g) throw groupE2eeOff('devices_missing');
      if (Buffer.compare(Buffer.from(g.group_id), parsed.groupId) !== 0) {
        throw invalidMls('commit', 'the commit is for another group');
      }
      if (g.epoch !== dto.epoch) throw epochConflict(g.epoch);
      const current = await tx.mlsGroupDevice.findMany({
        where: { conversation_id: id, scope: GROUP_SCOPE },
      });
      const inGroup = current.some((c) => c.device_id === device.id);
      if (resync !== inGroup) {
        throw membershipInvalid(
          [device.id],
          resync ? 'not_in_group' : 'already_in_group',
        );
      }
      if (max > 0 && !resync) {
        const after = new Set(current.map((c) => c.user_id));
        after.add(user.sub);
        if (after.size > max) {
          throw membershipInvalid([device.id], 'too_many_members');
        }
      }
      const next = g.epoch + 1;
      const now = new Date();
      await tx.mlsCommit.create({
        data: {
          conversation_id: id,
          scope: GROUP_SCOPE,
          epoch: g.epoch,
          sender_device_id: device.id,
          data: Buffer.from(commitBytes),
          added_devices: resync ? [] : [device.id],
          removed_devices: [],
          external: true,
        },
      });
      await tx.mlsGroup.update({
        where: { conversation_id: id },
        data: { epoch: next, ...info },
      });
      if (resync) {
        await tx.mlsGroupDevice.update({
          where: {
            conversation_id_device_id: {
              conversation_id: id,
              device_id: device.id,
            },
          },
          data: { joined_epoch: next, rejoin_at: null, last_commit_at: now },
        });
      } else {
        await tx.mlsGroupDevice.create({
          data: {
            conversation_id: id,
            scope: GROUP_SCOPE,
            device_id: device.id,
            user_id: user.sub,
            joined_epoch: next,
            last_commit_at: now,
          },
        });
      }
      // Welcomes made for this device before are of no use any more.
      await tx.mlsWelcome.deleteMany({
        where: { conversation_id: id, device_id: device.id },
      });
      return { epoch: next };
    });
    await this.releaseLease(id, device.id);
    this.realtime.toUsers(users, GROUP_E2EE_EVENT, {
      groupId: id,
      epoch: result.epoch,
    });
    return result;
  }

  async commits(
    user: RequestUser,
    id: string,
    after = 0,
  ): Promise<MlsCommitRowDto[]> {
    await this.member(user, id);
    const rows = await this.prisma.mlsCommit.findMany({
      where: { conversation_id: id, scope: GROUP_SCOPE, epoch: { gte: after } },
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

  /** Welcomes of groups waiting for my device (the chats have their own). */
  async welcomes(
    user: RequestUser,
    deviceId: string,
  ): Promise<GroupMlsWelcomeDto[]> {
    const d = await this.ownDevice(user, deviceId);
    const keepDays = await this.settings.number('chat.e2ee_welcome_keep_days');
    const since =
      keepDays > 0 ? new Date(Date.now() - keepDays * 86_400_000) : undefined;
    const rows = await this.prisma.mlsWelcome.findMany({
      where: {
        device_id: d.id,
        scope: GROUP_SCOPE,
        ...(since ? { created_at: { gte: since } } : {}),
      },
      orderBy: { created_at: 'asc' },
      take: 200,
    });
    return rows.map((w) => ({
      id: w.id,
      groupId: w.conversation_id,
      epoch: w.epoch,
      welcome: b64(w.data),
    }));
  }

  // ---------------------------------------------------------------- helpers

  private async ownDevice(user: RequestUser, id: string): Promise<MlsDevice> {
    const d = await this.prisma.mlsDevice.findUnique({ where: { id } });
    if (!d || d.user_id !== user.sub || d.revoked_at) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Device not found.',
      });
    }
    return d;
  }
}

function invalidMlsThrow(field: string, why: string): never {
  throw invalidMls(field, why);
}
