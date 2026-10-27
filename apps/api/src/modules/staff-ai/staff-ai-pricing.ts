import type { StaffAiModel, StaffAiUsage } from './staff-ai.types';

/**
 * Staff package T12: list prices of the models AI mode may use, in CENTS per
 * million tokens (prompts up to 100K tokens; checked 2026-10-27 against the
 * Claude pricing page, https://platform.claude.com/docs/en/about-claude/pricing:
 * Haiku 5.5 $0.10 / $0.50 per MTok, Sonnet 5.5 $2 / $10, batch = half).
 * Money inside the budget guard is counted in MILLICENTS (1/1000 of a cent)
 * so a tiny call is still a whole number in Redis.
 */
export const MODEL_PRICES_CENTS_PER_MTOK: Readonly<
  Record<StaffAiModel, { input: number; output: number; cacheRead: number }>
> = {
  // cacheRead = share of the input price (Sonnet 5.5 reads at 0.05 x, Haiku 5.5 at 0.1 x).
  'claude-haiku-5-5': { input: 10, output: 50, cacheRead: 0.1 },
  'claude-sonnet-5-5': { input: 200, output: 1000, cacheRead: 0.05 },
};

/** 1-hour cache write = 2 x input (5-minute write = 1.25 x). */
const CACHE_WRITE_1H = 2;
/** The Batches API takes 50 % off every token. */
const BATCH_FACTOR = 0.5;

/** Millicents for one answer's usage (rounded up, never zero for real use). */
export function costMillicents(
  model: StaffAiModel,
  usage: StaffAiUsage,
  batch: boolean,
): number {
  const p = MODEL_PRICES_CENTS_PER_MTOK[model];
  const freshIn = usage.input_tokens;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const inputCents =
    ((freshIn + cacheRead * p.cacheRead + cacheWrite * CACHE_WRITE_1H) *
      p.input) /
    1_000_000;
  const outputCents = (usage.output_tokens * p.output) / 1_000_000;
  const millicents =
    (inputCents + outputCents) * 1000 * (batch ? BATCH_FACTOR : 1);
  return Math.ceil(millicents);
}

/** Rough token count of a text (Russian and English mixed: ~2.5 chars / token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5);
}

/**
 * Upper bound of a call's price BEFORE it is made: every input token at the
 * full (cache-write) price and the whole `maxTokens` as output. Reserved in
 * the budget, then settled to the real usage after the answer.
 */
export function estimateMillicents(
  model: StaffAiModel,
  inputTokens: number,
  maxTokens: number,
  batch: boolean,
): number {
  return costMillicents(
    model,
    {
      input_tokens: 0,
      cache_creation_input_tokens: inputTokens,
      output_tokens: maxTokens,
    },
    batch,
  );
}
