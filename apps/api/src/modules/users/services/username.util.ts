/**
 * Initial attorney @username generation (docs/02 §4.C: attorney_profiles
 * .username / username_lower are NOT NULL, so a row needs one from the
 * moment the profile step is saved). Editing it is docs/03 stage 3.6;
 * here we only produce a value that already satisfies docs/03 §6's rule:
 * 3-30 chars, latin letters, digits, `_` and `.`, not starting/ending with
 * `.`/`_`, no two dots in a row, case-insensitively unique, not reserved.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
/** Base used when the name has no latin letters/digits at all. */
export const USERNAME_FALLBACK = 'attorney';

/** "Jöhn  O'Neil", "Roe" → "john.oneil.roe"-style slug (≤ USERNAME_MAX). */
export function usernameBase(
  firstName: string | null,
  lastName: string | null,
): string {
  const part = (s: string | null): string =>
    (s ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '');
  let base = [part(firstName), part(lastName)].filter(Boolean).join('.');
  base = base.slice(0, USERNAME_MAX).replace(/\.+$/g, '');
  if (base.length < USERNAME_MIN) base = USERNAME_FALLBACK;
  return base;
}

/** `base` with numeric suffix `n` (n ≥ 2), trimmed so it stays ≤ 30. */
export function withSuffix(base: string, n: number): string {
  const suffix = String(n);
  const head = base
    .slice(0, USERNAME_MAX - suffix.length)
    .replace(/[._]+$/g, '');
  return `${head}${suffix}`;
}

/** Every candidate for `base`, in order: base, base2, base3, … */
export function* usernameCandidates(base: string): Generator<string> {
  yield base;
  for (let n = 2; ; n += 1) yield withSuffix(base, n);
}

/**
 * First candidate that is neither taken nor reserved. `taken` and
 * `reserved` hold lower-case values.
 */
export function pickUsername(
  base: string,
  taken: ReadonlySet<string>,
  reserved: ReadonlySet<string>,
): string {
  for (const candidate of usernameCandidates(base)) {
    if (!taken.has(candidate) && !reserved.has(candidate)) return candidate;
  }
  // The generator is infinite; unreachable.
  throw new Error('unreachable');
}

export function isValidUsername(u: string): boolean {
  return (
    u.length >= USERNAME_MIN &&
    u.length <= USERNAME_MAX &&
    /^[A-Za-z0-9._]+$/.test(u) &&
    !/^[._]|[._]$/.test(u) &&
    !u.includes('..')
  );
}
