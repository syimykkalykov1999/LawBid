/**
 * Staff package T12: shared types of AI mode (master switch
 * `staff.ai_enabled`, every sub-switch OFF by default, owner rule
 * 2026-10-27: «без ИИ по умолчанию; при выключенном ИИ ни одного ИИ-вызова»).
 */

/** The three AI features, each behind its own sub-switch. */
export type StaffAiFeature = 'qa' | 'hint' | 'summary';

export const FEATURE_SWITCH = {
  qa: 'staff.ai_qa_enabled',
  hint: 'staff.ai_hint_enabled',
  summary: 'staff.ai_summary_enabled',
} as const satisfies Record<StaffAiFeature, string>;

/** Models (exact ids, never date-suffixed). */
export const STAFF_AI_MODELS = [
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
] as const;
export type StaffAiModel = (typeof STAFF_AI_MODELS)[number];

/** `staff.ai.model_tier`: 0 = Haiku 5.5 (default), 1 = Sonnet 5.5. */
export function modelForTier(tier: number): StaffAiModel {
  return tier === 1 ? 'claude-sonnet-5-5' : 'claude-haiku-5-5';
}

/** The AI switch (master or the feature's own) is off: nothing was called. */
export class StaffAiNotEnabledError extends Error {
  constructor(readonly feature: StaffAiFeature) {
    super(`Staff AI feature "${feature}" is not enabled`);
    this.name = 'StaffAiNotEnabledError';
  }
}

/** Switch is on but no Claude key is stored in «Ключи и сервисы». */
export class StaffAiNotConfiguredError extends Error {
  constructor() {
    super('No Claude API key is stored for the staff AI mode');
    this.name = 'StaffAiNotConfiguredError';
  }
}

/** The monthly ceiling (`staff.ai.monthly_cents`) is reached: calls stop. */
export class StaffAiBudgetError extends Error {
  constructor(
    readonly limitMillicents: number,
    readonly spentMillicents: number,
  ) {
    super('Staff AI monthly spend ceiling reached');
    this.name = 'StaffAiBudgetError';
  }
}

/** The request did not finish in time (hint: 3 s by default). */
export class StaffAiTimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`Claude API did not answer within ${ms} ms`);
    this.name = 'StaffAiTimeoutError';
  }
}

/** Claude API answered with a non-2xx status, a refusal or a cut-off. */
export class StaffAiApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'StaffAiApiError';
  }
}

/** The model answered, but not with JSON that fits the schema. */
export class StaffAiSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffAiSchemaError';
  }
}

/** Token usage of one answer (Messages API `usage`). */
export interface StaffAiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Queue kinds the AI can look at (work_leases.kind of the supported queues). */
export const AI_ITEM_KINDS = [
  'support_ticket',
  'report',
  'verification',
] as const;
export type AiItemKind = (typeof AI_ITEM_KINDS)[number];
export const isAiItemKind = (k: string): k is AiItemKind =>
  (AI_ITEM_KINDS as readonly string[]).includes(k);
