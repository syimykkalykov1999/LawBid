import { z } from 'zod';
import type { AiSchema } from './staff-ai-client.service';
import type { AiItemKind } from './staff-ai.types';

const clampPct = (n: number): number =>
  Math.min(100, Math.max(0, Math.round(n)));
const short = (max: number) =>
  z.string().transform((s) => s.replace(/\s+/g, ' ').trim().slice(0, max));

/** What a reviewer could decide for each queue kind (the hint's menu). */
export const HINT_CHOICES: Readonly<
  Record<AiItemKind, readonly [string, ...string[]]>
> = {
  support_ticket: ['reply', 'resolve', 'ask_info', 'escalate'],
  report: ['dismiss', 'warn', 'hide', 'remove', 'escalate'],
  verification: ['approve', 'reject', 'request_info', 'escalate'],
};

// ---------------------------------------------------------------- nightly QA

export type QaVerdictValue = 'agree' | 'disagree' | 'unclear';
export interface QaVerdict {
  verdict: QaVerdictValue;
  /** 0-100: how sure the model is of its own verdict. */
  confidence: number;
  reason: string;
  betterOutcome: string;
}

const qaZod = z.object({
  verdict: z.enum(['agree', 'disagree', 'unclear']),
  confidence: z.number().transform(clampPct),
  reason: short(240),
  better_outcome: short(80),
});

export const QA_SCHEMA: AiSchema<QaVerdict> = {
  name: 'qa_verdict',
  json: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['agree', 'disagree', 'unclear'] },
      confidence: { type: 'integer' },
      reason: { type: 'string' },
      better_outcome: { type: 'string' },
    },
    required: ['verdict', 'confidence', 'reason', 'better_outcome'],
    additionalProperties: false,
  },
  parse(raw) {
    const v = qaZod.parse(raw);
    return {
      verdict: v.verdict,
      confidence: v.confidence,
      reason: v.reason,
      betterOutcome: v.better_outcome,
    };
  },
};

// -------------------------------------------------------------- desk hint

export interface HintAnswer {
  suggestion: string;
  reason: string;
  confidence: number;
}

export function hintSchema(kind: AiItemKind): AiSchema<HintAnswer> {
  const choices = HINT_CHOICES[kind];
  const zodSchema = z.object({
    suggestion: z.enum(choices as [string, ...string[]]),
    reason: short(200),
    confidence: z.number().transform(clampPct),
  });
  return {
    name: `hint_${kind}`,
    json: {
      type: 'object',
      properties: {
        suggestion: { type: 'string', enum: [...choices] },
        reason: { type: 'string' },
        confidence: { type: 'integer' },
      },
      required: ['suggestion', 'reason', 'confidence'],
      additionalProperties: false,
    },
    parse: (raw) => zodSchema.parse(raw),
  };
}

// ---------------------------------------------------- recommendation text

export interface SummaryAnswer {
  text: string;
}

const summaryZod = z.object({ text: short(700) });

export const SUMMARY_SCHEMA: AiSchema<SummaryAnswer> = {
  name: 'recommendation_text',
  json: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
  parse: (raw) => summaryZod.parse(raw),
};
