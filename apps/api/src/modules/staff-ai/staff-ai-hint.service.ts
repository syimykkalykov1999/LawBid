import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAiClient } from './staff-ai-client.service';
import { StaffAiContextService } from './staff-ai-context.service';
import { hintSystem } from './staff-ai-rubrics';
import { hintSchema } from './staff-ai-schemas';
import {
  StaffAiBudgetError,
  StaffAiNotConfiguredError,
  StaffAiNotEnabledError,
  StaffAiTimeoutError,
  isAiItemKind,
  modelForTier,
  type AiItemKind,
} from './staff-ai.types';

const HINT_TTL_SEC = 3600;
const HINT_MAX_TOKENS = 300;

/** Queue kinds each role works on (the fallback when leases are off). */
const ROLE_KINDS: Readonly<Record<AdminRole, readonly AiItemKind[] | 'all'>> = {
  super_admin: 'all',
  verifier: ['verification'],
  moderator: ['report'],
  support: ['support_ticket'],
  finance: [],
};

export type HintUnavailable =
  | 'budget'
  | 'timeout'
  | 'not_configured'
  | 'rate_limited'
  | 'no_context'
  | 'error';

export interface HintResult {
  available: boolean;
  suggestion?: string;
  reason?: string;
  confidence?: number;
  model?: string;
  cached: boolean;
  unavailable?: HintUnavailable;
}

export interface HintAdmin {
  id: string;
  adminRole: AdminRole;
}

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

/**
 * Staff package T12: «подсказать» on the desk — ONE suggested decision with a
 * short reason for the item the staff member is holding.
 *  - off (master or `staff.ai_hint_enabled`) → 404, as if the route did not
 *    exist; nothing is called;
 *  - only for an item the caller holds (a live lease) or, while leases are
 *    off, a queue kind that matches their role; otherwise 404;
 *  - one Messages call, `staff.ai.hint_timeout_ms` (3 s) timeout, cached per
 *    item for an hour, counted against the monthly ceiling;
 *  - a slow / failed / over-budget call is NOT an error: the desk gets
 *    `available: false` and simply shows no hint, work never waits for AI;
 *  - the answer is a suggestion only; the human decision is recorded by the
 *    desk (see `recordOutcome` for «ИИ предложил / человек принял»).
 */
@Injectable()
export class StaffAiHintService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly staff: StaffSettingsService,
    private readonly client: StaffAiClient,
    private readonly context: StaffAiContextService,
  ) {}

  async hint(
    admin: HintAdmin,
    kind: string,
    itemId: string,
  ): Promise<HintResult> {
    if (!(await this.client.isEnabled('hint'))) throw notFound();
    if (!isAiItemKind(kind)) throw notFound();
    if (!(await this.mayAdvise(admin, kind, itemId))) throw notFound();

    const cacheKey = `staff:ai:hint:${kind}:${itemId}`;
    const hit = await this.redis.get(cacheKey);
    if (hit) {
      try {
        return { ...(JSON.parse(hit) as HintResult), cached: true };
      } catch {
        /* a broken entry is recomputed */
      }
    }

    const s = await this.staff.get();
    if (
      !(await this.underRateLimit(
        admin.id,
        s.numbers['staff.ai.hints_per_minute'],
      ))
    ) {
      return { available: false, cached: false, unavailable: 'rate_limited' };
    }
    const ctx = await this.context.load(kind, itemId);
    if (!ctx)
      return { available: false, cached: false, unavailable: 'no_context' };

    try {
      const res = await this.client.message({
        feature: 'hint',
        model: modelForTier(s.numbers['staff.ai.model_tier']),
        system: hintSystem(kind),
        user: StaffAiContextService.prompt(itemId, ctx, false),
        schema: hintSchema(kind),
        maxTokens: HINT_MAX_TOKENS,
        timeoutMs: s.numbers['staff.ai.hint_timeout_ms'],
      });
      const out: HintResult = {
        available: true,
        suggestion: res.value.suggestion,
        reason: res.value.reason,
        confidence: res.value.confidence,
        model: res.model,
        cached: false,
      };
      await this.redis.set(cacheKey, JSON.stringify(out), 'EX', HINT_TTL_SEC);
      await this.count('offered');
      return out;
    } catch (e) {
      if (e instanceof StaffAiNotEnabledError) throw notFound();
      return { available: false, cached: false, unavailable: unavailableOf(e) };
    }
  }

  /**
   * «ИИ предложил / человек принял»: the desk calls this when the human closes
   * an item that had a hint. Only counters (accepted / differed per day);
   * the decision itself is recorded by the desk as usual.
   */
  async recordOutcome(
    kind: string,
    itemId: string,
    chosen: string,
  ): Promise<void> {
    const raw = await this.redis.get(`staff:ai:hint:${kind}:${itemId}`);
    if (!raw) return;
    try {
      const hint = JSON.parse(raw) as HintResult;
      await this.count(hint.suggestion === chosen ? 'accepted' : 'differed');
    } catch {
      /* ignore a broken entry */
    }
  }

  private async count(
    field: 'offered' | 'accepted' | 'differed',
  ): Promise<void> {
    const key = `staff:ai:hint:stats:${new Date().toISOString().slice(0, 10)}`;
    await this.redis.hincrby(key, field, 1);
    await this.redis.expire(key, 45 * 86_400);
  }

  private async underRateLimit(
    adminId: string,
    perMinute: number,
  ): Promise<boolean> {
    const key = `staff:ai:hint:rl:${adminId}:${Math.floor(Date.now() / 60_000)}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 90);
    return n <= perMinute;
  }

  private async mayAdvise(
    admin: HintAdmin,
    kind: AiItemKind,
    itemId: string,
  ): Promise<boolean> {
    if (await this.staff.isOn('staff.lease_enabled')) {
      const lease = await this.prisma.workLease.findUnique({
        where: { kind_item_id: { kind, item_id: itemId } },
        select: { admin_id: true, leased_until: true },
      });
      return (
        lease?.admin_id === admin.id &&
        lease.leased_until !== null &&
        lease.leased_until.getTime() > Date.now()
      );
    }
    const kinds = ROLE_KINDS[admin.adminRole];
    return kinds === 'all' || kinds.includes(kind);
  }
}

function unavailableOf(e: unknown): HintUnavailable {
  if (e instanceof StaffAiBudgetError) return 'budget';
  if (e instanceof StaffAiTimeoutError) return 'timeout';
  if (e instanceof StaffAiNotConfiguredError) return 'not_configured';
  return 'error';
}
