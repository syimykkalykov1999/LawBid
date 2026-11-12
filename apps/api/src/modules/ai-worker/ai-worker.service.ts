import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { AiRun, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AI_FEEDBACK_KEEP,
  fitRequest,
} from '../ai-attachments/ai-attachments.logic';
import {
  AiAttachmentsService,
  type AiAttachmentView,
  type PreparedImage,
} from '../ai-attachments/ai-attachments.service';
import { StaffAiBudgetService } from '../staff-ai/staff-ai-budget.service';
import {
  StaffAiClient,
  type AiBatchItem,
  type AiImage,
} from '../staff-ai/staff-ai-client.service';
import { costMillicents } from '../staff-ai/staff-ai-pricing';
import {
  STAFF_AI_MODELS,
  StaffAiBudgetError,
  StaffAiNotConfiguredError,
  StaffAiNotEnabledError,
  isStaffAiModel,
  type StaffAiModel,
} from '../staff-ai/staff-ai.types';
import {
  VERDICT_DECISIONS,
  VERDICT_SCHEMA,
  itemMessage,
  systemBlocks,
  type Verdict,
} from './ai-worker.prompt';
import {
  agreementStats,
  pickFeedback,
  routeLane,
  type Lane,
  type ReviewedRow,
} from './ai-worker.routing';
import {
  AI_WORKER_QUEUES,
  AiWorkerQueues,
  QUEUE_DEFAULT_MODEL,
  QUEUE_LABEL,
  isAiWorkerQueue,
  type AiWorkerQueue,
  type QueueExample,
} from './ai-worker.queues';

export const DEFAULT_MODEL: StaffAiModel = 'claude-opus-5-5';
/** One Message Batch per chunk (resumable: the chunk's state is in the rows). */
export const CHUNK = 100;
/** Room for adaptive thinking (Opus 5.5 always thinks) plus the JSON. */
const MAX_TOKENS = 4000;
const MAX_ATTEMPTS = 6;
const RUNS_PER_TICK = 5;
const ITEM_PAGE = 50;
const INSERT_PAGE = 1000;
const ACTIVE_ITEM = ['pending', 'sent', 'proposed'];
/** How many of the owner's latest decisions are read / fed back as examples. */
const FEEDBACK_READ = AI_FEEDBACK_KEEP;
/** A Message Batch may be 256 MB; the pictures of a chunk stay well under. */
const BATCH_BYTES = 150_000_000;
export const FEEDBACK_EXAMPLES = 8;

export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export class AiWorkerError extends Error {
  constructor(
    message: string,
    readonly kind: 'disabled' | 'invalid' | 'empty',
  ) {
    super(message);
    this.name = 'AiWorkerError';
  }
}

export interface RoleInput {
  name: string;
  instructions: string;
  queue: string;
  model?: string;
  confidenceMin?: number;
  auditPct?: number;
  /** Owner 2026-11-12: the role's example screenshots (exact set). */
  imageFileIds?: string[];
}

export interface ReviewInput {
  ids: string[];
  verdict: 'approved' | 'rejected';
  /** On reject: what the owner says is right (fed back as an example). */
  ownerDecision?: string;
  ownerNote?: string;
  /** Owner 2026-11-12: pictures of the correction (on reject). */
  imageFileIds?: string[];
}

export interface Proposal {
  queue: AiWorkerQueue;
  label: string;
  open: number;
  roleId: string | null;
  text: string;
  examples: QueueExample[];
}

const asQueue = (q: string): AiWorkerQueue => {
  if (!isAiWorkerQueue(q))
    throw new AiWorkerError(`Неизвестная очередь: ${q}`, 'invalid');
  return q;
};
const asModel = (m: string | undefined): StaffAiModel => {
  const model = m ?? DEFAULT_MODEL;
  if (!isStaffAiModel(model))
    throw new AiWorkerError(`Неизвестная модель: ${model}`, 'invalid');
  return model;
};

/**
 * Owner 2026-11-12 «ИИ-сотрудник» (admin only, owner only). Roles, background
 * mass runs and the review queue. The AI only proposes: approving a proposal
 * records the owner's decision; nothing here changes the queue item itself.
 * Every model call goes through StaffAiClient (master switch, key from
 * «Ключи и сервисы», monthly budget, PII scrubber).
 */
@Injectable()
export class AiWorkerService {
  private readonly logger = new Logger(AiWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: StaffAiClient,
    private readonly budget: StaffAiBudgetService,
    private readonly queues: AiWorkerQueues,
    @Optional() private readonly attachments?: AiAttachmentsService,
  ) {}

  // ------------------------------------------------------------- overview

  async status() {
    const [enabled, limit, spent, roles, runs, lanes] = await Promise.all([
      this.client.isEnabled('worker'),
      this.budget.limitMillicents(),
      this.budget.spent(),
      this.prisma.aiRole.findMany({
        where: { archived_at: null },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
      this.prisma.aiRun.findMany({
        orderBy: { created_at: 'desc' },
        take: 20,
        include: { role: { select: { name: true } } },
      }),
      this.prisma.aiRunItem.groupBy({
        by: ['lane'],
        where: { status: 'proposed' },
        _count: { _all: true },
      }),
    ]);
    const lane = (l: Lane) => lanes.find((x) => x.lane === l)?._count._all ?? 0;
    const stats = await Promise.all(roles.map((r) => this.roleStats(r.id)));
    const images =
      (await this.attachments?.views({ roleIds: roles.map((r) => r.id) })) ??
      new Map<string, AiAttachmentView[]>();
    return {
      enabled,
      budgetCents: Math.round(limit / 1000),
      spentCents: Math.round(spent / 1000),
      models: [...STAFF_AI_MODELS],
      defaultModel: DEFAULT_MODEL,
      queues: AI_WORKER_QUEUES.map((q) => ({
        key: q,
        label: QUEUE_LABEL[q],
        defaultModel: QUEUE_DEFAULT_MODEL[q],
      })),
      toReview: lane('priority') + lane('audit') + lane('bulk'),
      toReviewByLane: {
        priority: lane('priority'),
        audit: lane('audit'),
        bulk: lane('bulk'),
      },
      roles: roles.map((r, i) => ({
        id: r.id,
        name: r.name,
        instructions: r.instructions,
        queue: r.queue,
        model: r.model,
        confidenceMin: r.confidence_min,
        auditPct: r.audit_pct,
        ...stats[i],
        images: images.get(r.id) ?? [],
        createdAt: r.created_at.toISOString(),
      })),
      runs: runs.map((r) => this.runDto(r, r.role.name)),
      proposals: await this.proposals(roles),
    };
  }

  /** Per-role accuracy: how often the owner agreed with the proposals. */
  private async roleStats(roleId: string) {
    const [approved, rejected] = await Promise.all([
      this.prisma.aiRunItem.count({
        where: { status: 'approved', run: { role_id: roleId } },
      }),
      this.prisma.aiRunItem.count({
        where: { status: 'rejected', run: { role_id: roleId } },
      }),
    ]);
    const s = agreementStats({ approved, rejected });
    return {
      reviewed: s.reviewed,
      agreed: s.agreed,
      agreementPct: s.ratePct,
    };
  }

  private runDto(r: AiRun, roleName: string) {
    return {
      id: r.id,
      roleId: r.role_id,
      roleName,
      status: r.status,
      model: r.model,
      total: r.total,
      proposed: r.proposed,
      failed: r.failed,
      inFlight: r.batch_id !== null,
      costCents: r.cost_millicents / 1000,
      error: r.error,
      createdAt: r.created_at.toISOString(),
      finishedAt: r.finished_at?.toISOString() ?? null,
    };
  }

  /** «Могу взять на себя X, вот 3 примера»: open work no role covers yet,
   * or a role whose queue has items no run has taken. Counts only, no AI. */
  async proposals(
    roles: Array<{ id: string; queue: string }>,
  ): Promise<Proposal[]> {
    const out: Proposal[] = [];
    for (const queue of AI_WORKER_QUEUES) {
      const open = await this.queues.openCount(queue);
      if (open === 0) continue;
      const role = roles.find((r) => r.queue === queue) ?? null;
      const label = QUEUE_LABEL[queue];
      out.push({
        queue,
        label,
        open,
        roleId: role?.id ?? null,
        text: role
          ? `Ждут ${open}. Могу пройти их ролью — нажмите «Запустить».`
          : `Могу взять на себя «${label}»: ждут ${open}. Опишите роль один раз — дальше я готовлю предложения, вы утверждаете.`,
        examples: await this.queues.examples(queue, 3),
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- roles

  async createRole(adminId: string, input: RoleInput) {
    const queue = asQueue(input.queue);
    const r = await this.prisma.aiRole.create({
      data: {
        name: input.name.trim(),
        instructions: input.instructions.trim(),
        queue,
        // Owner 2026-11-12 (row 55): no model chosen = the queue's default.
        model: asModel(input.model ?? QUEUE_DEFAULT_MODEL[queue]),
        ...this.policy(input),
        created_by: adminId,
      },
    });
    if (input.imageFileIds !== undefined) {
      await this.attachments?.setRole(adminId, r.id, input.imageFileIds);
    }
    return { id: r.id };
  }

  async updateRole(id: string, input: Partial<RoleInput>, adminId?: string) {
    await this.role(id);
    if (input.imageFileIds !== undefined && adminId) {
      await this.attachments?.setRole(adminId, id, input.imageFileIds);
    }
    await this.prisma.aiRole.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.instructions !== undefined
          ? { instructions: input.instructions.trim() }
          : {}),
        ...(input.queue !== undefined ? { queue: asQueue(input.queue) } : {}),
        ...(input.model !== undefined ? { model: asModel(input.model) } : {}),
        ...this.policy(input),
      },
    });
    return { id };
  }

  private policy(input: Partial<RoleInput>) {
    const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
    return {
      ...(input.confidenceMin !== undefined
        ? { confidence_min: clamp(input.confidenceMin) }
        : {}),
      ...(input.auditPct !== undefined
        ? { audit_pct: clamp(input.auditPct) }
        : {}),
    };
  }

  /** The owner's latest decisions on this role, corrections first. */
  async feedback(roleId: string): Promise<ReviewedRow[]> {
    const rows = await this.prisma.aiRunItem.findMany({
      where: {
        status: { in: ['approved', 'rejected'] },
        run: { role_id: roleId },
      },
      orderBy: { reviewed_at: 'desc' },
      take: FEEDBACK_READ,
      select: {
        id: true,
        decision: true,
        confidence: true,
        status: true,
        owner_decision: true,
        owner_note: true,
        flags: true,
      },
    });
    return pickFeedback(
      rows.map((r) => ({
        id: r.id,
        decision: r.decision,
        confidence: r.confidence,
        status: r.status,
        ownerDecision: r.owner_decision,
        ownerNote: r.owner_note,
        flags: r.flags,
      })),
      FEEDBACK_EXAMPLES,
    );
  }

  async archiveRole(id: string) {
    await this.role(id);
    await this.prisma.aiRole.update({
      where: { id },
      data: { archived_at: new Date() },
    });
    await this.attachments?.closeRole(id);
    return { id };
  }

  private async role(id: string) {
    const r = await this.prisma.aiRole.findFirst({
      where: { id, archived_at: null },
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  // ----------------------------------------------------------------- runs

  /** Takes every open item of the role's queue (no cap on the owner) that is
   * not already pending or waiting for review in another run of this role. */
  async startRun(adminId: string, roleId: string, limit?: number) {
    const role = await this.role(roleId);
    if (!(await this.client.isEnabled('worker')))
      throw new AiWorkerError(
        'Режим ИИ выключен: включите мастер-тумблер «Режим ИИ для сотрудников» в Настройках.',
        'disabled',
      );
    const queue = asQueue(role.queue);
    const busy = new Set(
      (
        await this.prisma.aiRunItem.findMany({
          where: { status: { in: ACTIVE_ITEM }, run: { role_id: role.id } },
          select: { item_id: true },
        })
      ).map((i) => i.item_id),
    );
    const ids: string[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.queues.openIds(queue, INSERT_PAGE, after);
      for (const id of page) {
        if (!busy.has(id)) ids.push(id);
        if (limit && ids.length >= limit) break;
      }
      if (page.length < INSERT_PAGE || (limit && ids.length >= limit)) break;
      after = page[page.length - 1];
    }
    if (ids.length === 0)
      throw new AiWorkerError('В очереди нет новых заявок.', 'empty');
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiRun.create({
        data: {
          role_id: role.id,
          model: role.model,
          total: ids.length,
          created_by: adminId,
        },
      });
      for (let i = 0; i < ids.length; i += INSERT_PAGE) {
        await tx.aiRunItem.createMany({
          data: ids
            .slice(i, i + INSERT_PAGE)
            .map((item_id) => ({ run_id: created.id, item_id })),
          skipDuplicates: true,
        });
      }
      return created;
    });
    return { id: run.id, total: ids.length };
  }

  async cancelRun(id: string) {
    const r = await this.prisma.aiRun.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (r.status === 'queued' || r.status === 'running') {
      await this.prisma.aiRun.update({
        where: { id },
        data: { status: 'canceled', finished_at: new Date() },
      });
      await this.prisma.aiRunItem.updateMany({
        where: { run_id: id, status: 'pending' },
        data: { status: 'skipped', error: 'запуск остановлен' },
      });
    }
    return { id };
  }

  /**
   * The background step (cron `ai-worker.tick`, every 5 min): each active
   * run either collects its finished batch or submits its next chunk. A
   * failure backs off (2^n min, at most 1 h) and is retried; after
   * MAX_ATTEMPTS the run stops as failed. A canceled run with a batch in
   * flight still collects it, so the money spent is counted.
   */
  async tick(now: Date = new Date()): Promise<Record<string, number | string>> {
    if (!(await this.client.isEnabled('worker'))) return { skipped: 'off' };
    const runs = await this.prisma.aiRun.findMany({
      where: {
        OR: [
          {
            status: { in: ['queued', 'running'] },
            OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
          },
          { status: 'canceled', batch_id: { not: null } },
        ],
      },
      orderBy: { created_at: 'asc' },
      take: RUNS_PER_TICK,
    });
    const out = { runs: runs.length, submitted: 0, collected: 0, errors: 0 };
    for (const run of runs) {
      try {
        const step = await this.advance(run, now);
        if (step === 'submitted') out.submitted++;
        if (step === 'collected') out.collected++;
      } catch (e) {
        out.errors++;
        await this.backoff(run, e, now);
      }
    }
    return out;
  }

  private async advance(
    run: AiRun,
    now: Date,
  ): Promise<'submitted' | 'collected' | 'waiting' | 'done'> {
    const model = asModel(run.model);
    if (run.batch_id) return this.collect(run, run.batch_id, model);
    if (run.status === 'canceled') return 'done';

    const role = await this.prisma.aiRole.findUnique({
      where: { id: run.role_id },
    });
    const items = await this.prisma.aiRunItem.findMany({
      where: { run_id: run.id, status: 'pending' },
      orderBy: { id: 'asc' },
      take: CHUNK,
    });
    if (!role || items.length === 0) {
      await this.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: role ? 'done' : 'failed',
          error: role ? null : 'роль удалена',
          finished_at: now,
        },
      });
      return 'done';
    }
    const queue = asQueue(role.queue);
    const feedback = await this.feedback(role.id);
    const system = systemBlocks(
      { name: role.name, instructions: role.instructions, queue },
      feedback,
    );
    const images = await this.promptImages(role.id, feedback);
    const batch: AiBatchItem[] = [];
    const flagsOf = new Map<string, string[]>();
    let skipped = 0;
    for (const item of items) {
      const data = (await this.queues.stillOpen(queue, item.item_id))
        ? await this.queues.load(queue, item.item_id, now)
        : null;
      if (!data) {
        skipped++;
        await this.prisma.aiRunItem.update({
          where: { id: item.id },
          data: {
            status: 'skipped',
            error: 'уже решено человеком или удалено',
          },
        });
        continue;
      }
      flagsOf.set(item.id, data.flags);
      batch.push({
        customId: item.id,
        system,
        user: itemMessage(item.item_id, data),
        ...(images.length ? { images } : {}),
      });
      if (batch.length >= chunkFor(images)) break;
    }
    if (skipped) {
      await this.prisma.aiRun.update({
        where: { id: run.id },
        data: { failed: { increment: skipped } },
      });
    }
    if (batch.length === 0) return 'waiting';
    const { batchId, reservation } = await this.client.submitBatch({
      feature: 'worker',
      effort: 'medium',
      model,
      schema: VERDICT_SCHEMA,
      maxTokens: MAX_TOKENS,
      items: batch,
    });
    await this.prisma.$transaction([
      ...batch.map((b) =>
        this.prisma.aiRunItem.update({
          where: { id: b.customId },
          data: { status: 'sent', flags: flagsOf.get(b.customId) ?? [] },
        }),
      ),
      this.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: 'running',
          batch_id: batchId,
          reserved_millicents: reservation.millicents,
          attempts: 0,
          error: null,
          next_attempt_at: null,
        },
      }),
    ]);
    return 'submitted';
  }

  private async collect(
    run: AiRun,
    batchId: string,
    model: StaffAiModel,
  ): Promise<'collected' | 'waiting'> {
    const st = await this.client.batchStatus(batchId, 'worker');
    if (st.status !== 'ended') return 'waiting';
    const { results, costMillicents: cost } = await this.client.batchResults(
      batchId,
      model,
      VERDICT_SCHEMA,
      'worker',
    );
    await this.client.settleBatch(
      { feature: 'worker', millicents: run.reserved_millicents },
      cost,
    );
    const role = await this.prisma.aiRole.findUnique({
      where: { id: run.role_id },
      select: { confidence_min: true, audit_pct: true },
    });
    const policy = {
      confidenceMin: role?.confidence_min ?? 90,
      auditPct: role?.audit_pct ?? 10,
    };
    const sent = new Map(
      (
        await this.prisma.aiRunItem.findMany({
          where: { run_id: run.id, status: 'sent' },
          select: { id: true, item_id: true, flags: true },
        })
      ).map((i) => [i.id, i]),
    );
    let proposed = 0;
    let failed = 0;
    const seen = new Set<string>();
    for (const r of results) {
      seen.add(r.customId);
      const itemCost = r.usage ? costMillicents(model, r.usage, true) : 0;
      const row = sent.get(r.customId);
      if (r.ok && row) {
        proposed++;
        const lane = routeLane(r.value, row.flags, policy, row.item_id);
        await this.prisma.aiRunItem.updateMany({
          where: { id: r.customId, run_id: run.id, status: 'sent' },
          data: {
            status: 'proposed',
            proposal: r.value as unknown as Prisma.InputJsonValue,
            decision: r.value.decision,
            confidence: r.value.confidence,
            lane,
            cost_millicents: itemCost,
            error: null,
          },
        });
      } else if (!r.ok) {
        failed++;
        await this.prisma.aiRunItem.updateMany({
          where: { id: r.customId, run_id: run.id, status: 'sent' },
          data: {
            status: 'failed',
            error: r.error.slice(0, 300),
            cost_millicents: itemCost,
          },
        });
      }
    }
    // Sent but absent from the results (expired / lost): back in line.
    await this.prisma.aiRunItem.updateMany({
      where: {
        run_id: run.id,
        status: 'sent',
        ...(seen.size ? { id: { notIn: [...seen] } } : {}),
      },
      data: { status: run.status === 'canceled' ? 'skipped' : 'pending' },
    });
    await this.prisma.aiRun.update({
      where: { id: run.id },
      data: {
        batch_id: null,
        reserved_millicents: 0,
        proposed: { increment: proposed },
        failed: { increment: failed },
        cost_millicents: { increment: cost },
        attempts: 0,
        error: null,
      },
    });
    return 'collected';
  }

  private async backoff(run: AiRun, e: unknown, now: Date): Promise<void> {
    if (e instanceof StaffAiNotEnabledError) return;
    const msg =
      e instanceof StaffAiBudgetError
        ? 'Потолок расходов ИИ за месяц набран (Настройки → staff.ai.monthly_cents); продолжу, когда он позволит.'
        : e instanceof StaffAiNotConfiguredError
          ? 'Нет ключа Claude в «Ключи и сервисы» (anthropic).'
          : e instanceof Error
            ? e.message.slice(0, 280)
            : 'ошибка';
    const attempts = run.attempts + 1;
    // The budget waits for the money, not for a fix: never «failed».
    const giveUp =
      !(e instanceof StaffAiBudgetError) && attempts >= MAX_ATTEMPTS;
    const delayMin = e instanceof StaffAiBudgetError ? 60 : 2 ** attempts;
    this.logger.warn(`AI worker run ${run.id}: ${msg}`);
    await this.prisma.aiRun.update({
      where: { id: run.id },
      data: {
        attempts,
        error: msg,
        ...(giveUp && !run.batch_id
          ? { status: 'failed', finished_at: now }
          : {
              next_attempt_at: new Date(
                now.getTime() + Math.min(60, delayMin) * 60_000,
              ),
            }),
      },
    });
  }

  // --------------------------------------------------------------- review

  async items(filter: {
    status?: string;
    lane?: string;
    runId?: string;
    cursor?: string;
  }) {
    const rows = await this.prisma.aiRunItem.findMany({
      where: {
        status: filter.status ?? 'proposed',
        ...(filter.lane ? { lane: filter.lane } : {}),
        ...(filter.runId ? { run_id: filter.runId } : {}),
      },
      orderBy: { id: 'asc' },
      take: ITEM_PAGE + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { run: { select: { role: { select: { name: true } } } } },
    });
    const page = rows.slice(0, ITEM_PAGE);
    const images =
      (await this.attachments?.views({ runItemIds: page.map((i) => i.id) })) ??
      new Map<string, AiAttachmentView[]>();
    return {
      items: page.map((i) => {
        const p = (i.proposal ?? null) as
          | (Partial<Verdict> & {
              reasons?: string[];
              draftNote?: string;
              injectionSuspected?: boolean;
            })
          | null;
        return {
          id: i.id,
          runId: i.run_id,
          roleName: i.run.role.name,
          itemId: i.item_id,
          status: i.status,
          decision: i.decision,
          confidence: i.confidence,
          lane: i.lane,
          flags: i.flags,
          reasons: p?.reasons ?? [],
          evidence: p?.evidence ?? [],
          ownerDecision: i.owner_decision,
          ownerNote: i.owner_note,
          draftNote: p?.draftNote ?? '',
          injectionSuspected: p?.injectionSuspected ?? false,
          error: i.error,
          costCents: i.cost_millicents / 1000,
          reviewedAt: i.reviewed_at?.toISOString() ?? null,
          images: images.get(i.id) ?? [],
        };
      }),
      nextCursor: rows.length > ITEM_PAGE ? page[page.length - 1].id : null,
    };
  }

  /** One tap or a selection: the owner's decision on proposals. Records
   * only (and becomes an example for the role); idempotent: a proposal
   * already decided is left as it is. */
  async review(
    adminId: string,
    input: ReviewInput,
  ): Promise<{ updated: number }> {
    if (
      input.ownerDecision !== undefined &&
      !(VERDICT_DECISIONS as readonly string[]).includes(input.ownerDecision)
    )
      throw new AiWorkerError('Неизвестное решение', 'invalid');
    const withImages =
      input.verdict === 'rejected' && (input.imageFileIds?.length ?? 0) > 0;
    const open = withImages
      ? await this.prisma.aiRunItem.findMany({
          where: { id: { in: input.ids }, status: 'proposed' },
          select: { id: true },
        })
      : [];
    const res = await this.prisma.aiRunItem.updateMany({
      where: { id: { in: input.ids }, status: 'proposed' },
      data: {
        status: input.verdict,
        reviewed_by: adminId,
        reviewed_at: new Date(),
        ...(input.verdict === 'rejected'
          ? {
              owner_decision: input.ownerDecision ?? null,
              owner_note: input.ownerNote?.trim().slice(0, 1000) || null,
            }
          : {}),
      },
    });
    if (withImages && open.length > 0) {
      await this.attachments?.addNotes(
        adminId,
        open.map((o) => o.id),
        input.imageFileIds ?? [],
      );
    }
    return { updated: res.count };
  }

  /**
   * Owner 2026-11-12 (row 48): the pictures of one request — the role's
   * example screenshots, then the pictures of the corrections shown in
   * <owner_feedback> (numbered like it). The last one closes the cached
   * prefix, so a chunk pays for them once.
   */
  private async promptImages(
    roleId: string,
    feedback: readonly ReviewedRow[],
  ): Promise<AiImage[]> {
    if (!this.attachments) return [];
    const role = await this.attachments.roleImages(roleId);
    const ids = feedback.map((f) => f.id).filter((x): x is string => !!x);
    const notes = await this.attachments.noteImages(ids);
    const out: AiImage[] = role.map((img, i) => ({
      mediaType: img.mediaType,
      data: img.data,
      label: `Picture ${i + 1} of the owner's role (trusted, from the owner):`,
    }));
    feedback.forEach((f, n) => {
      for (const img of (f.id && notes.get(f.id)) || []) {
        out.push({
          mediaType: img.mediaType,
          data: img.data,
          label: `Picture of the owner's correction ${n + 1} in <owner_feedback> (trusted):`,
        });
      }
    });
    // Owner 2026-11-12: no cap of ours; only what one request can carry
    // (600 pictures, ~100 MB). The page says so; the rest is logged.
    const { sent, skipped } = fitRequest(out);
    if (skipped > 0) {
      this.logger.warn(
        `role ${roleId}: ${skipped} picture(s) do not fit one Claude request and were not sent`,
      );
    }
    if (sent.length) sent[sent.length - 1].cache = true;
    return sent;
  }

  /** «Утвердить весь список»: every confident proposal of the bulk lane
   * (optionally of one run). The owner has no cap here. */
  async approveBulk(
    adminId: string,
    runId?: string,
  ): Promise<{ updated: number }> {
    const res = await this.prisma.aiRunItem.updateMany({
      where: {
        status: 'proposed',
        lane: 'bulk',
        ...(runId ? { run_id: runId } : {}),
      },
      data: {
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: new Date(),
      },
    });
    return { updated: res.count };
  }
}

/** Items per batch: CHUNK, fewer when the shared pictures are heavy. */
export function chunkFor(
  images: readonly Pick<PreparedImage, 'data'>[],
): number {
  const bytes = images.reduce((n, i) => n + i.data.length, 0);
  if (bytes === 0) return CHUNK;
  return Math.max(
    1,
    Math.min(CHUNK, Math.floor(BATCH_BYTES / (bytes + 20_000))),
  );
}
