import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type {
  ContentModerationHook,
  ModerationContext,
  ModerationVerdict,
} from './content-moderation.hook';

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|io|ru|app|co|info|biz|me)\b/gi;

/** Lower-cased, NFKC, punctuation collapsed — what the lists match against. */
export function normalizeForRules(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A term matches as a whole word/phrase (so "ass" does not hit "class"). */
export function containsTerm(normalized: string, term: string): boolean {
  const t = normalizeForRules(term);
  if (!t) return false;
  return ` ${normalized} `.includes(` ${t} `);
}

export function countLinks(text: string): number {
  return (text.match(URL_RE) ?? []).length;
}

/**
 * docs/06 §3.3 `ContentModerationHook`: rules only, no external AI.
 *  - `moderation.blocked_terms` → block (publication refused);
 *  - `moderation.hold_terms` → hold (published as `hidden`, moderator queue);
 *  - ≥ `moderation.max_links` links in one text → hold ("массовые ссылки");
 *  - the same text from the same author again within
 *    `moderation.duplicate_window_hours` → hold ("повторяющийся текст").
 * Lists and thresholds are app_config (edited in the admin panel, cached
 * by AppSettingsService). Redis failure never blocks publishing: the
 * duplicate rule is skipped.
 */
@Injectable()
export class RuleBasedModerationHook implements ContentModerationHook {
  constructor(
    private readonly settings: AppSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(
    content: string,
    context: ModerationContext,
  ): Promise<ModerationVerdict> {
    const normalized = normalizeForRules(content);
    const [blocked, hold, maxLinks, windowHours] = await Promise.all([
      this.settings.stringList('moderation.blocked_terms'),
      this.settings.stringList('moderation.hold_terms'),
      this.settings.number('moderation.max_links'),
      this.settings.number('moderation.duplicate_window_hours'),
    ]);
    if (blocked.some((t) => containsTerm(normalized, t))) return 'block';
    let verdict: ModerationVerdict = 'allow';
    if (hold.some((t) => containsTerm(normalized, t))) verdict = 'hold';
    if (maxLinks > 0 && countLinks(content) >= maxLinks) verdict = 'hold';
    if (windowHours > 0 && normalized.length > 0) {
      const key = `mod:dup:${context.kind}:${context.authorId}:${createHash(
        'sha256',
      )
        .update(normalized)
        .digest('hex')
        .slice(0, 32)}`;
      try {
        // One round trip and atomic (a crash between INCR and EXPIRE would
        // leave an immortal key).
        const [[, seenRaw]] = (await this.redis
          .multi()
          .incr(key)
          .expire(key, windowHours * 3600, 'NX')
          .exec()) ?? [[null, 0]];
        const seen = Number(seenRaw);
        if (seen > 1) verdict = 'hold';
      } catch {
        // Redis unavailable: skip the duplicate rule (best effort).
      }
    }
    return verdict;
  }
}
