import { viewerContext } from '../../common/viewer/viewer-context';
import { createHmac } from 'node:crypto';
import {
  Optional,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Call,
  CallParticipant,
  CallVote,
  CallStatus,
  Conversation,
} from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { caseWorkOngoing } from '../blocks/block-guard';
import { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';
import { ChatService } from '../chat/chat.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushQueueService } from '../notifications/push/push-queue.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { GroupsService } from '../groups/groups.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  CallDto,
  CallVoteDto,
  CallParticipantDto,
  EndCallDto,
  InviteCallDto,
  IceServersDto,
  StartCallDto,
  StartGroupCallDto,
  VideoCallConfigDto,
} from './calls.dto';
import {
  VIDEO_CALLS_FLAG,
  WebRtcVideoProvider,
  videoCallAvailability,
  type VideoCallProvider,
} from './video-call-provider';

/** Unanswered after this → missed (the app gives up at 60 s, like WhatsApp). */
export const CALL_RING_TIMEOUT_MS = 65_000;
/** A running call nobody has asked about for this long is over: the apps
 * read it every ~8 s (heartbeat), so silence means both are gone. Owner
 * 2026-10-21: no cap on how long people talk (days are fine) — only
 * silence ends a call — and a dead-zone gap of a few minutes must not
 * (the app waits 150 s for the network before it gives up). */
export const CALL_SILENT_MS = 180 * 1000;
const LIVE: CallStatus[] = ['ringing', 'active'];

/** Owner 2026-10-21: a network that blocks UDP (offices, some mobile
 * carriers) still gets a call — every plain `turn:` address is also offered
 * over TCP (coturn listens on 3478 for both). UDP stays first. */
export function withTcpFallback(urls: string[]): string[] {
  const out = [...urls];
  for (const u of urls) {
    if (/^turn:/i.test(u) && !/[?&]transport=/i.test(u)) {
      const tcp = `${u}?transport=tcp`;
      if (!out.includes(tcp)) out.push(tcp);
    }
  }
  return out;
}

/** Mesh calls: every member sends audio to every other — a safe size. */
export const GROUP_MAX_AUDIO = 9;
export const GROUP_MAX_VIDEO = 6;
const IN_CALL = ['joined', 'invited'];
/** A vote to remove a member runs this long, then the count decides. */
export const CALL_VOTE_MS = 30_000;
// coturn checks the login on every refresh of a relay too: it must outlive
// the longest call, or a relayed call drops when it expires.
const TURN_TTL_SEC = 24 * 60 * 60;

type Outcome = 'ended' | 'missed' | 'declined' | 'busy' | 'canceled' | 'failed';

const notFound = () =>
  new NotFoundException({
    code: ErrorCode.CALL_NOT_FOUND,
    message: 'Call not found.',
  });

const conflict = () =>
  new ConflictException({
    code: ErrorCode.CALL_STATE_CONFLICT,
    message: 'This call is no longer ringing.',
  });

/**
 * OQ-041 (owner 2026-09-30): audio calls between the two members of a
 * chat, in the app (not over the phone network), no video. The server
 * keeps the call's life (ringing → active → ended / missed / declined /
 * busy / canceled / failed), rings the callee (realtime + push), relays
 * WebRTC signaling (RealtimeGateway `call:signal`) and hands out
 * STUN/TURN; the audio goes device to device (or through TURN), never
 * through the API. Every finished call lands in the chat log.
 *
 * Same rules as chat messages: members only, not in a closed chat, no
 * blocks either way, the attorney's subscription active — and only once
 * the bid is accepted (contacts unlocked), so a call cannot be used to
 * trade contacts before acceptance.
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly limits: UsageLimitsService,
    private readonly blocks: BlocksService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly chat: ChatService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly push: PushQueueService,
    private readonly realtime: RealtimePublisher,
    private readonly flags: FeatureFlagsService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly entitlements?: EntitlementsService,
    // Owner 2026-10-20: "who can call me" (Settings → Privacy).
    @Optional() private readonly privacy?: PrivacySettingsService,
    // Owner 2026-10-20: calls from a group chat.
    @Optional() private readonly groups?: GroupsService,
  ) {
    this.videoProvider = new WebRtcVideoProvider(secrets, config);
    // Someone left / was removed from a group: out of its running call too.
    this.groups?.membershipEnded$.subscribe((e) => {
      void this.dropFromGroupCall(e).catch(() => undefined);
    });
  }

  private readonly videoProvider: VideoCallProvider;

  /** GET /calls/video — owner 2026-10-05: flag on AND provider keys set. */
  async videoConfig(): Promise<VideoCallConfigDto> {
    const flagOn = await this.flags.isEnabled(VIDEO_CALLS_FLAG, false);
    const a = await videoCallAvailability(flagOn, this.videoProvider);
    return { ...a, provider: this.videoProvider.name };
  }

  /** POST /conversations/:id/calls */
  async start(
    user: RequestUser,
    conversationId: string,
    dto: StartCallDto = {},
  ): Promise<CallDto> {
    const video = dto.video === true;
    // Owner 2026-10-05 (plan builder): the plan's "video calls" term is
    // checked first; the global flag and TURN keys come next.
    if (
      video &&
      this.entitlements &&
      !(await this.entitlements.has(user.sub, 'video_calls'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include video calls.',
      });
    }
    if (video && !(await this.videoConfig()).available) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Video calls are not available yet.',
      });
    }
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (
      !conv ||
      (conv.client_id !== user.sub && conv.attorney_id !== user.sub)
    ) {
      throw new NotFoundException({
        code: ErrorCode.CONVERSATION_NOT_FOUND,
        message: 'Conversation not found.',
      });
    }
    if (conv.status === 'closed') {
      throw new ConflictException({
        code: ErrorCode.CONVERSATION_CLOSED,
        message: 'This chat is closed.',
      });
    }
    if (!conv.contacts_unlocked) {
      throw new ConflictException({
        code: ErrorCode.CALL_NOT_ALLOWED,
        message: 'Calls open once the bid is accepted.',
      });
    }
    const callee =
      user.sub === conv.attorney_id ? conv.client_id : conv.attorney_id;
    // OQ-028: except the chat of a case in progress.
    const caseWork = await caseWorkOngoing(this.prisma, conv);
    if (!caseWork) {
      await this.blocks.assertNotBlocked(user.sub, callee);
      await this.privacy?.assertAllowed(user.sub, callee, 'call');
    }
    // Plan term (owner 2026-10-05): the admin can switch calls off per plan.
    if (
      this.entitlements &&
      !(await this.entitlements.has(user.sub, 'calls'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include calls.',
      });
    }
    await this.assertSubscription(conv);
    await this.limits.consume('message', user.sub);
    await this.sweep();

    const mine = await this.liveCallOf(user.sub);
    if (mine) {
      // The id lets the app offer "end it there" (Telegram) when this
      // device has no call of its own.
      throw new ConflictException({
        code: ErrorCode.CALL_IN_PROGRESS,
        message: 'You are already in a call.',
        details: { callId: mine.id },
      });
    }
    if (await this.liveCallOf(callee)) {
      // The other side is talking: record "busy" right away.
      const busy = await this.prisma.call.create({
        data: {
          conversation_id: conv.id,
          caller_id: user.sub,
          callee_id: callee,
          status: 'busy',
          ended_at: new Date(),
          end_reason: 'busy',
          video,
        },
      });
      await this.logCall(busy, 'busy');
      // The busy person sees it in their missed calls too.
      await this.notifications.emit({
        type: 'missed_call',
        recipientId: callee,
        payload: {
          callId: busy.id,
          conversationId: conv.id,
          actorId: user.sub,
        },
      });
      return this.toDto(busy, user.sub);
    }

    const call = await this.prisma.call.create({
      data: {
        conversation_id: conv.id,
        caller_id: user.sub,
        callee_id: callee,
        video,
      },
    });
    // OQ-048: a call to the attorney also rings assistants who hold the
    // "calls" duty (their own devices; whoever answers takes it).
    // Owner 2026-10-20: an assistant's own "who can call me" applies too
    // (not for a case in work).
    const helpers = await this.callAssistants(callee);
    const reachable = caseWork
      ? helpers
      : (
          await Promise.all(
            helpers.map(async (h) =>
              (await this.privacy?.allows(user.sub, h, 'call')) === false
                ? null
                : h,
            ),
          )
        ).filter((h): h is string => h !== null);
    const ringing = [callee, ...reachable];
    const incoming = { call: await this.toDto(call, callee) };
    this.realtime.toUsers(ringing, 'call:incoming', incoming);
    for (const recipientId of ringing) {
      await this.push.enqueueCall({ recipientId, callId: call.id });
    }
    return this.toDto(call, user.sub);
  }

  private async callAssistants(attorneyId: string): Promise<string[]> {
    const rows = await this.prisma.assistantMembership.findMany({
      where: {
        attorney_id: attorneyId,
        status: 'active',
        duties: { has: 'calls' },
        assistant_user_id: { not: null },
      },
      select: { assistant_user_id: true },
    });
    return rows.flatMap((r) =>
      r.assistant_user_id ? [r.assistant_user_id] : [],
    );
  }

  /** POST /calls/:id/accept — the callee picks up. */
  async accept(user: RequestUser, id: string): Promise<CallDto> {
    await this.sweep();
    const call = await this.load(user, id);
    const invite = call.is_group ? await this.rowOf(call.id, user.sub) : null;
    if (invite?.status === 'invited') {
      return this.joinAsInvitee(user, call, invite);
    }
    if (call.callee_id !== user.sub || !call.conversation_id) throw notFound();
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: call.conversation_id },
    });
    await this.assertSubscription(conv);
    const { count } = await this.prisma.call.updateMany({
      where: { id, status: 'ringing' },
      data: { status: 'active', answered_at: new Date() },
    });
    if (count === 0) throw conflict();
    const fresh = await this.prisma.call.findUniqueOrThrow({ where: { id } });
    // Both sides: the caller starts WebRTC, the callee's other devices
    // stop ringing.
    for (const uid of [call.caller_id, call.callee_id]) {
      this.realtime.toUsers([uid], 'call:accepted', {
        call: await this.toDto(fresh, uid),
      });
    }
    await this.stopRingingPush(call);
    return this.toDto(fresh, user.sub);
  }

  /** Push 2026-10-19: phones asleep or closed show the system ringing
   * screen with no socket to hear `call:ended` / `call:accepted` — a
   * silent push takes it down (the answering phone keeps its call). */
  private async stopRingingPush(call: Call): Promise<void> {
    const ringing = [
      call.callee_id,
      ...(await this.callAssistants(call.callee_id)),
    ];
    for (const recipientId of ringing) {
      await this.push.enqueueCallEnded({ recipientId, callId: call.id });
    }
  }

  /** The call is over: people still being rung (group invites) stop. */
  private async stopInvitePushes(call: Call): Promise<void> {
    if (!call.is_group) return;
    const invited = await this.prisma.callParticipant.findMany({
      where: { call_id: call.id, status: 'invited' },
      select: { user_id: true },
    });
    for (const { user_id: recipientId } of invited) {
      await this.push.enqueueCallEnded({ recipientId, callId: call.id });
    }
  }

  /** Owner 2026-10-20: a minimised phone has no socket to hear `call:ended`
   * (the other side hung up, the call failed, the sweep closed it) — a
   * silent push tells both phones the answered call is over, so the app
   * closes the screen, the notification and the CallKit call at once. */
  private async endedActivePush(call: Call): Promise<void> {
    const rows = call.is_group ? await this.rowsOf(call.id) : [];
    for (const recipientId of this.audience(call, rows)) {
      await this.push.enqueueCallEnded({
        recipientId,
        callId: call.id,
        ended: true,
      });
    }
  }

  /** POST /calls/:id/decline — the callee rejects a ringing call. */
  async decline(user: RequestUser, id: string): Promise<CallDto> {
    const call = await this.load(user, id);
    const invite = call.is_group ? await this.rowOf(call.id, user.sub) : null;
    if (invite?.status === 'invited') {
      return this.declineInvite(user, call, invite);
    }
    if (call.callee_id !== user.sub) throw notFound();
    if (call.status !== 'ringing') return this.toDto(call, user.sub);
    return this.finish(call, 'declined', user.sub);
  }

  /** POST /calls/:id/end — hang up (either side), idempotent. */
  async end(user: RequestUser, id: string, dto: EndCallDto): Promise<CallDto> {
    const call = await this.load(user, id);
    if (!LIVE.includes(call.status)) return this.toDto(call, user.sub);
    if (call.is_group) {
      // Hanging up a group call = leaving it (it goes on for the others).
      const row = await this.rowOf(call.id, user.sub);
      if (dto.forAll) {
        // "End call for everyone": the host only.
        if (this.hostOf(call, await this.rowsOf(call.id)) !== user.sub) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'Only the host can end the call for everyone.',
          });
        }
        return this.finish(call, 'ended', user.sub);
      }
      if (row?.status === 'joined') return this.leaveGroup(user, call, row);
      if (row?.status === 'invited') return this.declineInvite(user, call, row);
      return this.toDto(call, user.sub);
    }
    const reason = dto.reason ?? 'hangup';
    let outcome: Outcome;
    if (reason === 'failed') {
      outcome = 'failed';
    } else if (call.status === 'active') {
      outcome = 'ended';
    } else if (user.sub === call.callee_id) {
      outcome = 'declined';
    } else {
      outcome = reason === 'no_answer' ? 'missed' : 'canceled';
    }
    return this.finish(call, outcome, user.sub);
  }

  async get(user: RequestUser, id: string): Promise<CallDto> {
    await this.sweep();
    const call = await this.load(user, id);
    if (LIVE.includes(call.status)) {
      // The app asks every few seconds while it is in the call: a heartbeat.
      const now = new Date();
      await this.prisma.call.updateMany({
        where: { id: call.id, status: { in: LIVE } },
        data: { updated_at: now },
      });
      // A group call has one heartbeat per person: whoever's app died (swiped
      // away, no network) is dropped on their own silence, not kept by the
      // others' heartbeats.
      if (call.is_group) {
        await this.prisma.callParticipant.updateMany({
          where: { call_id: call.id, user_id: user.sub, status: 'joined' },
          data: { updated_at: now },
        });
      }
    }
    return this.toDto(call, user.sub);
  }

  /** GET /calls/ice-servers — STUN + short-lived TURN login (RFC 7635
   * style "TURN REST API": username = expiry:userId, password =
   * base64(HMAC-SHA1(TURN_SECRET, username))). */
  async iceServers(user: RequestUser): Promise<IceServersDto> {
    // Owner 2026-10-01: TURN / STUN can be changed in the admin.
    const turnKeys = (await this.secrets?.get('turn'))?.fields ?? {};
    const stun = (
      turnKeys.stunUrls ??
      this.config.get<string>('STUN_URLS') ??
      'stun:stun.l.google.com:19302'
    )
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const out: IceServersDto = {
      iceServers: [{ urls: stun, username: null, credential: null }],
      ttlSec: TURN_TTL_SEC,
    };
    const turn = (turnKeys.urls ?? this.config.get<string>('TURN_URLS') ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const secret = turnKeys.secret ?? this.config.get<string>('TURN_SECRET');
    if (turn.length > 0 && secret) {
      const urls = withTcpFallback(turn);
      const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SEC}:${user.sub}`;
      out.iceServers.push({
        urls,
        username,
        credential: createHmac('sha1', secret)
          .update(username)
          .digest('base64'),
      });
    }
    return out;
  }

  /** Signaling relay check (RealtimeGateway): the other member of a live
   * call, or null. */
  async peerForSignal(userId: string, callId: string): Promise<string | null> {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call || !LIVE.includes(call.status)) return null;
    if (call.caller_id === userId) return call.callee_id;
    if (call.callee_id === userId) return call.caller_id;
    return null;
  }

  /**
   * Ringing too long → missed; active for hours (both apps gone) →
   * ended. Run by the cron every minute and before call actions.
   */
  async sweep(now = new Date()): Promise<number> {
    const stale = await this.prisma.call.findMany({
      where: {
        OR: [
          {
            status: 'ringing',
            created_at: { lt: new Date(now.getTime() - CALL_RING_TIMEOUT_MS) },
          },
          {
            status: 'active',
            updated_at: { lt: new Date(now.getTime() - CALL_SILENT_MS) },
          },
        ],
      },
      take: 200,
    });
    for (const c of stale) {
      await this.finish(c, c.status === 'ringing' ? 'missed' : 'ended', null);
    }
    await this.sweepInvites(now);
    await this.sweepSilentMembers(now);
    await this.sweepVotes(now);
    return stale.length;
  }

  private async finish(
    call: Call,
    outcome: Outcome,
    viewerId: string | null,
  ): Promise<CallDto> {
    const now = new Date();
    const durationSec =
      outcome === 'ended' && call.answered_at
        ? Math.max(
            0,
            Math.round((now.getTime() - call.answered_at.getTime()) / 1000),
          )
        : 0;
    const { count } = await this.prisma.call.updateMany({
      where: { id: call.id, status: { in: LIVE } },
      data: {
        status: outcome,
        ended_at: now,
        duration_sec: durationSec,
        end_reason: outcome,
      },
    });
    const fresh = await this.prisma.call.findUniqueOrThrow({
      where: { id: call.id },
    });
    if (count > 0) {
      if (call.status === 'ringing') {
        await this.stopRingingPush(call);
      } else {
        await this.endedActivePush(call);
      }
      await this.stopInvitePushes(call);
      await this.logCall(fresh, outcome);
      const rows = call.is_group ? await this.rowsOf(call.id) : [];
      const audience = [
        ...new Set([
          ...this.audience(call, rows),
          // Anyone who was rung or in the call hears that it is over.
          ...rows.map((r) => r.user_id),
        ]),
      ];
      for (const uid of audience) {
        this.realtime.toUsers([uid], 'call:ended', {
          call: await this.toDto(fresh, uid),
        });
      }
      if (call.is_group) {
        await this.prisma.callParticipant.updateMany({
          where: { call_id: call.id, status: { in: IN_CALL } },
          data: { status: 'left', left_at: now },
        });
      }
      if (
        call.conversation_id &&
        (outcome === 'missed' || outcome === 'canceled')
      ) {
        await this.notifications.emit({
          type: 'missed_call',
          recipientId: call.callee_id,
          payload: {
            callId: call.id,
            conversationId: call.conversation_id,
            actorId: call.caller_id,
          },
        });
      }
    }
    return this.toDto(fresh, viewerId ?? call.caller_id);
  }

  // --- Group calls (owner 2026-10-20) ---------------------------------------

  // --- Calls from a group chat (owner 2026-10-20) ---------------------------

  /** Audio / video of one call: audio 6, video 4 (mesh). */
  private capacity(video: boolean): number {
    return video ? GROUP_MAX_VIDEO : GROUP_MAX_AUDIO;
  }

  /** POST /groups/:id/calls — the phone / video buttons of a group chat. The
   * caller becomes the host; the chosen members ring (like a person added to
   * a call); every other member can join from the chat while it runs. */
  async startGroupCall(
    user: RequestUser,
    groupId: string,
    dto: StartGroupCallDto = {},
  ): Promise<CallDto> {
    const groups = this.groups;
    if (!groups) throw notFound();
    const video = dto.video === true;
    const m = await groups.assertMember(user.sub, groupId);
    if (!(m.group.who_can_call === 'all' || m.admin)) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_FORBIDDEN,
        message: 'Only admins can start a call in this group.',
      });
    }
    if (
      this.entitlements &&
      !(await this.entitlements.has(user.sub, video ? 'video_calls' : 'calls'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include calls.',
      });
    }
    if (video && !(await this.videoConfig()).available) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Video calls are not available yet.',
      });
    }
    await this.sweep();
    // A call of this group is already running: join it instead of a second.
    const running = await this.runningGroupCall(groupId);
    if (running) return this.joinCall(user, running.id);
    const mine = await this.liveCallOf(user.sub);
    if (mine) {
      throw new ConflictException({
        code: ErrorCode.CALL_IN_PROGRESS,
        message: 'You are already in a call.',
        details: { callId: mine.id },
      });
    }

    const members = new Set(await groups.activeMemberIds(groupId));
    // Like WhatsApp: no explicit list = the whole group rings (up to the size
    // of the call); the app sends a list only when the person picked members.
    const wanted = [...new Set(dto.userIds ?? [...members])].filter(
      (id) => id !== user.sub && members.has(id),
    );
    const invitees: string[] = [];
    for (const id of wanted) {
      if (invitees.length >= this.capacity(video) - 1) break;
      // Blocked, "who can call me" closed or already talking: skipped.
      try {
        await this.blocks.assertNotBlocked(user.sub, id);
        await this.assertMayCall(user.sub, id);
      } catch {
        continue;
      }
      if (await this.liveCallOf(id)) continue;
      invitees.push(id);
    }

    const now = new Date();
    const call = await this.prisma.$transaction(async (tx) => {
      const c = await tx.call.create({
        data: {
          group_id: groupId,
          caller_id: user.sub,
          callee_id: user.sub,
          status: 'active',
          answered_at: now,
          video,
          is_group: true,
        },
      });
      await tx.callParticipant.create({
        data: {
          call_id: c.id,
          user_id: user.sub,
          status: 'joined',
          joined_at: now,
        },
      });
      for (const id of invitees) {
        await tx.callParticipant.create({
          data: {
            call_id: c.id,
            user_id: id,
            invited_by_id: user.sub,
            status: 'invited',
          },
        });
      }
      return c;
    });
    for (const id of invitees) {
      // A call from a group chat is a light invitation, not a ring.
      this.realtime.toUsers([id], 'call:invite', {
        call: await this.toDto(call, id),
      });
      await this.push.enqueueCall({ recipientId: id, callId: call.id });
    }
    await this.broadcastParticipants(call.id);
    return this.toDto(call, user.sub);
  }

  /** The running (not yet ended) call of a group, else null. */
  private async runningGroupCall(groupId: string): Promise<Call | null> {
    return this.prisma.call.findFirst({
      where: { group_id: groupId, status: 'active' },
      orderBy: { created_at: 'desc' },
    });
  }

  /** GET /groups/:id/call — the call running in this group (the chat shows
   * "Join"), 404 CALL_NOT_FOUND when there is none. */
  async groupCall(user: RequestUser, groupId: string): Promise<CallDto> {
    const groups = this.groups;
    if (!groups) throw notFound();
    await groups.assertMember(user.sub, groupId);
    await this.sweep();
    const call = await this.runningGroupCall(groupId);
    if (!call) throw notFound();
    // Silent for a while (everybody's app is gone): not a call to join.
    if (call.updated_at.getTime() < Date.now() - CALL_SILENT_MS) {
      await this.finish(call, 'ended', null);
      throw notFound();
    }
    return this.toDto(call, user.sub);
  }

  /** POST /calls/:id/join — a member of the group joins its running call. */
  async joinCall(user: RequestUser, id: string): Promise<CallDto> {
    const groups = this.groups;
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!groups || !call?.group_id) throw notFound();
    await groups.assertMember(user.sub, call.group_id);
    await this.sweep();
    const fresh = await this.prisma.call.findUniqueOrThrow({ where: { id } });
    if (fresh.status !== 'active') throw conflict();
    if (
      this.entitlements &&
      !(await this.entitlements.has(
        user.sub,
        fresh.video ? 'video_calls' : 'calls',
      ))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include calls.',
      });
    }
    const rows = await this.rowsOf(fresh.id);
    const me = rows.find((r) => r.user_id === user.sub);
    if (me?.status === 'joined') return this.toDto(fresh, user.sub);
    if (me?.status === 'removed') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You were removed from this call.',
      });
    }
    const inCall = rows.filter((r) => r.status === 'joined').length;
    if (inCall >= this.capacity(fresh.video)) {
      throw new ConflictException({
        code: ErrorCode.CALL_STATE_CONFLICT,
        message: 'The call is full.',
      });
    }
    const other = await this.liveCallOf(user.sub);
    if (other && other.id !== fresh.id) {
      throw new ConflictException({
        code: ErrorCode.CALL_IN_PROGRESS,
        message: 'You are already in a call.',
        details: { callId: other.id },
      });
    }
    await this.prisma.callParticipant.upsert({
      where: { call_id_user_id: { call_id: fresh.id, user_id: user.sub } },
      create: {
        call_id: fresh.id,
        user_id: user.sub,
        status: 'joined',
        joined_at: new Date(),
      },
      update: {
        status: 'joined',
        joined_at: new Date(),
        left_at: null,
        muted: false,
        muted_by_host: false,
      },
    });
    // Other devices of theirs stop ringing (if they were invited).
    await this.push.enqueueCallEnded({
      recipientId: user.sub,
      callId: fresh.id,
    });
    await this.broadcastParticipants(fresh.id);
    return this.toDto(fresh, user.sub);
  }

  /** A person left / was removed from a group, or the group was deleted:
   * they drop out of its running call (the group's call ends with it). */
  private async dropFromGroupCall(e: {
    groupId: string;
    userId: string;
    reason: 'left' | 'removed' | 'group_deleted';
  }): Promise<void> {
    const call = await this.runningGroupCall(e.groupId);
    if (!call) return;
    if (e.reason === 'group_deleted') {
      await this.finish(call, 'ended', null);
      return;
    }
    const row = await this.rowOf(call.id, e.userId);
    if (!row || !IN_CALL.includes(row.status)) return;
    await this.prisma.callParticipant.update({
      where: { id: row.id },
      data: { status: 'removed', left_at: new Date() },
    });
    this.realtime.toUsers([e.userId], 'call:removed', { callId: call.id });
    await this.push.enqueueCallEnded({
      recipientId: e.userId,
      callId: call.id,
      ended: true,
    });
    const joined = (await this.rowsOf(call.id)).filter(
      (r) => r.status === 'joined',
    );
    if (joined.length < 2) {
      await this.finish(call, 'ended', null);
      return;
    }
    await this.broadcastParticipants(call.id, [e.userId]);
  }

  private async participantDtos(
    rows: CallParticipant[],
  ): Promise<CallParticipantDto[]> {
    if (rows.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.user_id) } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    return rows.map((r) => {
      const u = byId.get(r.user_id);
      const name =
        [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() || null;
      const a = u?.avatar_file_id ? avatars.get(u.avatar_file_id) : undefined;
      return {
        userId: r.user_id,
        displayName: name,
        username:
          u?.attorney_profile?.username ?? u?.client_profile?.username ?? null,
        avatarUrl: a?.url256 ?? a?.url ?? null,
        status: r.status as CallParticipantDto['status'],
        muted: r.muted,
        mutedByHost: r.muted_by_host,
        joinedAt: r.joined_at,
      };
    });
  }

  /** `call:participants` to everyone in (or ringing for) the call. */
  private async broadcastParticipants(
    callId: string,
    extra: string[] = [],
  ): Promise<void> {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call?.is_group) return;
    const rows = await this.rowsOf(callId);
    const ids = [...new Set([...this.audience(call, rows), ...extra])];
    this.realtime.toUsers(ids, 'call:participants', {
      callId,
      hostId: this.hostOf(call, rows),
      participants: await this.participantDtos(rows),
    });
  }

  /** Turns a two-person call into a group call (idempotent). */
  private async ensureGroup(call: Call): Promise<Call> {
    if (call.is_group) return call;
    const joinedAt = call.answered_at ?? new Date();
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.call.update({
        where: { id: call.id },
        data: { is_group: true },
      });
      for (const uid of [call.caller_id, call.callee_id]) {
        await tx.callParticipant.upsert({
          where: { call_id_user_id: { call_id: call.id, user_id: uid } },
          create: {
            call_id: call.id,
            user_id: uid,
            status: 'joined',
            joined_at: joinedAt,
          },
          update: {},
        });
      }
      return fresh;
    });
  }

  /** POST /calls/:id/participants — a member adds a person to the call. */
  async invite(
    user: RequestUser,
    id: string,
    dto: InviteCallDto,
  ): Promise<CallDto> {
    await this.sweep();
    let call = await this.load(user, id);
    if (call.status !== 'active') throw conflict();
    const me = await this.rowOf(call.id, user.sub);
    const isMember = call.is_group
      ? me?.status === 'joined'
      : call.caller_id === user.sub || call.callee_id === user.sub;
    if (!isMember) throw notFound();

    const targetId = await this.resolveInvitee(dto);
    if (!targetId || targetId === user.sub) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    // Owner 2026-10-20 (like Telegram): anyone found by @username or from
    // the contacts may be added, not only the people of an accepted bid or
    // case. What still applies: blocks, the invitee's "who can call me"
    // (assertMayCall), a busy invitee and the size of the call.
    await this.blocks.assertNotBlocked(user.sub, targetId);
    if (
      this.entitlements &&
      !(await this.entitlements.has(user.sub, 'calls'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include calls.',
      });
    }

    const rows = call.is_group ? await this.rowsOf(call.id) : [];
    const current = call.is_group
      ? rows.filter((r) => IN_CALL.includes(r.status))
      : [];
    const size = call.is_group ? current.length : 2;
    const max = call.video ? GROUP_MAX_VIDEO : GROUP_MAX_AUDIO;
    if (current.some((r) => r.user_id === targetId))
      return this.toDto(call, user.sub);
    if (
      !call.is_group &&
      (targetId === call.caller_id || targetId === call.callee_id)
    ) {
      return this.toDto(call, user.sub);
    }
    if (size >= max) {
      throw new ConflictException({
        code: ErrorCode.CALL_STATE_CONFLICT,
        message: 'The call is full.',
      });
    }
    if (await this.liveCallOf(targetId)) {
      throw new ConflictException({
        code: ErrorCode.CALL_IN_PROGRESS,
        message: 'That person is in another call.',
      });
    }

    // Removed by the host: nobody can bring them back into this call.
    if (rows.some((r) => r.user_id === targetId && r.status === 'removed')) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'That person was removed from the call.',
      });
    }
    await this.assertMayCall(user.sub, targetId);

    call = await this.ensureGroup(call);
    await this.prisma.callParticipant.upsert({
      where: { call_id_user_id: { call_id: call.id, user_id: targetId } },
      create: {
        call_id: call.id,
        user_id: targetId,
        invited_by_id: user.sub,
        status: 'invited',
      },
      update: {
        invited_by_id: user.sub,
        status: 'invited',
        invited_at: new Date(),
        joined_at: null,
        left_at: null,
        muted: false,
        muted_by_host: false,
      },
    });
    this.realtime.toUsers(
      [targetId],
      call.group_id ? 'call:invite' : 'call:incoming',
      { call: await this.toDto(call, targetId) },
    );
    await this.push.enqueueCall({ recipientId: targetId, callId: call.id });
    await this.broadcastParticipants(call.id);
    return this.toDto(call, user.sub);
  }

  /** The invitee's privacy setting "who can call me" (an added person is a
   * call to them like any other). */
  private async assertMayCall(inviterId: string, inviteeId: string) {
    await this.privacy?.assertAllowed(inviterId, inviteeId, 'call');
  }

  private async resolveInvitee(dto: InviteCallDto): Promise<string | null> {
    if (dto.userId) {
      const u = await this.prisma.user.findFirst({
        where: { id: dto.userId, status: 'active' },
        select: { id: true },
      });
      return u?.id ?? null;
    }
    const handle = dto.username?.trim().replace(/^@/, '').toLowerCase();
    if (!handle) return null;
    const u = await this.prisma.user.findFirst({
      where: {
        status: 'active',
        OR: [
          { attorney_profile: { username_lower: handle } },
          { client_profile: { username_lower: handle } },
        ],
      },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  /** An invited person picks up (POST /calls/:id/accept). */
  private async joinAsInvitee(
    user: RequestUser,
    call: Call,
    row: CallParticipant,
  ): Promise<CallDto> {
    if (call.status !== 'active') throw conflict();
    const { count } = await this.prisma.callParticipant.updateMany({
      where: { id: row.id, status: 'invited' },
      data: { status: 'joined', joined_at: new Date() },
    });
    if (count === 0) throw conflict();
    this.realtime.toUsers([user.sub], 'call:accepted', {
      call: await this.toDto(call, user.sub),
    });
    // Their other devices stop ringing.
    await this.push.enqueueCallEnded({
      recipientId: user.sub,
      callId: call.id,
    });
    await this.broadcastParticipants(call.id);
    return this.toDto(call, user.sub);
  }

  /** An invited person says no (POST /calls/:id/decline). */
  private async declineInvite(
    user: RequestUser,
    call: Call,
    row: CallParticipant,
  ): Promise<CallDto> {
    await this.prisma.callParticipant.updateMany({
      where: { id: row.id, status: 'invited' },
      data: { status: 'declined', left_at: new Date() },
    });
    await this.push.enqueueCallEnded({
      recipientId: user.sub,
      callId: call.id,
    });
    await this.broadcastParticipants(call.id, [user.sub]);
    return this.toDto(call, user.sub);
  }

  /** A joined member hangs up a group call: they leave, the call goes on
   * while two or more are in it. */
  private async leaveGroup(
    user: RequestUser,
    call: Call,
    row: CallParticipant,
  ): Promise<CallDto> {
    await this.prisma.callParticipant.updateMany({
      where: { id: row.id, status: 'joined' },
      data: { status: 'left', left_at: new Date() },
    });
    const rows = await this.rowsOf(call.id);
    const joined = rows.filter((r) => r.status === 'joined');
    if (joined.length < 2) {
      return this.finish(call, 'ended', user.sub);
    }
    await this.push.enqueueCallEnded({
      recipientId: user.sub,
      callId: call.id,
      ended: true,
    });
    await this.broadcastParticipants(call.id, [user.sub]);
    return this.toDto(call, user.sub);
  }

  private async hostOnly(
    user: RequestUser,
    id: string,
  ): Promise<{ call: Call; rows: CallParticipant[] }> {
    const call = await this.load(user, id);
    if (!call.is_group || call.status !== 'active') throw conflict();
    const rows = await this.rowsOf(call.id);
    if (this.hostOf(call, rows) !== user.sub) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the host can do this.',
      });
    }
    return { call, rows };
  }

  /** POST /calls/:id/participants/:userId/mute — the host switches
   * someone's microphone off (they may switch it on again). */
  async muteParticipant(
    user: RequestUser,
    id: string,
    targetId: string,
    muted: boolean,
  ): Promise<CallDto> {
    const { call, rows } = await this.hostOnly(user, id);
    const row = rows.find((r) => r.user_id === targetId);
    if (!row || row.status !== 'joined') throw notFound();
    await this.prisma.callParticipant.update({
      where: { id: row.id },
      data: muted
        ? { muted: true, muted_by_host: true }
        : { muted_by_host: false },
    });
    this.realtime.toUsers([targetId], 'call:muted', {
      callId: call.id,
      muted,
      byUserId: user.sub,
    });
    await this.broadcastParticipants(call.id);
    return this.toDto(call, user.sub);
  }

  /** DELETE /calls/:id/participants/:userId — the host removes someone. */
  async removeParticipant(
    user: RequestUser,
    id: string,
    targetId: string,
  ): Promise<CallDto> {
    const { call, rows } = await this.hostOnly(user, id);
    const row = rows.find((r) => r.user_id === targetId);
    if (!row || !IN_CALL.includes(row.status) || targetId === user.sub) {
      throw notFound();
    }
    await this.kick(call, row, user.sub);
    return this.toDto(
      await this.prisma.call.findUniqueOrThrow({ where: { id: call.id } }),
      user.sub,
    );
  }

  /** Takes a member out of the call for good: `removed` bars them from
   * joining, accepting or being invited again until a new call (the host's
   * removal and a vote both end here). */
  private async kick(
    call: Call,
    row: CallParticipant,
    byUserId: string | null,
  ): Promise<void> {
    await this.prisma.callParticipant.update({
      where: { id: row.id },
      data: { status: 'removed', left_at: new Date() },
    });
    this.realtime.toUsers([row.user_id], 'call:removed', { callId: call.id });
    await this.push.enqueueCallEnded({
      recipientId: row.user_id,
      callId: call.id,
      ended: true,
    });
    const joined = (await this.rowsOf(call.id)).filter(
      (r) => r.status === 'joined',
    );
    if (joined.length < 2) {
      await this.finish(call, 'ended', byUserId);
      return;
    }
    await this.broadcastParticipants(call.id, [row.user_id]);
  }

  // --- Vote to remove a member (owner 2026-10-21) ---------------------------

  /** Somebody who runs the call is in it: the starter or a group admin. */
  private async isModerated(
    call: Call,
    rows: CallParticipant[],
  ): Promise<boolean> {
    const joined = new Set(
      rows.filter((r) => r.status === 'joined').map((r) => r.user_id),
    );
    if (joined.has(call.caller_id)) return true;
    if (!call.group_id || !this.groups) return false;
    const admins = await this.groups.adminIds(call.group_id);
    return admins.some((a) => joined.has(a));
  }

  private async openVoteDtoOf(
    call: Call,
    rows: CallParticipant[],
    viewerId: string,
  ): Promise<CallVoteDto | null> {
    if (!call.is_group || call.status !== 'active') return null;
    const vote = await this.openVoteOf(call.id);
    return vote ? this.voteDto(vote, rows, viewerId) : null;
  }

  private openVoteOf(callId: string) {
    return this.prisma.callVote.findFirst({
      where: { call_id: callId, status: 'open' },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Counts a vote among the people who can vote now (in the call, not the
   * candidate). Passes when "for" is strictly more than "against". */
  private tally(vote: CallVote, rows: CallParticipant[]) {
    const ballots = (vote.ballots ?? {}) as Record<string, boolean>;
    const voters = rows
      .filter((r) => r.status === 'joined' && r.user_id !== vote.target_id)
      .map((r) => r.user_id);
    let forCount = 0;
    let againstCount = 0;
    for (const v of voters) {
      if (ballots[v] === true) forCount++;
      else if (ballots[v] === false) againstCount++;
    }
    return { voters, forCount, againstCount, ballots };
  }

  private voteDto(
    vote: CallVote,
    rows: CallParticipant[],
    viewerId: string,
  ): CallVoteDto {
    const t = this.tally(vote, rows);
    return {
      id: vote.id,
      targetId: vote.target_id,
      startedById: vote.started_by_id,
      forCount: t.forCount,
      againstCount: t.againstCount,
      voters: t.voters.length,
      expiresAt: vote.expires_at,
      myBallot: viewerId in t.ballots ? t.ballots[viewerId] : null,
    };
  }

  /** The outcome if it is already settled (everyone voted, or the rest can
   * no longer change it), or — at the deadline — by the count. */
  private verdict(
    vote: CallVote,
    rows: CallParticipant[],
    now: Date,
  ): 'passed' | 'failed' | null {
    const t = this.tally(vote, rows);
    const undecided = t.voters.length - t.forCount - t.againstCount;
    if (t.forCount > t.againstCount + undecided) return 'passed';
    if (t.forCount + undecided <= t.againstCount) return 'failed';
    if (undecided === 0 || vote.expires_at <= now) {
      return t.forCount > t.againstCount ? 'passed' : 'failed';
    }
    return null;
  }

  /** `call:vote` to everyone in the call, each with their own ballot. */
  private async broadcastVote(
    call: Call,
    vote: CallVote,
    result: 'open' | 'passed' | 'failed',
    extra: string[] = [],
  ): Promise<void> {
    const rows = await this.rowsOf(call.id);
    const ids = [
      ...new Set([
        ...rows.filter((r) => r.status === 'joined').map((r) => r.user_id),
        ...extra,
      ]),
    ];
    for (const uid of ids) {
      this.realtime.toUsers([uid], 'call:vote', {
        callId: call.id,
        result,
        targetId: vote.target_id,
        vote: result === 'open' ? this.voteDto(vote, rows, uid) : null,
      });
    }
  }

  /** Ends the vote when it is settled; removes the member if it passed. */
  private async settleVote(call: Call, vote: CallVote): Promise<void> {
    const rows = await this.rowsOf(call.id);
    const result = this.verdict(vote, rows, new Date());
    if (!result) return;
    const { count } = await this.prisma.callVote.updateMany({
      where: { id: vote.id, status: 'open' },
      data: { status: result },
    });
    if (count === 0) return;
    const target = rows.find((r) => r.user_id === vote.target_id);
    if (result === 'passed' && target && IN_CALL.includes(target.status)) {
      await this.kick(call, target, null);
    }
    await this.broadcastVote(call, vote, result, [vote.target_id]);
  }

  /** POST /calls/:id/votes — a member proposes to remove another. */
  async startVote(
    user: RequestUser,
    id: string,
    targetId: string,
  ): Promise<CallDto> {
    await this.sweep();
    const call = await this.load(user, id);
    if (!call.is_group || call.status !== 'active') throw conflict();
    const rows = await this.rowsOf(call.id);
    const me = rows.find((r) => r.user_id === user.sub);
    const target = rows.find((r) => r.user_id === targetId);
    if (me?.status !== 'joined') throw notFound();
    if (!target || target.status !== 'joined' || targetId === user.sub) {
      throw notFound();
    }
    // Owner 2026-10-21: a vote to remove someone is open to everyone in the
    // call, the host and admins included — whether or not they are there.
    if (await this.openVoteOf(call.id)) throw conflict();
    // Two people left besides the candidate or fewer: nobody to outvote.
    if (rows.filter((r) => r.status === 'joined').length < 3) throw conflict();
    const vote = await this.prisma.callVote.create({
      data: {
        call_id: call.id,
        target_id: targetId,
        started_by_id: user.sub,
        // The proposer is "for".
        ballots: { [user.sub]: true },
        expires_at: new Date(Date.now() + CALL_VOTE_MS),
      },
    });
    await this.broadcastVote(call, vote, 'open', [targetId]);
    await this.settleVote(call, vote);
    return this.toDto(
      await this.prisma.call.findUniqueOrThrow({ where: { id: call.id } }),
      user.sub,
    );
  }

  /** POST /calls/:id/votes/:voteId — a ballot (changeable until it ends). */
  async castVote(
    user: RequestUser,
    id: string,
    voteId: string,
    favor: boolean,
  ): Promise<CallDto> {
    const call = await this.load(user, id);
    if (!call.is_group || call.status !== 'active') throw conflict();
    const vote = await this.prisma.callVote.findFirst({
      where: { id: voteId, call_id: call.id },
    });
    if (!vote) throw notFound();
    if (vote.status !== 'open') throw conflict();
    const rows = await this.rowsOf(call.id);
    const me = rows.find((r) => r.user_id === user.sub);
    if (me?.status !== 'joined' || user.sub === vote.target_id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You cannot vote on this.',
      });
    }
    // Atomic: two ballots at once must both count.
    const fresh = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM call_votes WHERE id = ${vote.id}::uuid FOR UPDATE`;
      const cur = await tx.callVote.findUniqueOrThrow({
        where: { id: vote.id },
      });
      if (cur.status !== 'open') return cur;
      const ballots = { ...((cur.ballots ?? {}) as Record<string, boolean>) };
      ballots[user.sub] = favor;
      return tx.callVote.update({ where: { id: cur.id }, data: { ballots } });
    });
    if (fresh.status === 'open') {
      await this.broadcastVote(call, fresh, 'open', [fresh.target_id]);
      await this.settleVote(call, fresh);
    }
    return this.toDto(
      await this.prisma.call.findUniqueOrThrow({ where: { id: call.id } }),
      user.sub,
    );
  }

  /** Votes past their deadline are counted (cron + call reads). */
  private async sweepVotes(now: Date): Promise<void> {
    const due = await this.prisma.callVote.findMany({
      where: { status: 'open', expires_at: { lte: now } },
      take: 100,
    });
    for (const vote of due) {
      const call = await this.prisma.call.findUnique({
        where: { id: vote.call_id },
      });
      if (!call || call.status !== 'active') {
        await this.prisma.callVote.updateMany({
          where: { id: vote.id, status: 'open' },
          data: { status: 'failed' },
        });
        continue;
      }
      await this.settleVote(call, vote);
    }
  }

  /** POST /calls/:id/mute-state — a member tells the others their own
   * microphone is off / on (the mute icon in the list). */
  async setMuteState(
    user: RequestUser,
    id: string,
    muted: boolean,
  ): Promise<CallDto> {
    const call = await this.load(user, id);
    if (!call.is_group || call.status !== 'active') {
      return this.toDto(call, user.sub);
    }
    await this.prisma.callParticipant.updateMany({
      where: { call_id: call.id, user_id: user.sub, status: 'joined' },
      data: muted ? { muted: true } : { muted: false, muted_by_host: false },
    });
    await this.broadcastParticipants(call.id);
    return this.toDto(call, user.sub);
  }

  /** Invited people nobody answered for too long: missed. */
  private async sweepInvites(now: Date): Promise<void> {
    const stale = await this.prisma.callParticipant.findMany({
      where: {
        status: 'invited',
        invited_at: { lt: new Date(now.getTime() - CALL_RING_TIMEOUT_MS) },
        call: { status: 'active' },
      },
      take: 200,
    });
    for (const row of stale) {
      const { count } = await this.prisma.callParticipant.updateMany({
        where: { id: row.id, status: 'invited' },
        data: { status: 'declined', left_at: now },
      });
      if (count === 0) continue;
      await this.push.enqueueCallEnded({
        recipientId: row.user_id,
        callId: row.call_id,
      });
      this.realtime.toUsers([row.user_id], 'call:ended', {
        call: await this.toDtoById(row.call_id, row.user_id),
      });
      await this.broadcastParticipants(row.call_id);
      await this.endIfAlone(row.call_id);
    }
  }

  /** A joined member of a group call whose app has been silent for
   * `CALL_SILENT_MS` (swiped away, dead network) leaves it; the call goes on
   * for the rest, or ends when fewer than two remain. Without this a person
   * stayed "in a call" for ever: every next call said 409. */
  private async sweepSilentMembers(now: Date): Promise<void> {
    const silent = await this.prisma.callParticipant.findMany({
      where: {
        status: 'joined',
        updated_at: { lt: new Date(now.getTime() - CALL_SILENT_MS) },
        call: { status: 'active', is_group: true },
      },
      take: 200,
    });
    for (const row of silent) {
      const { count } = await this.prisma.callParticipant.updateMany({
        where: { id: row.id, status: 'joined' },
        data: { status: 'left', left_at: now },
      });
      if (count === 0) continue;
      await this.push.enqueueCallEnded({
        recipientId: row.user_id,
        callId: row.call_id,
        ended: true,
      });
      const call = await this.prisma.call.findUnique({
        where: { id: row.call_id },
      });
      if (!call || call.status !== 'active') continue;
      const joined = (await this.rowsOf(call.id)).filter(
        (r) => r.status === 'joined',
      );
      if (joined.length < 2) {
        await this.finish(call, 'ended', null);
      } else {
        await this.broadcastParticipants(call.id, [row.user_id]);
      }
    }
  }

  /** A group-chat call whose host is left alone with nobody still ringing
   * is over (like WhatsApp: "no answer"). */
  private async endIfAlone(callId: string): Promise<void> {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call?.group_id || call.status !== 'active') return;
    const rows = await this.rowsOf(callId);
    const joined = rows.filter((r) => r.status === 'joined').length;
    if (joined < 2 && !rows.some((r) => r.status === 'invited')) {
      await this.finish(call, 'ended', null);
    }
  }

  private async toDtoById(callId: string, viewerId: string) {
    const call = await this.prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    return this.toDto(call, viewerId);
  }

  /** The finished call as a chat message (sender = caller). */
  private async logCall(call: Call, outcome: Outcome): Promise<void> {
    // A call from a group chat has no one-to-one chat to log into.
    const conversationId = call.conversation_id;
    if (!conversationId) return;
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversation_id: conversationId,
          sender_id: call.caller_id,
          type: 'call',
          body_original: outcome,
          body_display: outcome,
          client_message_id: `call:${call.id}`,
          duration_ms: (call.duration_sec ?? 0) * 1000,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: msg.created_at, last_message_id: msg.id },
      });
      // The caller has "read" their own call entry.
      await tx.conversationParticipant.updateMany({
        where: {
          conversation_id: conversationId,
          user_id: call.caller_id,
        },
        data: { last_read_message_id: msg.id },
      });
      return msg;
    });
    const unanswered =
      outcome === 'missed' || outcome === 'canceled' || outcome === 'busy';
    await this.chat.announce(m, unanswered ? call.callee_id : undefined);
  }

  private async assertSubscription(conv: Conversation): Promise<void> {
    // Owner 2026-10-17: only attorney ↔ client calls need the attorney's
    // subscription; client ↔ client and attorney ↔ attorney are free.
    if (conv.pair_kind !== 'attorney_client') return;
    if (!(await this.subscriptions.isActive(conv.attorney_id))) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'The attorney needs an active subscription for calls.',
      });
    }
  }

  private async liveCallOf(userId: string): Promise<{ id: string } | null> {
    const live = await this.prisma.call.findFirst({
      where: {
        status: { in: LIVE },
        OR: [
          // A group call counts only while the person is still in it.
          {
            is_group: false,
            OR: [{ caller_id: userId }, { callee_id: userId }],
          },
          {
            is_group: true,
            participants: {
              some: { user_id: userId, status: { in: IN_CALL } },
            },
          },
        ],
      },
    });
    // A call nobody has asked about for a while (both apps gone, the end
    // request lost) must not keep its people "busy" for ever: the apps
    // refresh it every few seconds (GET /calls/:id), so a silent one is
    // over (owner 2026-10-20: "you are already in a call" after a video
    // call that had ended).
    if (
      live &&
      live.status === 'active' &&
      live.updated_at.getTime() < Date.now() - CALL_SILENT_MS
    ) {
      await this.finish(live, 'ended', null);
      return null;
    }
    return live;
  }

  private async load(user: RequestUser, id: string): Promise<Call> {
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call) throw notFound();
    if (call.caller_id === user.sub || call.callee_id === user.sub) return call;
    if (call.is_group && (await this.rowOf(call.id, user.sub))) return call;
    throw notFound();
  }

  private rowOf(callId: string, userId: string) {
    return this.prisma.callParticipant.findUnique({
      where: { call_id_user_id: { call_id: callId, user_id: userId } },
    });
  }

  private rowsOf(callId: string) {
    return this.prisma.callParticipant.findMany({
      where: { call_id: callId },
      orderBy: { invited_at: 'asc' },
    });
  }

  /** Who can mute / remove others: the caller while they are in the call,
   * else whoever joined first. Null for a plain two-person call. */
  private hostOf(call: Call, rows: CallParticipant[]): string | null {
    if (!call.is_group) return null;
    const joined = rows
      .filter((r) => r.status === 'joined')
      .sort(
        (a, b) => (a.joined_at?.getTime() ?? 0) - (b.joined_at?.getTime() ?? 0),
      );
    if (joined.some((r) => r.user_id === call.caller_id)) return call.caller_id;
    return joined[0]?.user_id ?? null;
  }

  /** Everyone who should hear about the call: both original members of a
   * plain call, or the joined and invited of a group call. */
  private audience(call: Call, rows: CallParticipant[]): string[] {
    if (!call.is_group) return [call.caller_id, call.callee_id];
    return rows.filter((r) => IN_CALL.includes(r.status)).map((r) => r.user_id);
  }

  /**
   * The call as [viewerId] sees it. Built in the viewer's own context, not
   * the context of whoever made the request: an incoming-call event for the
   * callee must follow the callee's photo rights (a hidden photo shows as
   * initials), not the caller's.
   */
  private toDto(call: Call, viewerId: string): Promise<CallDto> {
    return viewerContext.run(viewerId, () => this.buildDto(call, viewerId));
  }

  private async buildDto(call: Call, viewerId: string): Promise<CallDto> {
    const rows = call.is_group ? await this.rowsOf(call.id) : [];
    // An invited person sees who invited them as the "peer".
    const inviter = rows.find((r) => r.user_id === viewerId)?.invited_by_id;
    const peerId =
      inviter ??
      (call.caller_id === viewerId ? call.callee_id : call.caller_id);
    const peer = await this.prisma.user.findUnique({
      where: { id: peerId },
      select: {
        id: true,
        role: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    });
    const avatars = await this.files.avatarUrlsMany([peer?.avatar_file_id]);
    const name =
      [peer?.first_name, peer?.last_name].filter(Boolean).join(' ').trim() ||
      null;
    return {
      id: call.id,
      conversationId: call.conversation_id,
      groupId: call.group_id,
      callerId: call.caller_id,
      calleeId: call.callee_id,
      status: call.status,
      video: call.video,
      outgoing: call.caller_id === viewerId,
      peer: {
        id: peerId,
        displayName: name,
        username:
          peer?.attorney_profile?.username ??
          peer?.client_profile?.username ??
          null,
        avatarUrl: peer?.avatar_file_id
          ? (avatars.get(peer.avatar_file_id)?.url ??
            avatars.get(peer.avatar_file_id)?.url256 ??
            null)
          : null,
        kind: peer?.role === 'attorney' ? 'attorney' : 'client',
      },
      group: call.is_group,
      hostId: this.hostOf(call, rows),
      participants: await this.participantDtos(rows),
      moderated: call.is_group ? await this.isModerated(call, rows) : true,
      vote: await this.openVoteDtoOf(call, rows, viewerId),
      createdAt: call.created_at,
      answeredAt: call.answered_at,
      endedAt: call.ended_at,
      durationSec: call.duration_sec,
    };
  }
}
