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

export type RealtimeEvent =
  | 'message:new'
  | 'message:read'
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

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.emitter = new Emitter(redis).of(REALTIME_NAMESPACE);
  }

  toUsers(userIds: string[], event: RealtimeEvent, data: unknown): void {
    if (userIds.length === 0) return;
    try {
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
