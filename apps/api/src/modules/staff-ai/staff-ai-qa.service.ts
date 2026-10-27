import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { StaffSettings } from '../staff-core/staff-settings.service';
import {
  StaffAiBudgetService,
  type StaffAiReservation,
} from './staff-ai-budget.service';
import { StaffAiClient, type AiBatchItem } from './staff-ai-client.service';
import { StaffAiContextService } from './staff-ai-context.service';
import { qaSystem } from './staff-ai-rubrics';
import { QA_SCHEMA } from './staff-ai-schemas';
import {
  StaffAiApiError,
  isAiItemKind,
  modelForTier,
  type AiItemKind,
  type StaffAiModel,
} from './staff-ai.types';

/** app_config keys (small JSON; never read through the settings cache). */
export const PENDING_BATCH_KEY = 'staff.ai.pending_batch';
export const BATCH_LOG_KEY = 'staff.ai.batch_log';
const BATCH_LOG_KEEP = 30;
const DAY_MS = 86_400_000;
const QA_MAX_TOKENS = 400;
const LOAD_CONCURRENCY = 10;
/** An item judged by the AI in the last days is not sent again. */
const RECENT_DAYS = 3;
const SIGNAL_KIND = 'ai_qa';

interface QaCase {
  kind: AiItemKind;
  itemId: string;
}

export interface PendingBatch {
  id: string;
  model: StaffAiModel;
  /** The UTC day of decisions the batch checks (YYYY-MM-DD). */
  day: string;
  n: number;
  reservedMillicents: number;
}

/** The audit trail of one batch (the `audit row per batch`). */
export interface BatchLogEntry {
  batchId: string;
  at: string;
  day: string;
  model: StaffAiModel;
  n: number;
  status: 'submitted' | 'collected' | 'lost' | 'skipped_budget';
  reservedMillicents: number;
  actualMillicents?: number;
  agree?: number;
  disagree?: number;
  unclear?: number;
  failed?: number;
  toHuman?: number;
}

export type QaRunResult = Record<string, number | string | boolean>;

/** custom_id of a batch request: `<kind>_<item uuid>` (<= 61 chars). */
export const customIdOf = (c: QaCase): string => `${c.kind}_${c.itemId}`;
export function parseCustomId(id: string): QaCase | null {
  const itemId = id.slice(-36);
  const kind = id.slice(0, -37);
  if (id.charAt(id.length - 37) !== '_' || !isAiItemKind(kind)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  return { kind, itemId };
}

/**
 * Staff package T12: the nightly AI re-check of YESTERDAY's decisions.
 *  - the cases are the ones T5's rules already sampled (staff_review_samples
 *    stage sample / newcomer), plus, when `staff.ai.qa_sample_pct` > 0, a
 *    random share of yesterday's closed items, up to `staff.ai.qa_max_cases`;
 *  - ONE batch per night (Batches API, half price) with a cached rubric per
 *    queue kind; the next night's run collects the finished batch;
 *  - the verdict is stored as a staff_quality_signal of kind `ai_qa`
 *    (value = +confidence when the AI agrees, -confidence when it does not);
 *    T5's rating formulas do not read this kind;
 *  - a confident disagreement becomes a staff_review_samples row (stage `ai`)
 *    for a HUMAN. The AI never writes staff_actions or suggestions: it is
 *    never the only judge (EU 2024/2831; plan part F).
 */
@Injectable()
export class StaffAiQaService {
  private readonly logger = new Logger(StaffAiQaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    private readonly client: StaffAiClient,
    private readonly budget: StaffAiBudgetService,
    private readonly context: StaffAiContextService,
  ) {}

  async runNightly(now: Date = new Date()): Promise<QaRunResult> {
    const out: QaRunResult = {};
    const pending = await this.readPending();
    if (pending) {
      let status: Awaited<ReturnType<StaffAiClient['batchStatus']>> | null =
        null;
      try {
        status = await this.client.batchStatus(pending.id);
      } catch (e) {
        // 404: the batch no longer exists. Anything else: try again tomorrow.
        if (!(e instanceof StaffAiApiError) || e.status !== 404) throw e;
      }
      if (status && status.status !== 'ended') {
        return { pendingBatch: pending.id, status: status.status };
      }
      Object.assign(
        out,
        status ? await this.collect(pending) : await this.drop(pending),
      );
    }
    Object.assign(out, await this.submit(now));
    return out;
  }

  // ----------------------------------------------------------------- submit

  private async submit(now: Date): Promise<QaRunResult> {
    const s = await this.staff.get();
    const end = startOfUtcDay(now);
    const start = new Date(end.getTime() - DAY_MS);
    const day = start.toISOString().slice(0, 10);
    const log = await this.readLog();
    if (log.some((e) => e.day === day && e.status !== 'lost')) {
      return { submitted: 0, reason: 'already done for ' + day };
    }
    const cases = await this.pickCases(start, end, now, s);
    if (cases.length === 0) return { submitted: 0, reason: 'no cases' };

    const model = modelForTier(s.numbers['staff.ai.model_tier']);
    let remaining = await this.budget.remaining(now);
    const items: AiBatchItem[] = [];
    let noContext = 0;
    let overBudget = false;
    for (let i = 0; i < cases.length && !overBudget; i += LOAD_CONCURRENCY) {
      const chunk = cases.slice(i, i + LOAD_CONCURRENCY);
      const loaded = await Promise.all(
        chunk.map(async (c) => ({
          c,
          ctx: await this.context.load(c.kind, c.itemId),
        })),
      );
      for (const { c, ctx } of loaded) {
        if (!ctx) {
          noContext++;
          continue;
        }
        const item: AiBatchItem = {
          customId: customIdOf(c),
          system: qaSystem(c.kind),
          user: StaffAiContextService.prompt(c.itemId, ctx, true),
        };
        const est = this.client.estimateItemMillicents(
          model,
          item.system,
          item.user,
          QA_MAX_TOKENS,
          true,
        );
        if (est > remaining) {
          overBudget = true;
          break;
        }
        remaining -= est;
        items.push(item);
      }
    }
    if (items.length === 0) {
      if (overBudget) {
        await this.appendLog({
          batchId: '-',
          at: now.toISOString(),
          day,
          model,
          n: 0,
          status: 'skipped_budget',
          reservedMillicents: 0,
        });
      }
      return {
        submitted: 0,
        noContext,
        reason: overBudget ? 'budget' : 'no context',
      };
    }

    const { batchId, reservation } = await this.client.submitBatch({
      model,
      schema: QA_SCHEMA,
      maxTokens: QA_MAX_TOKENS,
      items,
    });
    const pending: PendingBatch = {
      id: batchId,
      model,
      day,
      n: items.length,
      reservedMillicents: reservation.millicents,
    };
    await this.writeConfig(
      PENDING_BATCH_KEY,
      pending as unknown as Prisma.InputJsonValue,
    );
    await this.appendLog({
      batchId,
      at: now.toISOString(),
      day,
      model,
      n: items.length,
      status: 'submitted',
      reservedMillicents: reservation.millicents,
    });
    this.logger.log(
      `staff AI QA batch ${batchId}: ${items.length} cases of ${day}, ${model}, reserved ${reservation.millicents} millicents`,
    );
    return { submitted: items.length, noContext, overBudget, batch: batchId };
  }

  // ---------------------------------------------------------------- collect

  /** The batch is gone: give its reservation back and forget it. */
  private async drop(pending: PendingBatch): Promise<QaRunResult> {
    await this.client.settleBatch(
      { feature: 'qa', millicents: pending.reservedMillicents },
      0,
    );
    await this.clearPending();
    await this.patchLog(pending.id, { status: 'lost' });
    this.logger.warn(`staff AI QA batch ${pending.id} lost`);
    return { collected: 0, lost: true };
  }

  private async collect(pending: PendingBatch): Promise<QaRunResult> {
    const reservation: StaffAiReservation = {
      feature: 'qa',
      millicents: pending.reservedMillicents,
    };
    let fetched;
    try {
      fetched = await this.client.batchResults(
        pending.id,
        pending.model,
        QA_SCHEMA,
      );
    } catch (e) {
      // Results gone (29 days): forget the batch. Any other error: retry tomorrow.
      if (e instanceof StaffAiApiError && e.status === 404)
        return this.drop(pending);
      throw e;
    }
    await this.client.settleBatch(reservation, fetched.costMillicents);

    const minConf = await this.staff.number('staff.ai.disagree_min_conf');
    const cases: Array<{ c: QaCase; r: (typeof fetched.results)[number] }> = [];
    for (const r of fetched.results) {
      const c = parseCustomId(r.customId);
      if (c) cases.push({ c, r });
    }
    const deciders = await this.deciders(cases.map((x) => x.c));
    let agree = 0;
    let disagree = 0;
    let unclear = 0;
    let failed = 0;
    let noAdmin = 0;
    const signals: Prisma.StaffQualitySignalCreateManyInput[] = [];
    const samples: Prisma.StaffReviewSampleCreateManyInput[] = [];
    for (const { c, r } of cases) {
      if (!r.ok) {
        failed++;
        continue;
      }
      const v = r.value;
      if (v.verdict === 'unclear') {
        unclear++;
        continue;
      }
      const adminId = deciders.get(`${c.kind}:${c.itemId}`);
      if (!adminId) {
        noAdmin++;
        continue;
      }
      if (v.verdict === 'agree') agree++;
      else disagree++;
      const conf = Math.max(1, v.confidence);
      signals.push({
        admin_id: adminId,
        kind: SIGNAL_KIND,
        item_kind: c.kind,
        item_id: c.itemId,
        value: v.verdict === 'agree' ? conf : -conf,
      });
      if (v.verdict === 'disagree' && v.confidence >= minConf) {
        samples.push({
          decision_kind: c.kind,
          item_id: c.itemId,
          decided_by: adminId,
          stage: 'ai',
          golden_answer: {
            ai: {
              verdict: v.verdict,
              confidence: v.confidence,
              reason: v.reason,
              better: v.betterOutcome,
              model: pending.model,
            },
          },
        });
      }
    }
    if (signals.length > 0) {
      await this.prisma.staffQualitySignal.createMany({ data: signals });
    }
    let toHuman = 0;
    if (samples.length > 0) {
      toHuman = (
        await this.prisma.staffReviewSample.createMany({
          data: samples,
          skipDuplicates: true,
        })
      ).count;
    }
    await this.clearPending();
    await this.patchLog(pending.id, {
      status: 'collected',
      actualMillicents: fetched.costMillicents,
      agree,
      disagree,
      unclear,
      failed,
      toHuman,
    });
    this.logger.log(
      `staff AI QA batch ${pending.id} collected: ${agree} agree, ${disagree} disagree, ${unclear} unclear, ${failed} failed, ${toHuman} to a human, ${fetched.costMillicents} millicents`,
    );
    return {
      collected: cases.length,
      agree,
      disagree,
      unclear,
      failed,
      toHuman,
      noAdmin,
    };
  }

  // ----------------------------------------------------------------- picking

  private async pickCases(
    start: Date,
    end: Date,
    now: Date,
    s: StaffSettings,
  ): Promise<QaCase[]> {
    const cap = s.numbers['staff.ai.qa_max_cases'];
    const pct = s.numbers['staff.ai.qa_sample_pct'];
    const window = { gte: start, lt: end };
    const found = new Map<string, QaCase>();
    const add = (kind: string, itemId: string) => {
      if (!isAiItemKind(kind)) return;
      const key = `${kind}:${itemId}`;
      if (!found.has(key)) found.set(key, { kind, itemId });
    };

    // 1. what T5's sampling rules already picked.
    const picked = await this.prisma.staffReviewSample.findMany({
      where: {
        created_at: window,
        is_golden: false,
        stage: { in: ['sample', 'newcomer'] },
      },
      orderBy: { created_at: 'asc' },
      take: cap,
      select: { decision_kind: true, item_id: true },
    });
    for (const p of picked) add(p.decision_kind, p.item_id);

    // 2. plus a random share of everything closed yesterday.
    if (pct > 0 && found.size < cap) {
      const take = Math.min(50_000, Math.ceil((cap * 100) / pct));
      const events = await this.prisma.workLeaseEvent.findMany({
        where: { event: 'done', created_at: window, admin_id: { not: null } },
        orderBy: { created_at: 'asc' },
        take,
        select: { kind: true, item_id: true },
      });
      for (const e of events) {
        if (found.size >= cap) break;
        if (pct >= 100 || Math.random() * 100 < pct) add(e.kind, e.item_id);
      }
    }

    // 3. not twice in a few days.
    const all = [...found.values()];
    if (all.length === 0) return [];
    const recent = await this.prisma.staffQualitySignal.findMany({
      where: {
        kind: SIGNAL_KIND,
        created_at: { gte: new Date(now.getTime() - RECENT_DAYS * DAY_MS) },
        item_id: { in: all.map((c) => c.itemId) },
      },
      select: { item_kind: true, item_id: true },
    });
    const done = new Set(recent.map((r) => `${r.item_kind}:${r.item_id}`));
    return all.filter((c) => !done.has(`${c.kind}:${c.itemId}`)).slice(0, cap);
  }

  /** Who made each decision: T5's sample row first, else the lease journal. */
  private async deciders(cases: QaCase[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (cases.length === 0) return map;
    const ids = [...new Set(cases.map((c) => c.itemId))];
    const [samples, events] = await Promise.all([
      this.prisma.staffReviewSample.findMany({
        where: { item_id: { in: ids } },
        select: { decision_kind: true, item_id: true, decided_by: true },
      }),
      this.prisma.workLeaseEvent.findMany({
        where: { item_id: { in: ids }, event: 'done', admin_id: { not: null } },
        orderBy: { created_at: 'asc' },
        select: { kind: true, item_id: true, admin_id: true },
      }),
    ]);
    for (const e of events)
      map.set(`${e.kind}:${e.item_id}`, e.admin_id as string);
    for (const x of samples)
      map.set(`${x.decision_kind}:${x.item_id}`, x.decided_by);
    return map;
  }

  // ------------------------------------------------------------ app_config

  private async readConfig<T>(key: string): Promise<T | null> {
    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    return (row?.value as T | undefined) ?? null;
  }

  private async writeConfig(
    key: string,
    value: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private async readPending(): Promise<PendingBatch | null> {
    const p = await this.readConfig<PendingBatch>(PENDING_BATCH_KEY);
    return p && typeof p.id === 'string' && p.id ? p : null;
  }

  private async clearPending(): Promise<void> {
    await this.writeConfig(PENDING_BATCH_KEY, {});
  }

  async readLog(): Promise<BatchLogEntry[]> {
    const v = await this.readConfig<BatchLogEntry[]>(BATCH_LOG_KEY);
    return Array.isArray(v) ? v : [];
  }

  private async appendLog(entry: BatchLogEntry): Promise<void> {
    const log = [entry, ...(await this.readLog())].slice(0, BATCH_LOG_KEEP);
    await this.writeConfig(
      BATCH_LOG_KEY,
      log as unknown as Prisma.InputJsonValue,
    );
  }

  private async patchLog(
    batchId: string,
    patch: Partial<BatchLogEntry>,
  ): Promise<void> {
    const log = (await this.readLog()).map((e) =>
      e.batchId === batchId ? { ...e, ...patch } : e,
    );
    await this.writeConfig(
      BATCH_LOG_KEY,
      log as unknown as Prisma.InputJsonValue,
    );
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
