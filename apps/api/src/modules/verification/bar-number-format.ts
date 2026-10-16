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
  AK: { pattern: '^\\d{5,7}$', example: '0306032' },
  AL: {
    pattern: '^(?:((ASB)?\\d{4}[A-Z]\\d{2}[A-Z]|[A-Z]{3}\\d{3}))$',
    example: 'ASB1234A56B',
  },
  AR: { pattern: '^\\d{5,7}$', example: '91251' },
  AZ: { pattern: '^\\d{4,6}$', example: '012345' },
  CA: { pattern: '^(?:\\d{3,7}|\\d{5,6})$', example: '147639' },
  CO: { pattern: '^\\d{2,6}$', example: '12345' },
  CT: { pattern: '^\\d{5,6}$', example: '439227' },
  DC: { pattern: '^\\d{3,7}$', example: '482345' },
  DE: { pattern: '^\\d{3,6}$', example: '5123' },
  FL: { pattern: '^(?:\\d{1,7}|\\d{5,7})$', example: '682101' },
  GA: { pattern: '^(?:\\d{3,6}|\\d{5,6})$', example: '120708' },
  HI: { pattern: '^\\d{2,5}$', example: '4417' },
  IA: { pattern: '^(AT)?\\d{4,7}$', example: 'AT0012345' },
  ID: { pattern: '^\\d{3,5}$', example: '7890' },
  IL: { pattern: '^(?:\\d{7}|\\d{6,7})$', example: '6123456' },
  IN: { pattern: '^\\d{5,8}$', example: '1234567' },
  KS: { pattern: '^\\d{4,6}$', example: '12345' },
  KY: { pattern: '^\\d{5,6}$', example: '12345' },
  LA: { pattern: '^\\d{4,6}$', example: '12345' },
  MA: { pattern: '^(?:\\d{4,6}|\\d{6})$', example: '654321' },
  MD: { pattern: '^\\d{8,10}$', example: '8712010123' },
  ME: { pattern: '^\\d{4,6}$', example: '009114' },
  MI: { pattern: '^(?:P?\\d{4,6}|P\\d{5})$', example: 'P56818' },
  MN: { pattern: '^\\d{1,7}$', example: '0123456' },
  MO: { pattern: '^\\d{4,6}(MO)?$', example: '12345' },
  MS: { pattern: '^\\d{3,6}$', example: '101234' },
  MT: { pattern: '^\\d{3,6}$', example: '11525' },
  NC: { pattern: '^\\d{3,6}$', example: '12345' },
  ND: { pattern: '^\\d{4,6}$', example: '04891' },
  NE: { pattern: '^\\d{4,6}$', example: '24567' },
  NH: { pattern: '^\\d{3,6}$', example: '18429' },
  NJ: {
    pattern: '^(?:(\\d{8,9}|PHV\\d{4,8})|\\d{9})$',
    example: '031711990',
  },
  NM: { pattern: '^\\d{3,6}$', example: '14500' },
  NV: { pattern: '^\\d{3,6}$', example: '12345' },
  NY: { pattern: '^(?:[1-9]\\d{6}|\\d{4,7})$', example: '4567890' },
  OH: { pattern: '^(?:\\d{5,7}|\\d{7})$', example: '0012345' },
  OK: { pattern: '^\\d{3,6}$', example: '12345' },
  OR: { pattern: '^\\d{4,6}$', example: '140789' },
  PA: { pattern: '^(?:\\d{3,6}|\\d{5,6})$', example: '123456' },
  RI: { pattern: '^\\d{3,6}$', example: '7654' },
  SC: { pattern: '^\\d{3,6}$', example: '12345' },
  SD: { pattern: '^\\d{2,6}$', example: '4567' },
  TN: { pattern: '^\\d{4,6}$', example: '035557' },
  TX: { pattern: '^(?:\\d{5,8}|\\d{8})$', example: '24012345' },
  UT: { pattern: '^\\d{3,6}$', example: '16800' },
  VA: { pattern: '^\\d{3,7}$', example: '12345' },
  VT: { pattern: '^\\d{3,7}$', example: '4381' },
  WA: { pattern: '^(?:\\d{3,6}|\\d{4,6})$', example: '45678' },
  WI: { pattern: '^\\d{6,7}$', example: '1042958' },
  WV: { pattern: '^\\d{3,6}$', example: '12345' },
  WY: { pattern: '^[1-9]\\d{4}$', example: '75749' },
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

/** The shape of a number for the admin's «new patterns» list: digits become
 * 9, letters A, anything else stays; never the number itself. A run of the
 * same symbol longer than 12 is cut. */
export function barShape(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s./-]/g, '')
    .replace(/\d/g, '9')
    .replace(/[A-Z]/g, 'A')
    .slice(0, 40);
}

/** `attorney_licenses.registry_flag` of a number whose shape this state's
 * rule did not recognise: it waits for a person and a document. */
export const FORMAT_UNUSUAL_FLAG = 'format_unusual';
