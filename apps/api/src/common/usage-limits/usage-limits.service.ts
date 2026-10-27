import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { AppSettingKey } from '../app-settings/app-settings.defaults';
import type { EntitlementKey } from '../../modules/plans/entitlement-catalog';
import { EntitlementsService } from '../../modules/plans/entitlements.service';
import { ErrorCode } from '../errors/error-code.enum';
import { RateLimitService } from '../../modules/auth/services/rate-limit.service';
import { StrikeGate } from './strike-gate.service';

/** docs/05 §13 per-user action limits (values in app_config, editable
 * from the admin panel without a release). */
export type LimitedAction =
  | 'post_create'
  | 'comment'
  | 'like'
  | 'follow'
  | 'message'
  | 'search'
  | 'search_suggest'
  | 'contacts_sync'
  | 'report'
  | 'video_upload'
  | 'sticker_pack_create'
  | 'sticker_add'
  // Owner 2026-10-20: stories and channels.
  | 'story_create'
  | 'channel_create'
  // Owner 2026-10-22 (audit #4 §6): groups per day, posts per hour.
  | 'group_create'
  | 'post_create_hourly'
  | 'channel_post'
  | 'channel_comment'
  | 'consultation_book'
  | 'question_create'
  | 'answer_create'
  | 'answer_create_daily'
  // Owner 2026-10-25 (abuse hardening): offers, counters, cases, saved, forward.
  | 'bid_create'
  | 'bid_counter'
  | 'case_create'
  | 'chat_save'
  | 'forward';

const HOUR = 3600;
const DAY = 24 * HOUR;

export const USAGE_LIMITS: Record<
  LimitedAction,
  { setting: AppSettingKey; windowSec: number }
> = {
  post_create: { setting: 'rate_limit.post_create_per_day', windowSec: DAY },
  comment: { setting: 'rate_limit.comment_per_hour', windowSec: HOUR },
  // §13: one budget for post and comment likes.
  like: { setting: 'rate_limit.like_per_hour', windowSec: HOUR },
  follow: { setting: 'rate_limit.follow_per_day', windowSec: DAY },
  message: { setting: 'rate_limit.message_per_minute', windowSec: 60 },
  search: { setting: 'rate_limit.search_per_minute', windowSec: 60 },
  // S7-2: type-ahead fires on every keystroke, so it has its own, larger
  // budget (Elastic/Algolia both bill and limit search-as-you-type apart
  // from full queries); a full search keeps the strict one above.
  search_suggest: {
    setting: 'rate_limit.search_suggest_per_minute',
    windowSec: 60,
  },
  contacts_sync: {
    setting: 'rate_limit.contacts_sync_per_hour',
    windowSec: HOUR,
  },
  report: { setting: 'rate_limit.report_per_day', windowSec: DAY },
  // Owner 2026-10-01: reels and stickers.
  video_upload: {
    setting: 'rate_limit.video_upload_per_day',
    windowSec: DAY,
  },
  sticker_pack_create: {
    setting: 'rate_limit.sticker_pack_create_per_day',
    windowSec: DAY,
  },
  sticker_add: { setting: 'rate_limit.sticker_add_per_hour', windowSec: HOUR },
  story_create: { setting: 'rate_limit.story_create_per_day', windowSec: DAY },
  channel_create: {
    setting: 'rate_limit.channel_create_per_day',
    windowSec: DAY,
  },
  group_create: {
    setting: 'rate_limit.group_create_per_day',
    windowSec: DAY,
  },
  post_create_hourly: {
    setting: 'rate_limit.post_create_per_hour',
    windowSec: HOUR,
  },
  channel_post: {
    setting: 'rate_limit.channel_post_per_hour',
    windowSec: HOUR,
  },
  channel_comment: {
    setting: 'rate_limit.channel_comment_per_hour',
    windowSec: HOUR,
  },
  // Owner 2026-10-20: consultations and «Вопрос юристу».
  consultation_book: {
    setting: 'rate_limit.consultation_book_per_day',
    windowSec: DAY,
  },
  question_create: { setting: 'rate_limit.question_per_day', windowSec: DAY },
  answer_create: { setting: 'rate_limit.answer_per_hour', windowSec: HOUR },
  // Owner 2026-10-28 (legal safety): a daily ceiling on top of the hourly one.
  answer_create_daily: {
    setting: 'rate_limit.answer_per_day',
    windowSec: DAY,
  },
  bid_create: { setting: 'rate_limit.bid_create_per_day', windowSec: DAY },
  bid_counter: { setting: 'rate_limit.bid_counter_per_hour', windowSec: HOUR },
  case_create: { setting: 'rate_limit.case_create_per_day', windowSec: DAY },
  chat_save: { setting: 'rate_limit.chat_save_per_minute', windowSec: 60 },
  forward: { setting: 'rate_limit.forward_per_minute', windowSec: 60 },
};

/**
 * docs/05 §13: "Превышение: 429 RATE_LIMITED с локализованным текстом".
 * Fixed window per (action, user) in Redis (one atomic EVAL).
 */
/** Owner 2026-10-05 (plan builder): limits a plan may raise or lift. */
const PLAN_LIMITS: Partial<Record<LimitedAction, EntitlementKey>> = {
  post_create: 'posts_per_day',
  video_upload: 'videos_per_day',
};

@Injectable()
export class UsageLimitsService {
  constructor(
    private readonly limiter: RateLimitService,
    private readonly settings: AppSettingsService,
    @Optional() private readonly entitlements?: EntitlementsService,
    // Owner 2026-10-27: the strike ladder (cooldown / limited / suspended).
    @Optional() private readonly strikes?: StrikeGate,
  ) {}

  async consume(action: LimitedAction, userId: string): Promise<void> {
    await this.strikes?.check(action, userId);
    const rule = USAGE_LIMITS[action];
    let limit = await this.settings.number(rule.setting);
    const planKey = PLAN_LIMITS[action];
    if (planKey && this.entitlements) {
      const own = await this.entitlements.limit(userId, planKey);
      if (own === 0) return; // the plan lifts the limit
      if (own != null && own > 0) limit = own;
    }
    const result = await this.limiter.consumeFixedWindow(
      ['usage', action, userId],
      limit,
      rule.windowSec,
    );
    if (!result.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Try again later.',
          details: { action, retryAfterSeconds: result.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
