import {
  Injectable,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
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
 * them in the order they happened. (While the admin changes the number of
 * partitions, events already queued under the old number may overtake a
 * group's newest ones once; the REST reads stay the source of truth.) A group always maps to the same
 * partition, and each partition runs one job at a time across all
 * processes (BullMQ global concurrency 1); different groups run in
 * parallel on the other partitions.
 */
export const GROUP_FANOUT_QUEUE_PREFIX = 'group-fanout';
/** Partitions = groups delivered in parallel cluster-wide. Audit 17.11
 * (problem 9): the admin number `groups.fanout_partitions` (was a fixed 8
 * for the whole cluster, whatever the number of servers); this is its
 * default and the answer while settings cannot be read. */
export const GROUP_FANOUT_PARTITIONS = 64;
export const GROUP_FANOUT_PARTITIONS_SETTING = 'groups.fanout_partitions';

/** `groups.fanout_partitions`, at least 1 (unreadable → the default). */
export async function fanoutPartitions(
  settings: AppSettingsService | undefined,
): Promise<number> {
  try {
    const n = await settings?.number(GROUP_FANOUT_PARTITIONS_SETTING);
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) {
      return Math.floor(n);
    }
  } catch {
    // the default below
  }
  return GROUP_FANOUT_PARTITIONS;
}
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
  /** Producer queues by partition, opened on first use. */
  private queues?: Map<number, Queue<GroupFanoutJob>>;
  private url?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(GroupFanoutQueue.name);
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.url = url;
    this.queues = new Map();
    for (let i = 0; i < GROUP_FANOUT_PARTITIONS; i++) this.queueFor(i);
  }

  /** The producer queue of partition [i] (global concurrency 1 is set when
   * it is opened, idempotent). @internal exposed for the spec */
  queueFor(i: number): Queue<GroupFanoutJob> | undefined {
    if (!this.queues || !this.url) return undefined;
    let q = this.queues.get(i);
    if (!q) {
      q = new Queue<GroupFanoutJob>(
        fanoutQueueName(i),
        bullOptions(fanoutQueueName(i), this.url),
      );
      this.queues.set(i, q);
      this.configureInBackground([q]);
    }
    return q;
  }

  /**
   * One job at a time per partition, whichever process runs it. BullMQ
   * answers only once its connection is ready, so this is not awaited: with
   * Redis away at start the API never opened its port (load test
   * 2026-11-02, PR #606). The setting is idempotent and lands as soon as
   * Redis is reachable (BullMQ defers its own queue meta the same way).
   * @internal exposed for the spec
   */
  configureInBackground(
    queues: Iterable<Queue<GroupFanoutJob>> = this.queues?.values() ?? [],
  ): void {
    for (const q of queues) {
      void q
        .setGlobalConcurrency(1)
        .catch((error: unknown) =>
          this.logger.warn(
            { queue: q.name, err: errMsg(error) },
            'group fan-out concurrency not set',
          ),
        );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Queue.close() on the shared producer connection returns at once even
    // while Redis is away (bullmq: a shared connection is never quit here).
    await Promise.all([...(this.queues?.values() ?? [])].map((q) => q.close()));
  }

  /** Queues [job] (jobId [jobId]: a retried request queues nothing new)
   * on its group's partition, or runs [inline]. */
  async enqueue(
    job: Omit<GroupFanoutJob, 'demo' | 'shardKey'>,
    jobId: string,
    inline: () => Promise<void>,
  ): Promise<void> {
    const queue = this.queues
      ? this.queueFor(
          fanoutPartition(job.groupId, await fanoutPartitions(this.settings)),
        )
      : undefined;
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
 *
 * Groups WhatsApp parity (reactions): with [reactedBy] (who reacted with
 * which emoji) the reactors are grouped by their emoji too, so each one
 * sees their own chip marked (`mine` of ReactionDto) — one more publish per
 * distinct emoji, not one per person.
 */
export function broadcastAudiences(
  memberIds: string[],
  senderId: string | null,
  mentionIds: string[],
  deleted: boolean,
  reactedBy?: ReadonlyMap<string, string>,
): {
  userIds: string[];
  mine: boolean;
  mentionsMe: boolean;
  myEmoji?: string | null;
}[] {
  const mentioned = new Set(deleted ? [] : mentionIds);
  const groups = new Map<
    string,
    {
      userIds: string[];
      mine: boolean;
      mentionsMe: boolean;
      myEmoji?: string | null;
    }
  >();
  for (const uid of memberIds) {
    const mine = senderId === uid;
    const mentionsMe = mentioned.has(uid);
    const myEmoji = reactedBy ? (reactedBy.get(uid) ?? null) : undefined;
    const key = `${mine ? 1 : 0}${mentionsMe ? 1 : 0}${myEmoji ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      groups.set(
        key,
        (g = {
          userIds: [],
          mine,
          mentionsMe,
          ...(reactedBy ? { myEmoji } : {}),
        }),
      );
    }
    g.userIds.push(uid);
  }
  return [...groups.values()];
}
