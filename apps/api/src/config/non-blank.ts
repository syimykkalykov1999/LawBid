/**
 * CONTENT_MEDIA_VERIFY 17.11 №3 (probe P17): an env line
 * written as `STRIPE_PRICE_ID=` reaches `ConfigService.get` as the empty
 * string. The env schema (env.schema.ts `blankToUndefined`) treats it as
 * unset, but `ConfigService.get` falls back to `process.env`, where it is
 * still `""`, and with `a ?? b` the empty string wins: the fake provider's
 * built-in price was skipped and «Start subscription» answered
 * 503 PAYMENTS_NOT_CONFIGURED. Optional billing values go through this:
 * blank (or only spaces) = not set; a set value is trimmed.
 */
export function nonBlank(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return v === '' ? undefined : v;
}
