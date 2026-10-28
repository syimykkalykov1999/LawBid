/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md
 * §2.3): the rich payment terms an attorney may put on a bid (and either
 * side on a counter-offer) while the admin switch `bids.rich_terms_enabled`
 * is on. Pure functions: no Nest, no Prisma, so the same rules run in the
 * unit tests, the DTO pipe and the PDF builder.
 *
 * Amounts are integer cents (USD only for now), percentages basis points.
 * The classic `fee_type / amount_cents / percent_bps` columns stay the
 * headline of the bid; this object only adds detail.
 */
export const PAYMENT_TERMS_VERSION = 1;

export const PAYMENT_TERMS_TYPES = [
  'flat',
  'hourly',
  'contingency_pct',
  'retainer_plus_installments',
  'mixed',
  'to_be_clarified',
] as const;
export type PaymentTermsType = (typeof PAYMENT_TERMS_TYPES)[number];

export const INSTALLMENT_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export type InstallmentPeriod = (typeof INSTALLMENT_PERIODS)[number];

export const PAYMENT_TERMS_AMOUNT_MAX_CENTS = 1_000_000_000;
export const PAYMENT_TERMS_BPS_MAX = 10_000;
export const PAYMENT_TERMS_NOTES_MAX = 1000;
export const PAYMENT_TERMS_INSTALLMENTS_MAX = 120;
export const PAYMENT_TERMS_HOURS_MAX = 100_000;

export interface PaymentTerms {
  version: number;
  type: PaymentTermsType;
  currency: 'USD';
  flatCents?: number;
  hourlyRateCents?: number;
  estimatedHoursMin?: number;
  estimatedHoursMax?: number;
  contingencyBps?: number;
  retainerCents?: number;
  installmentCents?: number;
  installmentCount?: number;
  installmentPeriod?: InstallmentPeriod;
  notes?: string;
}

const AMOUNT_FIELDS = [
  'flatCents',
  'hourlyRateCents',
  'contingencyBps',
  'retainerCents',
  'installmentCents',
] as const;

const KNOWN_FIELDS = new Set<string>([
  'version',
  'type',
  'currency',
  ...AMOUNT_FIELDS,
  'estimatedHoursMin',
  'estimatedHoursMax',
  'installmentCount',
  'installmentPeriod',
  'notes',
]);

/** Field-level problems; empty = valid. */
export function paymentTermsProblems(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['paymentTerms must be an object'];
  }
  const t = input as Record<string, unknown>;
  const problems: string[] = [];
  for (const k of Object.keys(t)) {
    if (!KNOWN_FIELDS.has(k)) problems.push(`unknown field ${k}`);
  }
  if (t.version !== PAYMENT_TERMS_VERSION) {
    problems.push(`version must be ${PAYMENT_TERMS_VERSION}`);
  }
  if (t.currency !== 'USD') problems.push('currency must be USD');
  const type = t.type as PaymentTermsType;
  if (!PAYMENT_TERMS_TYPES.includes(type)) {
    problems.push('type is not one of the payment term types');
    return problems;
  }
  const int = (k: string, min: number, max: number) => {
    const v = t[k];
    if (v === undefined || v === null) return undefined;
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
      problems.push(`${k} must be an integer ${min}..${max}`);
      return undefined;
    }
    return v as number;
  };
  const flat = int('flatCents', 1, PAYMENT_TERMS_AMOUNT_MAX_CENTS);
  const hourly = int('hourlyRateCents', 1, PAYMENT_TERMS_AMOUNT_MAX_CENTS);
  const hMin = int('estimatedHoursMin', 1, PAYMENT_TERMS_HOURS_MAX);
  const hMax = int('estimatedHoursMax', 1, PAYMENT_TERMS_HOURS_MAX);
  const bps = int('contingencyBps', 1, PAYMENT_TERMS_BPS_MAX);
  const retainer = int('retainerCents', 1, PAYMENT_TERMS_AMOUNT_MAX_CENTS);
  const inst = int('installmentCents', 1, PAYMENT_TERMS_AMOUNT_MAX_CENTS);
  const count = int('installmentCount', 1, PAYMENT_TERMS_INSTALLMENTS_MAX);
  const period = t.installmentPeriod;
  if (
    period !== undefined &&
    period !== null &&
    !INSTALLMENT_PERIODS.includes(period as InstallmentPeriod)
  ) {
    problems.push('installmentPeriod must be weekly, monthly or quarterly');
  }
  if (t.notes !== undefined && t.notes !== null) {
    if (
      typeof t.notes !== 'string' ||
      t.notes.length > PAYMENT_TERMS_NOTES_MAX
    ) {
      problems.push(`notes must be a string up to ${PAYMENT_TERMS_NOTES_MAX}`);
    }
  }
  if (hMin !== undefined && hMax !== undefined && hMin > hMax) {
    problems.push('estimatedHoursMin must not exceed estimatedHoursMax');
  }
  if ((hMin !== undefined || hMax !== undefined) && hourly === undefined) {
    problems.push('estimated hours need hourlyRateCents');
  }
  const installmentParts = [inst, count, period].filter(
    (x) => x !== undefined && x !== null,
  ).length;
  if (installmentParts !== 0 && installmentParts !== 3) {
    problems.push(
      'installmentCents, installmentCount and installmentPeriod go together',
    );
  }
  const need = (k: string, v: unknown) => {
    if (v === undefined) problems.push(`${type} needs ${k}`);
  };
  const forbid = (k: string, v: unknown) => {
    if (v !== undefined && v !== null) {
      problems.push(`${type} must not have ${k}`);
    }
  };
  switch (type) {
    case 'flat':
      need('flatCents', flat);
      forbid('hourlyRateCents', t.hourlyRateCents);
      forbid('contingencyBps', t.contingencyBps);
      forbid('retainerCents', t.retainerCents);
      forbid('installmentCents', t.installmentCents);
      break;
    case 'hourly':
      need('hourlyRateCents', hourly);
      forbid('flatCents', t.flatCents);
      forbid('contingencyBps', t.contingencyBps);
      forbid('installmentCents', t.installmentCents);
      break;
    case 'contingency_pct':
      need('contingencyBps', bps);
      forbid('flatCents', t.flatCents);
      forbid('hourlyRateCents', t.hourlyRateCents);
      forbid('installmentCents', t.installmentCents);
      break;
    case 'retainer_plus_installments':
      need('retainerCents', retainer);
      need('installmentCents', inst);
      need('installmentCount', count);
      need('installmentPeriod', period ?? undefined);
      forbid('flatCents', t.flatCents);
      forbid('contingencyBps', t.contingencyBps);
      break;
    case 'mixed':
      if (AMOUNT_FIELDS.every((k) => t[k] === undefined || t[k] === null)) {
        problems.push('mixed needs at least one amount');
      }
      break;
    case 'to_be_clarified':
      for (const k of AMOUNT_FIELDS) forbid(k, t[k]);
      forbid('installmentCount', t.installmentCount);
      break;
  }
  return problems;
}

export const isValidPaymentTerms = (input: unknown): input is PaymentTerms =>
  paymentTermsProblems(input).length === 0;

/** Drops null / undefined fields so the stored JSON is canonical. */
export function normalizePaymentTerms(input: PaymentTerms): PaymentTerms {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(input).sort()) {
    const v = (input as unknown as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out as unknown as PaymentTerms;
}

const usd = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const pct = (bps: number): string =>
  `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} %`;

const PERIOD_WORD: Record<InstallmentPeriod, string> = {
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
};

/**
 * One English line per term, exactly from the data (no legal wording), for
 * the deal record PDF and the admin preview. `notes` is appended verbatim.
 */
export function describePaymentTerms(t: PaymentTerms): string[] {
  const lines: string[] = [];
  if (t.type === 'to_be_clarified') {
    lines.push('Payment terms to be clarified between the parties.');
  }
  if (t.flatCents !== undefined) lines.push(`Flat fee ${usd(t.flatCents)}.`);
  if (t.hourlyRateCents !== undefined) {
    let s = `Hourly rate ${usd(t.hourlyRateCents)} per hour`;
    if (
      t.estimatedHoursMin !== undefined ||
      t.estimatedHoursMax !== undefined
    ) {
      const a = t.estimatedHoursMin ?? t.estimatedHoursMax;
      const b = t.estimatedHoursMax ?? t.estimatedHoursMin;
      s += a === b ? `, about ${a} hours` : `, about ${a}–${b} hours`;
    }
    lines.push(`${s}.`);
  }
  if (t.contingencyBps !== undefined) {
    lines.push(`Contingency fee ${pct(t.contingencyBps)} of the recovery.`);
  }
  if (t.retainerCents !== undefined) {
    lines.push(`Retainer ${usd(t.retainerCents)}.`);
  }
  if (
    t.installmentCents !== undefined &&
    t.installmentCount !== undefined &&
    t.installmentPeriod
  ) {
    lines.push(
      `${t.installmentCount} ${PERIOD_WORD[t.installmentPeriod]} payments of ${usd(t.installmentCents)} (total ${usd(t.installmentCents * t.installmentCount)}).`,
    );
  }
  if (t.notes) lines.push(`Notes: ${t.notes}`);
  return lines;
}
