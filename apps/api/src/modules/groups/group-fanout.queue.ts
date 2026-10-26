import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import { shardCarry } from '../../sharding/shard-context';
import { bullOptions } from '../../redis/redis-connection';

/**
 * Owner 2026-10-22 (server load audit, finding 7): a group message used to
 * reach its members inside the sender's request — an emit, a badge update
 * and a push job per member (up to 512). The request now stores the row and
 * queues one job; the job (GroupsService.deliverFanOut, run by
 * GroupFanoutWorker) sends one realtime event to all members, updates the
 * badges in batches and queues the pushes 500 people per job.
 *
 * Order: every realtime event of a group (new message, edit, delete,
 * reaction, pin, service line) goes through the same queue, so members get
 * them in the order they happened. A group always maps to the same
 * partition, and each partition runs one job at a time across all
 * processes (BullMQ global concurrency 1); different groups run in
 * parallel on the other partitions.
 */
export const GROUP_FANOUT_QUEUE_PREFIX = 'group-fanout';
/** Partitions = groups delivered in parallel cluster-wide. */
export const GROUP_FANOUT_PARTITIONS = 8;
export const GROUP_FANOUT_JOB = 'group.fanout';

export const GROUP_FANOUT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
} as const;

export interface GroupFanoutJob {
  /** `message`: a new message (unhide, event, badges, pushes);
   * `broadcast`: an existing message changed (the event only). */
  kind: 'message' | 'broadcast';
  groupId: string;
  messageId: string;
  /** `message` only: false = no push (earlier messages of a forwarded
   * batch). */
  push?: boolean;
  /** The demo world (src/common/demo): the job reads the demo database. */
  demo?: boolean;
  /** Shard context of the enqueuer (shard-ready step 4), `shard:N`. */
  shardKey?: string;
}

/** FNV-1a: a group's partition, stable across processes and restarts. */
export function fanoutPartition(
  groupId: string,
  partitions: number = GROUP_FANOUT_PARTITIONS,
): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < groupId.length; i++) {
    h ^= groupId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % partitions;
}

export function fanoutQueueName(partition: number): string {
  return `${GROUP_FANOUT_QUEUE_PREFIX}-${partition}`;
}

/**
 * Producer side (GroupsService). Without Redis (unit tests) — or when
 * queueing fails — the delivery runs inline, so members still get the
 * message; the REST reads stay the source of truth either way.
 */
@Injectable()
export class GroupFanoutQueue
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queues?: Queue<GroupFanoutJob>[];

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GroupFanoutQueue.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.queues = Array.from(
      { length: GROUP_FANOUT_PARTITIONS },
      (_, i) =>
        new Queue<GroupFanoutJob>(
          fanoutQueueName(i),
          bullOptions(fanoutQueueName(i), url),
        ),
    );
    // One job at a time per partition, whichever process runs it.
    await Promise.all(
      this.queues.map((q) =>
        q
          .setGlobalConcurrency(1)
          .catch((error: unknown) =>
            this.logger.warn(
              { queue: q.name, err: errMsg(error) },
              'group fan-out concurrency not set',
            ),
          ),
      ),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all((this.queues ?? []).map((q) => q.close()));
  }

  /** Queues [job] (jobId [jobId]: a retried request queues nothing new)
   * on its group's partition, or runs [inline]. */
  async enqueue(
    job: Omit<GroupFanoutJob, 'demo' | 'shardKey'>,
    jobId: string,
    inline: () => Promise<void>,
  ): Promise<void> {
    const queue = this.queues?.[fanoutPartition(job.groupId)];
    if (!queue) return inline();
    try {
      await queue.add(
        GROUP_FANOUT_JOB,
        {
          ...job,
          ...(demoContext.isDemo() ? { demo: true } : {}),
          ...shardCarry(),
        },
        { ...GROUP_FANOUT_JOB_OPTS, jobId },
      );
    } catch (error) {
      this.logger.warn(
        { groupId: job.groupId, messageId: job.messageId, err: errMsg(error) },
        'group fan-out enqueue failed, delivering inline',
      );
      await inline();
    }
  }
}

function errMsg(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

/**
 * Owner 2026-10-22 (finding 7): `group:message` carries two personal flags
 * (`mine`, `mentionsMe`). Members are grouped by those flags, so the event
 * goes out as at most four publishes (usually two: the sender, everyone
 * else) instead of one per member.
 */
export function broadcastAudiences(
  memberIds: string[],
  senderId: string | null,
  mentionIds: string[],
  deleted: boolean,
): { userIds: string[]; mine: boolean; mentionsMe: boolean }[] {
  const mentioned = new Set(deleted ? [] : mentionIds);
  const groups = new Map<
    string,
    { userIds: string[]; mine: boolean; mentionsMe: boolean }
  >();
  for (const uid of memberIds) {
    const mine = senderId === uid;
    const mentionsMe = mentioned.has(uid);
    const key = `${mine ? 1 : 0}${mentionsMe ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { userIds: [], mine, mentionsMe }));
    g.userIds.push(uid);
  }
  return [...groups.values()];
}
