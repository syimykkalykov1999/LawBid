import { createHmac } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Call, CallStatus, Conversation } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { ChatService } from '../chat/chat.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushQueueService } from '../notifications/push/push-queue.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import type { CallDto, EndCallDto, IceServersDto } from './calls.dto';

/** Unanswered after this → missed (the app gives up at 45 s). */
export const CALL_RING_TIMEOUT_MS = 60_000;
/** A call nobody ended (both apps died) is closed after this. */
export const CALL_MAX_ACTIVE_MS = 4 * 60 * 60 * 1000;
const LIVE: CallStatus[] = ['ringing', 'active'];
const TURN_TTL_SEC = 3600;

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
  ) {}

  /** POST /conversations/:id/calls */
  async start(user: RequestUser, conversationId: string): Promise<CallDto> {
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
    await this.blocks.assertNotBlocked(user.sub, callee);
    await this.assertSubscription(conv);
    await this.limits.consume('message', user.sub);
    await this.sweep();

    if (await this.liveCallOf(user.sub)) {
      throw new ConflictException({
        code: ErrorCode.CALL_IN_PROGRESS,
        message: 'You are already in a call.',
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
        },
      });
      await this.logCall(busy, 'busy');
      return this.toDto(busy, user.sub);
    }

    const call = await this.prisma.call.create({
      data: {
        conversation_id: conv.id,
        caller_id: user.sub,
        callee_id: callee,
      },
    });
    this.realtime.toUsers([callee], 'call:incoming', {
      call: await this.toDto(call, callee),
    });
    await this.push.enqueueCall({ recipientId: callee, callId: call.id });
    return this.toDto(call, user.sub);
  }

  /** POST /calls/:id/accept — the callee picks up. */
  async accept(user: RequestUser, id: string): Promise<CallDto> {
    await this.sweep();
    const call = await this.load(user, id);
    if (call.callee_id !== user.sub) throw notFound();
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
    return this.toDto(fresh, user.sub);
  }

  /** POST /calls/:id/decline — the callee rejects a ringing call. */
  async decline(user: RequestUser, id: string): Promise<CallDto> {
    const call = await this.load(user, id);
    if (call.callee_id !== user.sub) throw notFound();
    if (call.status !== 'ringing') return this.toDto(call, user.sub);
    return this.finish(call, 'declined', user.sub);
  }

  /** POST /calls/:id/end — hang up (either side), idempotent. */
  async end(user: RequestUser, id: string, dto: EndCallDto): Promise<CallDto> {
    const call = await this.load(user, id);
    if (!LIVE.includes(call.status)) return this.toDto(call, user.sub);
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
    return this.toDto(await this.load(user, id), user.sub);
  }

  /** GET /calls/ice-servers — STUN + short-lived TURN login (RFC 7635
   * style "TURN REST API": username = expiry:userId, password =
   * base64(HMAC-SHA1(TURN_SECRET, username))). */
  iceServers(user: RequestUser): IceServersDto {
    const stun = (
      this.config.get<string>('STUN_URLS') ?? 'stun:stun.l.google.com:19302'
    )
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const out: IceServersDto = {
      iceServers: [{ urls: stun, username: null, credential: null }],
      ttlSec: TURN_TTL_SEC,
    };
    const turn = (this.config.get<string>('TURN_URLS') ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const secret = this.config.get<string>('TURN_SECRET');
    if (turn.length > 0 && secret) {
      const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SEC}:${user.sub}`;
      out.iceServers.push({
        urls: turn,
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
            answered_at: {
              lt: new Date(now.getTime() - CALL_MAX_ACTIVE_MS),
            },
          },
        ],
      },
      take: 200,
    });
    for (const c of stale) {
      await this.finish(c, c.status === 'ringing' ? 'missed' : 'ended', null);
    }
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
      await this.logCall(fresh, outcome);
      for (const uid of [call.caller_id, call.callee_id]) {
        this.realtime.toUsers([uid], 'call:ended', {
          call: await this.toDto(fresh, uid),
        });
      }
      if (outcome === 'missed' || outcome === 'canceled') {
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

  /** The finished call as a chat message (sender = caller). */
  private async logCall(call: Call, outcome: Outcome): Promise<void> {
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversation_id: call.conversation_id,
          sender_id: call.caller_id,
          type: 'call',
          body_original: outcome,
          body_display: outcome,
          client_message_id: `call:${call.id}`,
          duration_ms: (call.duration_sec ?? 0) * 1000,
        },
      });
      await tx.conversation.update({
        where: { id: call.conversation_id },
        data: { last_message_at: msg.created_at, last_message_id: msg.id },
      });
      // The caller has "read" their own call entry.
      await tx.conversationParticipant.updateMany({
        where: {
          conversation_id: call.conversation_id,
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
    if (!(await this.subscriptions.isActive(conv.attorney_id))) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'The attorney needs an active subscription for calls.',
      });
    }
  }

  private liveCallOf(userId: string) {
    return this.prisma.call.findFirst({
      where: {
        status: { in: LIVE },
        OR: [{ caller_id: userId }, { callee_id: userId }],
      },
      select: { id: true },
    });
  }

  private async load(user: RequestUser, id: string): Promise<Call> {
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call || (call.caller_id !== user.sub && call.callee_id !== user.sub)) {
      throw notFound();
    }
    return call;
  }

  private async toDto(call: Call, viewerId: string): Promise<CallDto> {
    const peerId =
      call.caller_id === viewerId ? call.callee_id : call.caller_id;
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
      callerId: call.caller_id,
      calleeId: call.callee_id,
      status: call.status,
      outgoing: call.caller_id === viewerId,
      peer: {
        id: peerId,
        displayName: name,
        username:
          peer?.attorney_profile?.username ??
          peer?.client_profile?.username ??
          null,
        avatarUrl: peer?.avatar_file_id
          ? (avatars.get(peer.avatar_file_id)?.url256 ?? null)
          : null,
        kind: peer?.role === 'attorney' ? 'attorney' : 'client',
      },
      createdAt: call.created_at,
      answeredAt: call.answered_at,
      endedAt: call.ended_at,
      durationSec: call.duration_sec,
    };
  }
}
