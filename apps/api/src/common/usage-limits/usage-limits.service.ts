import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { AppSettingKey } from '../app-settings/app-settings.defaults';
import { ErrorCode } from '../errors/error-code.enum';
import { RateLimitService } from '../../modules/auth/services/rate-limit.service';

/** docs/05 §13 per-user action limits (values in app_config, editable
 * from the admin panel without a release). */
export type LimitedAction =
  | 'post_create'
  | 'comment'
  | 'like'
  | 'follow'
  | 'message'
  | 'search'
  | 'report'
  | 'video_upload'
  | 'sticker_pack_create'
  | 'sticker_add';

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
};

/**
 * docs/05 §13: "Превышение: 429 RATE_LIMITED с локализованным текстом".
 * Fixed window per (action, user) in Redis (one atomic EVAL).
 */
@Injectable()
export class UsageLimitsService {
  constructor(
    private readonly limiter: RateLimitService,
    private readonly settings: AppSettingsService,
  ) {}

  async consume(action: LimitedAction, userId: string): Promise<void> {
    const rule = USAGE_LIMITS[action];
    const limit = await this.settings.number(rule.setting);
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
