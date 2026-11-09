import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import { InfraGithubClient } from '../admin-launch/infra-github';
import { SentryIssuesClient } from '../staff-home/sentry-issues.client';
import {
  AI_REFUSAL_TEXT,
  AI_TASK_LABEL,
  aiGate,
  monthKey,
  safeCost,
  scrub,
  taskIssueBody,
  type AiRefusal,
  type AiRunKind,
} from './ai-assistant.logic';

/** Last runs kept for the admin page (Redis list, newest first). */
const RUNS_KEY = 'ai:runs';
const RUNS_KEEP = 50;
/** A month key lives 40 days (the page shows this month and the last). */
const MONTH_TTL_S = 40 * 24 * 3600;

export interface AiRunRecord {
  at: string;
  kind: AiRunKind;
  issueNumber: number | null;
  runUrl: string;
  costUsd: number;
  conclusion: string;
  prUrl: string | null;
}

export interface AiStatus {
  mode: string;
  connected: boolean;
  allowed: boolean;
  reason: string | null;
  monthUsd: number;
  maxUsd: number;
  tasks: {
    number: number;
    title: string;
    state: string;
    url: string;
    createdAt: string;
    pulls: { number: number; url: string; state: string; merged: boolean }[];
  }[];
  tasksError: string | null;
  runs: AiRunRecord[];
}

/**
 * 09.11.2026 (owner pulled it forward): «Задача для ИИ». See
 * ai-assistant.logic.ts and docs/runbooks/AI_ASSISTANT.md. Nothing here
 * runs a model: the API opens issues, gates runs, gives a scrubbed digest
 * and books the cost each run reports.
 */
@Injectable()
export class AiAssistantService {
  private readonly log = new Logger('AiAssistant');

  constructor(
    private readonly github: InfraGithubClient,
    private readonly settings: AppSettingsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly sentry?: SentryIssuesClient,
  ) {}

  private async mode(): Promise<string> {
    return (
      (await this.settings.string('ai.assistant_mode').catch(() => 'off')) ??
      'off'
    );
  }

  private async maxUsd(): Promise<number> {
    return (
      (await this.settings.number('ai.monthly_max_usd').catch(() => 0)) ?? 0
    );
  }

  async monthUsd(now: Date = new Date()): Promise<number> {
    const v = await this.redis.get(monthKey(now)).catch(() => null);
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  async gate(now: Date = new Date()) {
    const [mode, connected, monthUsd, maxUsd] = await Promise.all([
      this.mode(),
      this.github.configured(),
      this.monthUsd(now),
      this.maxUsd(),
    ]);
    const g = aiGate({ mode, connected, monthUsd, maxUsd });
    return {
      ...g,
      reasonText: g.reason ? AI_REFUSAL_TEXT[g.reason] : null,
      mode,
      connected,
      monthUsd,
      maxUsd,
    };
  }

  async status(now: Date = new Date()): Promise<AiStatus> {
    const g = await this.gate(now);
    let tasks: AiStatus['tasks'] = [];
    let tasksError: string | null = null;
    if (g.connected) {
      try {
        tasks = await this.github.issuesWithPulls(AI_TASK_LABEL, 20);
      } catch (e) {
        tasksError = (e as Error).message.slice(0, 200);
      }
    }
    const raw = await this.redis
      .lrange(RUNS_KEY, 0, RUNS_KEEP - 1)
      .catch(() => []);
    const runs = raw
      .map((r) => {
        try {
          return JSON.parse(r) as AiRunRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is AiRunRecord => r !== null);
    return {
      mode: g.mode,
      connected: g.connected,
      allowed: g.allowed,
      reason: g.reasonText,
      monthUsd: g.monthUsd,
      maxUsd: g.maxUsd,
      tasks,
      tasksError,
      runs,
    };
  }

  /** The owner's task becomes an `ai-task` issue (the workflow picks it up). */
  async createTask(
    admin: { id: string; ip?: string | null },
    input: { title: string; details: string },
  ): Promise<{ number: number; url: string }> {
    const g = await this.gate();
    if (!g.connected) throw new AiAssistantError('not_connected');
    if (g.reason === 'off') throw new AiAssistantError('off');
    const issue = await this.github.createIssue({
      title: input.title.trim().slice(0, 200),
      body: taskIssueBody(input.details, `admin ${admin.id.slice(0, 8)}`),
      labels: [AI_TASK_LABEL],
    });
    await this.audit.record({
      adminId: admin.id,
      action: 'ai.task_create',
      targetType: 'system',
      targetId: null,
      before: null,
      after: { issue: issue.number, url: issue.url },
      ip: admin.ip ?? null,
    });
    return { number: issue.number, url: issue.url };
  }

  /**
   * What the scheduled run looks at, with no personal data (public repo):
   * unresolved Sentry issues, open CloudWatch alarms (system incidents) and
   * the count of new support tickets by category (ids only, no text).
   */
  async digest(now: Date = new Date()) {
    const since = new Date(now.getTime() - 7 * 24 * 3600_000);
    const [sentry, alarms, tickets] = await Promise.all([
      this.sentry?.read(now).catch(() => null) ?? Promise.resolve(null),
      this.prisma.systemIncident
        .findMany({
          where: { closed_at: null },
          orderBy: { opened_at: 'desc' },
          take: 20,
          select: {
            component: true,
            severity: true,
            title: true,
            opened_at: true,
          },
        })
        .catch(() => []),
      this.prisma.supportTicket
        .groupBy({
          by: ['category'],
          where: {
            created_at: { gte: since },
            status: { in: ['open', 'waiting_user'] },
          },
          _count: { _all: true },
        })
        .catch(() => []),
    ]);
    return {
      at: now.toISOString(),
      sentry: (sentry?.issues ?? []).slice(0, 15).map((i) => ({
        title: scrub(i.title),
        count: i.count,
        users: i.users,
        lastSeen: i.lastSeen,
        link: i.permalink,
      })),
      alarms: alarms.map((a) => ({
        component: a.component,
        severity: a.severity,
        title: scrub(a.title),
        openedAt: a.opened_at.toISOString(),
      })),
      openTicketsByCategory: Object.fromEntries(
        tickets.map((t) => [t.category, t._count._all]),
      ),
    };
  }

  /** One run's outcome: its cost is added to the month, the run is listed. */
  async report(
    run: { runUrl: string },
    input: {
      kind: AiRunKind;
      issueNumber?: number | null;
      costUsd?: unknown;
      conclusion?: string;
      prUrl?: string | null;
    },
    now: Date = new Date(),
  ): Promise<{ monthUsd: number }> {
    const cost = safeCost(input.costUsd);
    if (cost > 0) {
      const key = monthKey(now);
      await this.redis.incrbyfloat(key, cost);
      await this.redis.expire(key, MONTH_TTL_S);
    }
    const rec: AiRunRecord = {
      at: now.toISOString(),
      kind: input.kind,
      issueNumber: input.issueNumber ?? null,
      runUrl: run.runUrl,
      costUsd: cost,
      conclusion: (input.conclusion ?? 'unknown').slice(0, 20),
      prUrl:
        input.prUrl &&
        /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(input.prUrl)
          ? input.prUrl
          : null,
    };
    await this.redis.lpush(RUNS_KEY, JSON.stringify(rec));
    await this.redis.ltrim(RUNS_KEY, 0, RUNS_KEEP - 1);
    this.log.log(`ai run ${rec.kind} ${rec.conclusion} $${cost} ${rec.runUrl}`);
    return { monthUsd: await this.monthUsd(now) };
  }
}

export class AiAssistantError extends Error {
  constructor(readonly reason: AiRefusal) {
    super(AI_REFUSAL_TEXT[reason]);
  }
}
