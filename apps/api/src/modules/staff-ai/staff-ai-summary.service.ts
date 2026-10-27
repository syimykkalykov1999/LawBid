import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { AdminWorkspace } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAiClient } from './staff-ai-client.service';
import { scrubPii } from './staff-ai-pii';
import { SUMMARY_SYSTEM } from './staff-ai-rubrics';
import { SUMMARY_SCHEMA } from './staff-ai-schemas';
import {
  STAFF_RECOMMENDATION_TEMPLATE,
  type StaffRecommendationTemplate,
} from './staff-ai.ports';
import {
  StaffAiBudgetError,
  StaffAiNotConfiguredError,
  StaffAiNotEnabledError,
  modelForTier,
} from './staff-ai.types';

const SUMMARY_TTL_SEC = 3 * 86_400;
const SUMMARY_MAX_TOKENS = 500;
const SUMMARY_TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;
const DAY_MS = 86_400_000;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** What the system suggests, in the owner's words (the human picks). */
const KIND_LABEL: Readonly<Record<string, string>> = {
  reward: 'премировать',
  retrain: 'обучить',
  replace: 'заменить',
  pull: 'снять с очереди',
  pause: 'приостановить',
  warn: 'предупредить',
  more_review: 'проверять чаще',
};
const SUMMARIZED = Object.keys(KIND_LABEL);

export interface SummaryResult {
  available: boolean;
  /** ai = written by the model; template = T5's rule-based text; none. */
  source: 'ai' | 'template' | 'none';
  text: string | null;
  model?: string;
  at?: string;
}

interface CachedSummary {
  text: string;
  model: string;
  at: string;
}

export interface SummaryViewer {
  adminRole: string;
  workspace?: AdminWorkspace;
  workspaceHead?: boolean;
}

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

/**
 * Staff package T12: the short evidence-backed text under a recommendation
 * («премировать / обучить / заменить») written from T5's snapshots and
 * signals, once a night, cached. It explains the evidence of a step T5's
 * rules already chose; it never chooses or applies one.
 */
@Injectable()
export class StaffAiSummaryService {
  private readonly logger = new Logger(StaffAiSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly staff: StaffSettingsService,
    private readonly client: StaffAiClient,
    @Optional()
    @Inject(STAFF_RECOMMENDATION_TEMPLATE)
    private readonly template?: StaffRecommendationTemplate,
  ) {}

  static cacheKey(suggestionId: string): string {
    return `staff:ai:summary:${suggestionId}`;
  }

  /** Nightly: writes the missing texts for the open suggestions. */
  async refreshNightly(
    now: Date = new Date(),
  ): Promise<Record<string, number>> {
    const s = await this.staff.get();
    const cap = s.numbers['staff.ai.summary_max'];
    const open = await this.prisma.staffSuggestion.findMany({
      where: { status: 'open', kind: { in: SUMMARIZED } },
      orderBy: { created_at: 'desc' },
      take: cap,
      select: { id: true, admin_id: true, kind: true, evidence: true },
    });
    const todo: typeof open = [];
    for (const sg of open) {
      if (
        (await this.redis.exists(StaffAiSummaryService.cacheKey(sg.id))) === 0
      )
        todo.push(sg);
    }
    const model = modelForTier(s.numbers['staff.ai.model_tier']);
    let written = 0;
    let failed = 0;
    let stop = false;
    for (let i = 0; i < todo.length && !stop; i += CONCURRENCY) {
      await Promise.all(
        todo.slice(i, i + CONCURRENCY).map(async (sg) => {
          if (stop) return;
          try {
            const evidence = await this.evidenceText(sg, now);
            const res = await this.client.message({
              feature: 'summary',
              model,
              system: SUMMARY_SYSTEM,
              user: `<evidence>\n${evidence}\n</evidence>`,
              schema: SUMMARY_SCHEMA,
              maxTokens: SUMMARY_MAX_TOKENS,
              timeoutMs: SUMMARY_TIMEOUT_MS,
            });
            const cached: CachedSummary = {
              text: res.value.text,
              model: res.model,
              at: now.toISOString(),
            };
            await this.redis.set(
              StaffAiSummaryService.cacheKey(sg.id),
              JSON.stringify(cached),
              'EX',
              SUMMARY_TTL_SEC,
            );
            written++;
          } catch (e) {
            if (
              e instanceof StaffAiBudgetError ||
              e instanceof StaffAiNotEnabledError ||
              e instanceof StaffAiNotConfiguredError
            ) {
              stop = true;
              return;
            }
            failed++;
            this.logger.warn(`staff AI summary ${sg.id} failed: ${String(e)}`);
          }
        }),
      );
    }
    return {
      candidates: todo.length,
      written,
      failed,
      stoppedEarly: stop ? 1 : 0,
    };
  }

  /** The text for one suggestion: AI if cached, else T5's template. */
  async get(
    viewer: SummaryViewer,
    suggestionId: string,
  ): Promise<SummaryResult> {
    if (!(await this.client.isEnabled('summary'))) throw notFound();
    const sg = await this.prisma.staffSuggestion.findUnique({
      where: { id: suggestionId },
      select: { id: true, admin_id: true, kind: true, evidence: true },
    });
    if (!sg || !(await this.mayView(viewer, sg.admin_id))) throw notFound();

    const raw = await this.redis.get(StaffAiSummaryService.cacheKey(sg.id));
    if (raw) {
      try {
        const c = JSON.parse(raw) as CachedSummary;
        return {
          available: true,
          source: 'ai',
          text: c.text,
          model: c.model,
          at: c.at,
        };
      } catch {
        /* fall through to the template */
      }
    }
    const text =
      this.template?.describe({
        id: sg.id,
        adminId: sg.admin_id,
        kind: sg.kind,
        evidence: sg.evidence,
      }) ?? null;
    return text
      ? { available: true, source: 'template', text }
      : { available: false, source: 'none', text: null };
  }

  /** The owner sees all; a head only people of their own workspace. */
  private async mayView(
    viewer: SummaryViewer,
    adminId: string,
  ): Promise<boolean> {
    if (viewer.adminRole === 'super_admin') return true;
    if (!viewer.workspaceHead || !viewer.workspace) return false;
    const snap = await this.prisma.staffRatingSnapshot.findFirst({
      where: { admin_id: adminId },
      orderBy: { snapshot_date: 'desc' },
      select: { workspace: true },
    });
    return snap?.workspace === viewer.workspace;
  }

  /** De-identified facts about one person (no names, no contact data). */
  private async evidenceText(
    sg: { id: string; admin_id: string; kind: string; evidence: unknown },
    now: Date,
  ): Promise<string> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [snaps, signals, aiRows] = await Promise.all([
      this.prisma.staffRatingSnapshot.findMany({
        where: { admin_id: sg.admin_id },
        orderBy: { snapshot_date: 'desc' },
        take: 8,
      }),
      this.prisma.staffQualitySignal.groupBy({
        by: ['kind'],
        where: {
          admin_id: sg.admin_id,
          created_at: { gte: since },
        },
        _count: { _all: true },
      }),
      this.prisma.staffQualitySignal.findMany({
        where: {
          admin_id: sg.admin_id,
          kind: 'ai_qa',
          created_at: { gte: since },
        },
        select: { value: true },
        take: 1000,
      }),
    ]);
    const latest = snaps[0];
    const lines = [
      `suggested step (decided by a human, not you): ${KIND_LABEL[sg.kind] ?? sg.kind}`,
    ];
    if (latest) {
      lines.push(
        `rating: ${latest.rating ?? 'not enough data'} (status ${latest.status}), decisions in the window: ${latest.n_decisions}`,
        `components 0-100: accuracy ${latest.accuracy ?? '-'}, clean ${latest.clean ?? '-'}, users ${latest.users_verdict ?? '-'}, speed ${latest.speed ?? '-'}`,
        `flags: ${latest.flags.join(', ') || 'none'}`,
        `trend (newest first): ${snaps.map((x) => x.rating ?? '-').join(', ')}`,
      );
    } else {
      lines.push('no rating snapshot yet (not enough data)');
    }
    const human = signals.filter((x) => x.kind !== 'ai_qa');
    const aiDisagree = aiRows.filter((x) => x.value < 0).length;
    lines.push(
      `quality signals, last 30 days: ${human.map((x) => `${x.kind}=${x._count._all}`).join(', ') || 'none'}`,
      `AI re-checks, last 30 days (a second opinion only): ${aiRows.length} judged, ${aiDisagree} disagreed`,
      `system evidence: ${JSON.stringify(sg.evidence ?? {}).slice(0, 1500)}`,
    );
    return scrubPii(lines.join('\n').replace(UUID, '[id]'));
  }
}
