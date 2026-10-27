import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AutoModerationService, toMode } from './auto-moderation.service';
import type {
  ModerationContext,
  ModerationVerdict,
} from './content-moderation.hook';

const TIMEOUT_MS = 1500;
const MIN_CHARS = 12;
const MAX_CHARS = 4000;
const OPENAI_URL = 'https://api.openai.com/v1/moderations';

export interface Classification {
  category: string;
  score: number;
}

/** The provider seam: add Comprehend, Mistral, a local model... here. */
export interface TextClassifier {
  readonly name: string;
  /** Highest score among [categories], or null when the provider is not
   * configured or failed (the caller then lets the text through). */
  classify(text: string, categories: string[]): Promise<Classification | null>;
}

@Injectable()
export class OpenAiTextClassifier implements TextClassifier {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiTextClassifier.name);

  constructor(private readonly secrets: SecretsService) {}

  async classify(
    text: string,
    categories: string[],
  ): Promise<Classification | null> {
    const c = await this.secrets.get('openai_moderation');
    const key = c?.fields.apiKey;
    if (!key) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: text.slice(0, MAX_CHARS),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this.logger.warn(`moderation provider answered ${res.status}`);
        return null;
      }
      const body = (await res.json()) as {
        results?: { category_scores?: Record<string, number> }[];
      };
      return pickTop(body.results?.[0]?.category_scores ?? {}, categories);
    } catch (e) {
      this.logger.warn(`moderation provider failed: ${String(e)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Highest-scoring category among the ones we care about. */
export function pickTop(
  scores: Record<string, number>,
  categories: string[],
): Classification | null {
  let best: Classification | null = null;
  for (const cat of categories) {
    const s = scores[cat];
    if (typeof s === 'number' && (!best || s > best.score)) {
      best = { category: cat, score: s };
    }
  }
  return best;
}

export function decide(
  score: number,
  holdAt: number,
  blockAt: number,
): ModerationVerdict {
  if (blockAt > 0 && score >= blockAt) return 'block';
  if (holdAt > 0 && score >= holdAt) return 'hold';
  return 'allow';
}

/**
 * Owner 2026-10-27: automatic detection before any report. Text of new
 * posts and comments goes through a classifier (default: OpenAI
 * omni-moderation, free or about $0.00001 a call). Modes:
 *   off     nothing is sent anywhere;
 *   shadow  decisions are logged (moderation_detections) and nothing acts;
 *   enforce hold = published hidden into the queue, block = refused.
 * A daily cap on calls bounds the cost; a failure or timeout lets the text
 * through. Only harassment, hate, sexual and illicit categories are looked
 * at by default: lawyers legitimately discuss violence and crime. Spam,
 * scams and solicitation stay with the rule-based hook (lists, links,
 * duplicates). Strong enforced detections also feed the account score.
 */
@Injectable()
export class TextDetectorService {
  private readonly logger = new Logger(TextDetectorService.name);
  private readonly providers: Map<string, TextClassifier>;

  constructor(
    private readonly settings: AppSettingsService,
    private readonly prisma: PrismaService,
    private readonly auto: AutoModerationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    openai: OpenAiTextClassifier,
  ) {
    this.providers = new Map([[openai.name, openai]]);
  }

  async scan(text: string, ctx: ModerationContext): Promise<ModerationVerdict> {
    try {
      const mode = toMode(await this.settings.string('moderation.detect.mode'));
      if (mode === 'off' || text.trim().length < MIN_CHARS) return 'allow';
      const provider = this.providers.get(
        await this.settings.string('moderation.detect.provider'),
      );
      if (!provider) return 'allow';
      if (!(await this.underCap())) return 'allow';
      const [categories, holdAt, blockAt, logAt] = await Promise.all([
        this.settings.stringList('moderation.detect.categories'),
        this.settings.number('moderation.detect.hold_at'),
        this.settings.number('moderation.detect.block_at'),
        this.settings.number('moderation.detect.log_at'),
      ]);
      const top = await provider.classify(text, categories);
      if (!top) return 'allow';
      const decision = decide(top.score, holdAt, blockAt);
      const acted = mode === 'enforce' && decision !== 'allow';
      if (top.score >= logAt) {
        await this.prisma.moderationDetection.create({
          data: {
            user_id: ctx.authorId,
            content_kind: ctx.kind,
            provider: provider.name,
            mode,
            category: top.category,
            score: top.score,
            decision,
            acted,
          },
        });
      }
      if (acted) await this.auto.evaluateAccount(ctx.authorId);
      return mode === 'enforce' ? decision : 'allow';
    } catch (e) {
      this.logger.warn(`text detection skipped: ${String(e)}`);
      return 'allow';
    }
  }

  /** Counts today's calls; over the cap the text goes through unchecked. */
  private async underCap(): Promise<boolean> {
    const cap = await this.settings.number('moderation.detect.daily_cap');
    if (cap <= 0) return false;
    const key = `detect:day:${new Date().toISOString().slice(0, 10)}`;
    try {
      const [[, n]] = (await this.redis
        .multi()
        .incr(key)
        .expire(key, 2 * 24 * 3600, 'NX')
        .exec()) ?? [[null, 0]];
      return Number(n) <= cap;
    } catch {
      return true;
    }
  }
}
