import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_ASSISTANT_SEATS, TRIAL_DAYS } from '../billing/billing.constants';
import {
  type Audience,
  BASELINE_DEFAULTS,
  type Entitlements,
  sanitizeEntitlements,
} from './entitlement-catalog';

export type PlanInterval = 'month' | 'year';
export type PlanStatus = 'draft' | 'active' | 'archived';
export type LocalizedText = { en?: string; ru?: string };

/** The plans every install starts with (owner 2026-10-05): the attorney's
 * monthly and yearly plans and the client's plan, priced by the existing
 * Prices rows (monthly / yearly / client_badge), plus one baseline per
 * audience. The admin edits them from here on; nothing is hard-coded. */
export const BUILTIN_PLAN_CODES = {
  attorneyBaseline: 'attorney_free',
  attorneyMonthly: 'attorney_monthly',
  attorneyYearly: 'attorney_yearly',
  clientBaseline: 'client_free',
  clientPlus: 'client_plus',
} as const;

const CACHE_MS = 5_000;

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  private cache: { at: number; rows: Plan[] } | null = null;
  private seeded = false;

  constructor(private readonly prisma: PrismaService) {}

  invalidate(): void {
    this.cache = null;
  }

  /** Every plan (any status), seeded on first use. */
  async all(): Promise<Plan[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.rows;
    }
    await this.ensureSeeded();
    const rows = await this.prisma.plan.findMany({
      orderBy: [{ audience: 'asc' }, { sort: 'asc' }, { created_at: 'asc' }],
    });
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  async byId(id: string): Promise<Plan> {
    const plan = (await this.all()).find((p) => p.id === id);
    if (!plan) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Plan not found.',
      });
    }
    return plan;
  }

  async byCode(code: string): Promise<Plan | null> {
    return (await this.all()).find((p) => p.code === code) ?? null;
  }

  /** Active paid plans a user of [audience] may buy, in admin order. */
  async purchasable(audience: Audience): Promise<Plan[]> {
    return (await this.all()).filter(
      (p) =>
        p.audience === audience && p.kind === 'paid' && p.status === 'active',
    );
  }

  /** The baseline (no subscription) plan of [audience]. */
  async baseline(audience: Audience): Promise<Plan | null> {
    return (
      (await this.all()).find(
        (p) => p.audience === audience && p.kind === 'baseline',
      ) ?? null
    );
  }

  /** The plan legacy flows buy when no planCode is given: the audience's
   * default of that interval, else its first active paid plan. */
  async defaultFor(
    audience: Audience,
    interval?: PlanInterval,
  ): Promise<Plan | null> {
    const list = await this.purchasable(audience);
    const same = interval ? list.filter((p) => p.interval === interval) : list;
    return same.find((p) => p.is_default) ?? same[0] ?? null;
  }

  /** A plan's entitlements, cleaned against the catalog. */
  entitlementsOf(plan: Pick<Plan, 'audience' | 'entitlements'>): Entitlements {
    return sanitizeEntitlements(plan.audience as Audience, plan.entitlements);
  }

  /** Baseline defaults ← the baseline plan's values. */
  async baselineEntitlements(audience: Audience): Promise<Entitlements> {
    const row = await this.baseline(audience);
    return {
      ...BASELINE_DEFAULTS[audience],
      ...(row ? this.entitlementsOf(row) : {}),
    };
  }

  /** Create the built-in plans once (idempotent; a deleted built-in plan
   * is not recreated — the admin decides). */
  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    const count = await this.prisma.plan.count();
    if (count === 0) {
      await this.prisma.plan.createMany({
        data: seedPlans(),
        skipDuplicates: true,
      });
      this.logger.log('built-in plans seeded');
    }
    this.seeded = true;
  }
}

export function text(v: unknown): LocalizedText {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: LocalizedText = {};
  if (typeof o.en === 'string') out.en = o.en;
  if (typeof o.ru === 'string') out.ru = o.ru;
  return out;
}

export function highlights(v: unknown): LocalizedText[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(text)
    .filter((t) => (t.en ?? '').trim() || (t.ru ?? '').trim())
    .slice(0, 20);
}

export function seedPlans() {
  const B = BUILTIN_PLAN_CODES;
  return [
    {
      code: B.attorneyBaseline,
      audience: 'attorney',
      kind: 'baseline',
      name: { en: 'No subscription', ru: 'Без подписки' },
      status: 'active',
      sort: 0,
      entitlements: BASELINE_DEFAULTS.attorney,
    },
    {
      code: B.attorneyMonthly,
      audience: 'attorney',
      kind: 'paid',
      name: { en: 'Monthly', ru: 'Месячный' },
      tagline: {
        en: 'Attorney account, assistants added as you need',
        ru: 'Аккаунт адвоката, помощники добавляются по мере нужды',
      },
      interval: 'month',
      price_kind: 'monthly',
      status: 'active',
      sort: 10,
      is_default: true,
      entitlements: {
        included_seats: 0,
        max_seats: MAX_ASSISTANT_SEATS,
        extra_seat_price_cents: null,
        bids_any_state: true,
        max_active_bids: 0,
        priority_search: false,
        calls: true,
        video_calls: true,
        document_templates: true,
        chat_translate: true,
        video_posts: true,
        platform_payments: true,
        case_promotion: true,
        trial_days: TRIAL_DAYS,
      },
    },
    {
      code: B.attorneyYearly,
      audience: 'attorney',
      kind: 'paid',
      name: { en: 'Prime — yearly', ru: 'Prime — годовой' },
      tagline: {
        en: 'A year ahead, assistants included',
        ru: 'Год вперёд, помощники включены',
      },
      interval: 'year',
      price_kind: 'yearly',
      status: 'active',
      sort: 20,
      is_default: true,
      entitlements: {
        included_seats: MAX_ASSISTANT_SEATS,
        max_seats: MAX_ASSISTANT_SEATS,
        extra_seat_price_cents: null,
        bids_any_state: true,
        max_active_bids: 0,
        priority_search: true,
        calls: true,
        video_calls: true,
        document_templates: true,
        chat_translate: true,
        video_posts: true,
        platform_payments: true,
        trial_days: TRIAL_DAYS,
      },
    },
    {
      code: B.clientBaseline,
      audience: 'client',
      kind: 'baseline',
      name: { en: 'No subscription', ru: 'Без подписки' },
      status: 'active',
      sort: 0,
      entitlements: BASELINE_DEFAULTS.client,
    },
    {
      code: B.clientPlus,
      audience: 'client',
      kind: 'paid',
      name: { en: 'Verified client', ru: 'Проверенный клиент' },
      tagline: {
        en: 'Gold badge and your cases shown first',
        ru: 'Золотая галочка и ваши кейсы — первыми',
      },
      interval: 'month',
      price_kind: 'client_badge',
      status: 'active',
      sort: 10,
      is_default: true,
      entitlements: {
        verified_badge: true,
        priority_feed: true,
        calls: true,
        video_calls: true,
        document_templates: true,
        chat_translate: true,
        video_posts: true,
        max_active_cases: 0,
        trial_days: 0,
      },
    },
  ];
}
