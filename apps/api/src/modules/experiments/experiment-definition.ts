import type { VariantWeight } from './experiment-math';

/** Stops the experiment by itself when a guardrail metric gets this much worse. */
export interface Guardrails {
  /** Reports per 1000 impressions: stop above +X% vs control. */
  reportsRelIncreasePct: number;
  /** Errors per 1000 impressions: stop above +X% vs control. */
  errorsRelIncreasePct: number;
  /** Do not judge a guardrail before this many impressions per variant. */
  minImpressions: number;
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  reportsRelIncreasePct: 25,
  errorsRelIncreasePct: 25,
  minImpressions: 1000,
};

export const EXPERIMENT_KEY_RE = /^[a-z][a-z0-9_]{2,63}$/;
export const VARIANT_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
export const SURFACE_RE = /^[a-z][a-z0-9_]{1,39}$/;

export interface DefinitionInput {
  key: string;
  variants: VariantWeight[];
  guardrails?: Partial<Guardrails> | null;
}

/** Why a definition is refused, in plain Russian; null when it is fine. */
export function definitionProblem(d: DefinitionInput): string | null {
  if (!EXPERIMENT_KEY_RE.test(d.key)) {
    return 'Ключ: латиница, цифры и «_», от 3 символов, с буквы';
  }
  const vs = d.variants;
  if (!Array.isArray(vs) || vs.length < 2 || vs.length > 5) {
    return 'Нужно от 2 до 5 вариантов';
  }
  if (vs[0].key !== 'control') {
    return 'Первый вариант должен называться control (как сейчас, без изменений)';
  }
  const seen = new Set<string>();
  let sum = 0;
  for (const v of vs) {
    if (!VARIANT_KEY_RE.test(v.key)) return `Имя варианта «${v.key}» не подходит`;
    if (seen.has(v.key)) return `Вариант «${v.key}» повторяется`;
    seen.add(v.key);
    if (!Number.isInteger(v.weight) || v.weight < 1) {
      return 'Доли вариантов — целые числа от 1';
    }
    sum += v.weight;
  }
  if (sum !== 100) return 'Доли вариантов должны дать ровно 100';
  const g = normalizeGuardrails(d.guardrails);
  if (g.reportsRelIncreasePct < 1 || g.reportsRelIncreasePct > 500) {
    return 'Порог жалоб: от 1 до 500 процентов';
  }
  if (g.errorsRelIncreasePct < 1 || g.errorsRelIncreasePct > 500) {
    return 'Порог ошибок: от 1 до 500 процентов';
  }
  if (g.minImpressions < 100 || g.minImpressions > 1_000_000) {
    return 'Минимум показов для проверки: от 100 до 1 000 000';
  }
  return null;
}

export function normalizeGuardrails(
  g: Partial<Guardrails> | null | undefined,
): Guardrails {
  const pick = (v: unknown, d: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : d;
  return {
    reportsRelIncreasePct: pick(
      g?.reportsRelIncreasePct,
      DEFAULT_GUARDRAILS.reportsRelIncreasePct,
    ),
    errorsRelIncreasePct: pick(
      g?.errorsRelIncreasePct,
      DEFAULT_GUARDRAILS.errorsRelIncreasePct,
    ),
    minImpressions: pick(g?.minImpressions, DEFAULT_GUARDRAILS.minImpressions),
  };
}

/** Reads the stored variants JSON defensively. */
export function parseVariants(raw: unknown): VariantWeight[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantWeight[] = [];
  for (const v of raw) {
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as VariantWeight).key === 'string' &&
      typeof (v as VariantWeight).weight === 'number'
    ) {
      out.push({ key: (v as VariantWeight).key, weight: (v as VariantWeight).weight });
    }
  }
  return out;
}
