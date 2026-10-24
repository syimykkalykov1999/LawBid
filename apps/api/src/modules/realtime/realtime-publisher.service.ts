import { Inject, Injectable } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { EVENT_LOG_MAX_FANOUT, RealtimeEventLog } from './realtime-event-log';

/** docs/05 §8.5 namespace and rooms. */
export const REALTIME_NAMESPACE = '/realtime';
/** Owner 2026-10-22: the unauthenticated namespace the website waits on
 * for its QR sign-in (QrLoginGateway); one room per code. */
export const QR_LOGIN_NAMESPACE = '/qr';
export const qrRoom = (qrId: string) => `qr:${qrId}`;
export const userRoom = (id: string) => `user:${id}`;
export const conversationRoom = (id: string) => `conversation:${id}`;
/** Owner 2026-10-22 (load audit finding 3): the sockets that have this
 * channel open (`channel:watch`) — its call changes reach only them, never
 * every subscriber. */
export const channelRoom = (id: string) => `channel:${id}`;
/** Owner 2026-10-22 (client economy plan, package F): the sockets that
 * have a post open (`post:watch`) — new comments reach only them. */
export const postRoom = (id: string) => `post:${id}`;
/** Sockets of a user that have a conversation open (push suppression,
 * §8.4 "push получателю, если он не в этой беседе"). */
export const viewingKey = (userId: string, conversationId: string) =>
  `rt:view:${userId}:${conversationId}`;

export type SocketAdapterMode = 'sharded' | 'classic';

/** Owner 2026-10-22 (server load audit, finding 5): SOCKET_IO_ADAPTER —
 * `sharded` (default) or `classic`. The gateway's adapter and this
 * publisher must agree (the API and the worker get the same env). */
export function socketAdapterMode(
  env: NodeJS.ProcessEnv = process.env,
): SocketAdapterMode {
  return env.SOCKET_IO_ADAPTER === 'classic' ? 'classic' : 'sharded';
}

/** The channel prefix @socket.io/redis-adapter uses by default. */
const CHANNEL_PREFIX = 'socket.io';
/** socket.io-adapter ClusterAdapter MessageType.BROADCAST. */
const CLUSTER_BROADCAST = 3;
/** socket.io-parser PacketType.EVENT. */
const PACKET_EVENT = 2;
/** socket.io-adapter's EMITTER_UID: a sender that is not a server. */
const EMITTER_UID = 'emitter';

/**
 * The sharded adapter's broadcast to [rooms] (createShardedAdapter,
 * subscriptionMode `dynamic`): one room → that room's own channel, so only
 * the instances holding the room read it; several rooms → the namespace's
 * channel (every instance). @socket.io/redis-emitter speaks only the
 * classic format, hence this small encoder (JSON: the payloads carry no
 * binary).
 */
export function shardedBroadcast(
  nsp: string,
  rooms: string[],
  event: string,
  data: unknown,
): { channel: string; message: string } {
  const base = `${CHANNEL_PREFIX}#${nsp}#`;
  return {
    channel: rooms.length === 1 ? `${base}${rooms[0]}#` : base,
    message: JSON.stringify({
      uid: EMITTER_UID,
      nsp,
      type: CLUSTER_BROADCAST,
      data: {
        opts: { rooms, except: [], flags: {} },
        packet: { type: PACKET_EVENT, data: [event, data], nsp },
      },
    }),
  };
}

export type RealtimeEvent =
  | 'message:new'
  // Owner 2026-10-20: edited, deleted for everyone, reaction, pin.
  | 'message:updated'
  | 'message:read'
  // Owner 2026-10-20: the message reached the other person's device.
  | 'message:delivered'
  // OQ-040: the recipient played a voice note.
  | 'message:listened'
  // OQ-041 calls: ringing, answered (stop ringing elsewhere), ended.
  | 'call:incoming'
  | 'call:accepted'
  | 'call:ended'
  // Group calls: the member list changed / the host muted or removed you.
  | 'call:participants'
  | 'call:muted'
  | 'call:removed'
  | 'call:vote'
  | 'call:invite'
  // Owner 2026-10-22 (load audit finding 3): a group's / channel's call
  // started or its people changed, and it ended — the chats tab, the open
  // group / channel and the «Return» bar update without polling.
  | 'call:ongoing'
  | 'call:ongoing_ended'
  // Owner 2026-10-20 group chats: a new / changed message (poll edits and
  // deletions included), the group's settings or member list changed, my
  // own removal (the calls thread drops the person from a running call),
  // fresh poll counters.
  | 'group:message'
  | 'group:update'
  | 'group:invite'
  | 'group:member_removed'
  | 'poll:update'
  | 'conversation:update'
  // Owner 2026-10-22 (load audit finding 2): I read a chat (any device) —
  // the chat lists drop its unread pill locally.
  | 'conversation:read'
  | 'notification:new'
  // Owner 2026-10-24: somebody opened a confidential file of mine - an open
  // view list pulls the new rows (`?since=`).
  | 'file:viewed'
  // Owner 2026-10-22 (client economy plan, package E): a case of mine
  // changed (a bid came / was accepted / declined / countered / withdrawn,
  // the case was edited / closed, a task or payment) and a consultation
  // of mine changed — the lists fix the row instead of reloading.
  | 'case:update'
  | 'consultation:update'
  // Owner 2026-10-22 (package F): a channel I read posted (to the open
  // channel's room) and a subscribed channel's counters moved (to me);
  // a comment under a post I have open (room post:{id}).
  | 'channel:post'
  | 'channel:update'
  | 'comment:new'
  | 'badge:update';

/** Owner 2026-10-22: QR sign-in status for the waiting browser (never a
 * token — it redeems through `POST /auth/qr/poll` with its secret). */
export type QrLoginEvent =
  'auth:qr_scanned' | 'auth:qr_approved' | 'auth:qr_rejected';

/**
 * Publishes realtime events through Redis (the Socket.IO Redis adapter's
 * channel), so any process — every API instance and the worker — reaches
 * sockets connected to any instance. Delivery is best-effort: the DB and
 * REST stay the source of truth (§8.5), so a publish failure is swallowed.
 */
@Injectable()
export class RealtimePublisher {
  private readonly emitter: ReturnType<Emitter['of']>;
  private readonly qrEmitter: ReturnType<Emitter['of']>;
  private readonly sharded: boolean;
  private readonly eventLog: RealtimeEventLog;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    const base = new Emitter(redis);
    this.eventLog = new RealtimeEventLog(redis);
    this.emitter = base.of(REALTIME_NAMESPACE);
    this.qrEmitter = base.of(QR_LOGIN_NAMESPACE);
    // Test doubles of REDIS_CLIENT without SPUBLISH keep the classic path
    // (the gateway stays on the in-memory adapter for them too).
    this.sharded =
      socketAdapterMode() === 'sharded' &&
      typeof (redis as Partial<Redis>).spublish === 'function';
  }

  /** One publish for all [userIds] (each socket gets it once), however
   * many people — callers never loop per member.
   *
   * Owner 2026-10-23: an object payload also carries `seq` (the cursor of
   * realtime-event-log.ts) and is kept 5 minutes per person, so a client
   * that reconnects fetches only what it missed. */
  toUsers(userIds: string[], event: RealtimeEvent, data: unknown): void {
    if (userIds.length === 0) return;
    // The emitter publishes through ioredis and drops the returned
    // promise; on a closing connection that would surface as an unhandled
    // rejection. Best-effort delivery: skip when Redis isn't ready.
    if (this.redis.status !== 'ready') return;
    const loggable =
      this.eventLog.available &&
      userIds.length <= EVENT_LOG_MAX_FANOUT &&
      typeof data === 'object' &&
      data !== null &&
      !Array.isArray(data);
    if (!loggable) {
      this.send(userIds, event, data);
      return;
    }
    void this.eventLog
      .nextSeq()
      .then(async (seq) => {
        const withSeq = { ...(data as Record<string, unknown>), seq };
        // Log first: a client that reconnects between the publish and the
        // log write would otherwise never see this event.
        await this.eventLog.append(userIds, seq, event, withSeq);
        this.send(userIds, event, withSeq);
      })
      .catch(() => this.send(userIds, event, data));
  }

  private send(userIds: string[], event: RealtimeEvent, data: unknown): void {
    if (this.redis.status !== 'ready') return;
    try {
      if (this.sharded) {
        const { channel, message } = shardedBroadcast(
          REALTIME_NAMESPACE,
          [...new Set(userIds)].map(userRoom),
          event,
          data,
        );
        void this.redis.spublish(channel, message).catch(() => undefined);
        return;
      }
      this.emitter.to(userIds.map(userRoom)).emit(event, data);
    } catch {
      // best-effort (see class doc)
    }
  }

  /** Owner 2026-10-22: one emit to a room (e.g. [channelRoom]). */
  toRoom(room: string, event: RealtimeEvent, data: unknown): void {
    if (this.redis.status !== 'ready') return;
    try {
      this.emitter.to(room).emit(event, data);
    } catch {
      // best-effort (see class doc)
    }
  }

  /**
   * Owner 2026-10-22: the QR sign-in room on the `/qr` namespace (the
   * browser showing the code). Sharded mode publishes on that room's own
   * channel, like `toUsers`.
   */
  toQr(qrId: string, event: QrLoginEvent, data: unknown): void {
    if (this.redis.status !== 'ready') return;
    try {
      if (this.sharded) {
        const { channel, message } = shardedBroadcast(
          QR_LOGIN_NAMESPACE,
          [qrRoom(qrId)],
          event,
          data,
        );
        void this.redis.spublish(channel, message).catch(() => undefined);
        return;
      }
      this.qrEmitter.to(qrRoom(qrId)).emit(event, data);
    } catch {
      // best-effort (see class doc)
    }
  }

  /** True if the user has this conversation open on some device. */
  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    return (await this.redis.scard(viewingKey(userId, conversationId))) > 0;
  }
}
