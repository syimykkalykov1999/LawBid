import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  GithubMergeError,
  InfraGithubClient,
} from '../admin-launch/infra-github';
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
import {
  AI_BRANCH_PREFIX,
  AI_PULL_REFUSAL_TEXT,
  checksState,
  pullGuard,
  pullRefusal,
  pullSummary,
  type AiPullRefusal,
  type ChecksState,
} from './ai-pull-guard.logic';

/** One AI merge at a time across all API processes (SET NX PX + token). */
const MERGE_LOCK_KEY = 'ai:merge:lock';
const MERGE_LOCK_TTL_MS = 120_000;
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

export interface AiPullRow {
  number: number;
  title: string;
  url: string;
  summary: string;
  headSha: string;
  branch: string;
  createdAt: string;
  checks: ChecksState | 'unknown';
  costUsd: number | null;
}

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
  tasksAllowed: boolean;
  tasksReason: string | null;
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

  /** [kind]: the scheduled look or an owner task (Авто runs only the first). */
  async gate(now: Date = new Date(), kind: AiRunKind = 'schedule') {
    const [mode, connected, monthUsd, maxUsd] = await Promise.all([
      this.mode(),
      this.github.configured(),
      this.monthUsd(now),
      this.maxUsd(),
    ]);
    const g = aiGate({ mode, connected, monthUsd, maxUsd, kind });
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
    const runs = await this.runs();
    const t = aiGate({
      mode: g.mode,
      connected: g.connected,
      monthUsd: g.monthUsd,
      maxUsd: g.maxUsd,
      kind: 'task',
    });
    return {
      mode: g.mode,
      connected: g.connected,
      allowed: g.allowed,
      reason: g.reasonText,
      tasksAllowed: t.allowed,
      tasksReason: t.reason ? AI_REFUSAL_TEXT[t.reason] : null,
      monthUsd: g.monthUsd,
      maxUsd: g.maxUsd,
      tasks,
      tasksError,
      runs,
    };
  }

  private async runs(): Promise<AiRunRecord[]> {
    const raw = await this.redis
      .lrange(RUNS_KEY, 0, RUNS_KEEP - 1)
      .catch(() => []);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as AiRunRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is AiRunRecord => r !== null);
  }

  /**
   * 12.11.2026: the AI's open PRs (branches ai/… of this repository) with
   * their CI state, what/why from the PR body and the run cost when the
   * workflow reported one. Nothing here merges.
   */
  async pulls(): Promise<{ pulls: AiPullRow[]; error: string | null }> {
    if (!(await this.github.configured())) {
      return { pulls: [], error: AI_PULL_REFUSAL_TEXT.not_connected };
    }
    try {
      const [{ pulls }, runs] = await Promise.all([
        this.github.openPullsByPrefix(AI_BRANCH_PREFIX),
        this.runs(),
      ]);
      const rows = await Promise.all(
        pulls.slice(0, 20).map(async (p): Promise<AiPullRow> => {
          const checks = await this.github
            .commitChecks(p.headSha)
            .then((c) => checksState(c.runs, c.statuses))
            .catch((): 'unknown' => 'unknown');
          const mine = runs.filter((r) => r.prUrl === p.url);
          return {
            number: p.number,
            title: p.title,
            url: p.url,
            summary: pullSummary(p.body),
            headSha: p.headSha,
            branch: p.headRef,
            createdAt: p.createdAt,
            checks,
            costUsd: mine.length
              ? Math.round(mine.reduce((s, r) => s + r.costUsd, 0) * 100) / 100
              : null,
          };
        }),
      );
      return { pulls: rows, error: null };
    } catch (e) {
      return { pulls: [], error: (e as Error).message.slice(0, 200) };
    }
  }

  /**
   * «Разрешить» (the controller has already checked the owner's fresh 2FA
   * code). Everything is read fresh from GitHub, under one Redis lock:
   * an open ai/ PR of this repository into main, its head still the commit
   * the owner saw, CI green on exactly that commit, and the path guard clean
   * on its changed files. Then a squash merge pinned to that sha (GitHub
   * refuses if the branch moved in between).
   */
  async approvePull(
    admin: { id: string; ip?: string | null },
    n: number,
    seenSha: string,
  ): Promise<{ number: number; mergedSha: string }> {
    if (!(await this.github.configured())) {
      throw new AiPullError('not_connected');
    }
    const token = randomUUID();
    const locked = await this.redis.set(
      MERGE_LOCK_KEY,
      token,
      'PX',
      MERGE_LOCK_TTL_MS,
      'NX',
    );
    if (locked !== 'OK') throw new AiPullError('busy');
    try {
      const { repo, pull } = await this.github.pull(n);
      if (!pull) throw new AiPullError('not_found');
      const refusal = pullRefusal(pull, repo, seenSha);
      if (refusal) throw new AiPullError(refusal);
      const c = await this.github.commitChecks(pull.headSha);
      const state = checksState(c.runs, c.statuses);
      if (state !== 'success') throw new AiPullError('checks', state);
      const f = await this.github.pullFiles(n);
      const bad = pullGuard(f.files, f.complete);
      if (bad.length > 0) {
        throw new AiPullError('guard', bad.slice(0, 5).join(', '));
      }
      let merged: { sha: string };
      try {
        merged = await this.github.mergePull(n, pull.headSha, pull.title);
      } catch (e) {
        if (e instanceof GithubMergeError) {
          throw new AiPullError(
            e.status === 409 ? 'stale_sha' : 'merge_failed',
            e.message,
          );
        }
        throw e;
      }
      await this.audit.record({
        adminId: admin.id,
        action: 'ai.pull_merge',
        targetType: 'system',
        targetId: null,
        before: { pr: n, headSha: pull.headSha, checks: state },
        after: { pr: n, mergedSha: merged.sha, url: pull.url },
        ip: admin.ip ?? null,
      });
      this.log.log(`ai PR #${n} merged by the owner (${merged.sha})`);
      return { number: n, mergedSha: merged.sha };
    } finally {
      await this.redis
        .eval(RELEASE_LOCK, 1, MERGE_LOCK_KEY, token)
        .catch(() => undefined);
    }
  }

  /** «Отклонить»: the AI's PR is closed with a comment (nothing merges). */
  async rejectPull(
    admin: { id: string; ip?: string | null },
    n: number,
    reason?: string,
  ): Promise<{ number: number }> {
    if (!(await this.github.configured())) {
      throw new AiPullError('not_connected');
    }
    const { repo, pull } = await this.github.pull(n);
    if (!pull) throw new AiPullError('not_found');
    const refusal = pullRefusal(pull, repo, pull.headSha);
    if (refusal === 'not_ai') throw new AiPullError('not_ai');
    if (pull.state !== 'open' || pull.merged) {
      throw new AiPullError('not_open');
    }
    const why = reason?.trim() ? scrub(reason, 500) : '';
    await this.github.closePull(
      n,
      [
        'Отклонено владельцем в админке («Задача для ИИ»).',
        why ? `Причина: ${why}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
    await this.audit.record({
      adminId: admin.id,
      action: 'ai.pull_reject',
      targetType: 'system',
      targetId: null,
      before: { pr: n, headSha: pull.headSha },
      after: { pr: n, state: 'closed', url: pull.url },
      ip: admin.ip ?? null,
    });
    return { number: n };
  }

  /** The owner's task becomes an `ai-task` issue (the workflow picks it up). */
  async createTask(
    admin: { id: string; ip?: string | null },
    input: { title: string; details: string },
  ): Promise<{ number: number; url: string }> {
    // Owner 12.11: the admin's tasks run only in Вкл (Авто = by itself only).
    const g = await this.gate(new Date(), 'task');
    if (g.reason === 'off' || g.reason === 'tasks_need_on') {
      throw new AiAssistantError(g.reason);
    }
    if (!g.connected) throw new AiAssistantError('not_connected');
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

/** Why «Разрешить» / «Отклонить» was refused, in the owner's words. */
export class AiPullError extends Error {
  constructor(
    readonly reason: AiPullRefusal,
    readonly detail?: string,
  ) {
    super(
      detail
        ? `${AI_PULL_REFUSAL_TEXT[reason]} (${detail})`
        : AI_PULL_REFUSAL_TEXT[reason],
    );
  }
}
