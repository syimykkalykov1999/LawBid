import { Inject, Injectable } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** docs/05 §8.5 namespace and rooms. */
export const REALTIME_NAMESPACE = '/realtime';
export const userRoom = (id: string) => `user:${id}`;
export const conversationRoom = (id: string) => `conversation:${id}`;
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
  | 'notification:new'
  | 'badge:update';

/**
 * Publishes realtime events through Redis (the Socket.IO Redis adapter's
 * channel), so any process — every API instance and the worker — reaches
 * sockets connected to any instance. Delivery is best-effort: the DB and
 * REST stay the source of truth (§8.5), so a publish failure is swallowed.
 */
@Injectable()
export class RealtimePublisher {
  private readonly emitter: ReturnType<Emitter['of']>;
  private readonly sharded: boolean;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.emitter = new Emitter(redis).of(REALTIME_NAMESPACE);
    // Test doubles of REDIS_CLIENT without SPUBLISH keep the classic path
    // (the gateway stays on the in-memory adapter for them too).
    this.sharded =
      socketAdapterMode() === 'sharded' &&
      typeof (redis as Partial<Redis>).spublish === 'function';
  }

  /** One publish for all [userIds] (each socket gets it once), however
   * many people — callers never loop per member. */
  toUsers(userIds: string[], event: RealtimeEvent, data: unknown): void {
    if (userIds.length === 0) return;
    // The emitter publishes through ioredis and drops the returned
    // promise; on a closing connection that would surface as an unhandled
    // rejection. Best-effort delivery: skip when Redis isn't ready.
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

  /** True if the user has this conversation open on some device. */
  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    return (await this.redis.scard(viewingKey(userId, conversationId))) > 0;
  }
}
