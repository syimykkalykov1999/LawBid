/**
 * Owner 2026-10-14: a bar number is checked for its STATE'S shape the
 * moment it is typed, so "just some digits" never reaches a reviewer.
 * The table below is the default; the owner overrides states (or all of
 * them) in the admin setting `verification.bar_formats` (JSON). A state
 * that is not listed only needs 4+ characters with at least 3 digits.
 */
export interface BarFormat {
  /** Regular expression of the normalized number (upper case, no spaces,
   * dots, dashes or slashes). */
  pattern: string;
  /** Shown to the person when the number does not fit. */
  example: string;
}

export const DEFAULT_BAR_FORMATS: Record<string, BarFormat> = {
  NY: { pattern: '^\\d{4,7}$', example: '1234567' },
  CA: { pattern: '^\\d{5,6}$', example: '123456' },
  TX: { pattern: '^\\d{8}$', example: '24012345' },
  FL: { pattern: '^\\d{5,7}$', example: '123456' },
  IL: { pattern: '^\\d{6,7}$', example: '6281234' },
  NJ: { pattern: '^\\d{9}$', example: '012342010' },
  MA: { pattern: '^\\d{6}$', example: '654321' },
  MI: { pattern: '^P\\d{5}$', example: 'P12345' },
  PA: { pattern: '^\\d{5,6}$', example: '123456' },
  OH: { pattern: '^\\d{7}$', example: '0012345' },
  GA: { pattern: '^\\d{5,6}$', example: '123456' },
  WA: { pattern: '^\\d{4,6}$', example: '12345' },
};

export interface BarCheck {
  ok: boolean;
  /** The number as it is stored when the state has a format. */
  normalized: string;
  example: string | null;
}

/** Defaults overlaid with the admin's JSON; a broken JSON changes nothing. */
export function resolveFormats(raw: string): Record<string, BarFormat> {
  if (!raw.trim()) return DEFAULT_BAR_FORMATS;
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<BarFormat>>;
    const out = { ...DEFAULT_BAR_FORMATS };
    for (const [state, f] of Object.entries(parsed)) {
      if (typeof f?.pattern !== 'string') continue;
      new RegExp(f.pattern); // throws on a bad pattern → ignored below
      out[state.toUpperCase()] = {
        pattern: f.pattern,
        example: typeof f.example === 'string' ? f.example : '',
      };
    }
    return out;
  } catch {
    return DEFAULT_BAR_FORMATS;
  }
}

export function checkBarNumber(
  stateCode: string,
  raw: string,
  formats: Record<string, BarFormat>,
): BarCheck {
  const upper = raw.trim().toUpperCase();
  const format = formats[stateCode.toUpperCase()];
  if (!format) {
    const digits = (upper.match(/\d/g) ?? []).length;
    return {
      ok: upper.length >= 4 && digits >= 3,
      normalized: upper,
      example: null,
    };
  }
  const normalized = upper.replace(/[\s./-]/g, '');
  return {
    ok: new RegExp(format.pattern).test(normalized),
    normalized,
    example: format.example || null,
  };
}
