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

/** Base for a client without latin letters/digits in the name (OQ-026). */
export const CLIENT_USERNAME_FALLBACK = 'client';

/** "Jöhn  O'Neil", "Roe" → "john.oneil.roe"-style slug (≤ USERNAME_MAX). */
export function usernameBase(
  firstName: string | null,
  lastName: string | null,
  fallback: string = USERNAME_FALLBACK,
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
  if (base.length < USERNAME_MIN) base = fallback;
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

/** isValidUsername as one regex (class-validator @Matches on DTOs). */
export const USERNAME_PATTERN =
  /^(?![._])(?!.*\.\.)[A-Za-z0-9._]{3,30}(?<![._])$/;

export function isValidUsername(u: string): boolean {
  return (
    u.length >= USERNAME_MIN &&
    u.length <= USERNAME_MAX &&
    /^[A-Za-z0-9._]+$/.test(u) &&
    !/^[._]|[._]$/.test(u) &&
    !u.includes('..')
  );
}

/** The first [count] candidates for `base`: base, base2, base3, … */
export function sequentialCandidates(base: string, count: number): string[] {
  const out: string[] = [];
  for (const c of usernameCandidates(base)) {
    if (out.length >= count) break;
    out.push(c);
  }
  return out;
}

/** [count] distinct candidates `base` + random 5-digit suffix. */
export function randomSuffixCandidates(
  base: string,
  count: number,
  random: () => number = Math.random,
): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    out.add(withSuffix(base, 10000 + Math.floor(random() * 90000)));
  }
  return [...out];
}

/** First candidate (in order) that is not in `taken`, or null. */
export function pickUsernameFrom(
  candidates: readonly string[],
  taken: ReadonlySet<string>,
): string | null {
  return candidates.find((c) => !taken.has(c)) ?? null;
}

/** Cyrillic → Latin for username suggestions («Иван» → "ivan"). */
const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
  ң: 'n',
  ө: 'o',
  ү: 'u',
  қ: 'k',
  ғ: 'g',
  ұ: 'u',
  ә: 'a',
  һ: 'h',
};

/** One name part as a bare latin token: "Jöhn O'Neil" → "johnoneil". */
function suggestionToken(s: string | null | undefined): string {
  return [...(s ?? '').toLowerCase().normalize('NFKD')]
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** What the person typed, cleaned to the allowed alphabet ("@John..Roe_" →
 * "john.roe"). */
function typedBase(s: string | null | undefined): string {
  return [...(s ?? '').toLowerCase().normalize('NFKD')]
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._]+/g, '')
    .replace(/[._]{2,}/g, (m) => m[0])
    .replace(/^[._]+/, '')
    .slice(0, USERNAME_MAX)
    .replace(/[._]+$/, '');
}

/** `base` + `sep` + `tail`, the base trimmed so the whole fits in 30. */
function joined(base: string, sep: string, tail: string): string {
  const head = base
    .slice(0, USERNAME_MAX - sep.length - tail.length)
    .replace(/[._]+$/g, '');
  return `${head}${sep}${tail}`;
}

export interface UsernameSeeds {
  firstName?: string | null;
  lastName?: string | null;
  /** What the person typed in the username field. */
  typed?: string | null;
}

/**
 * Owner 2026-10-18 ("как в инсте"): username ideas from the typed text and
 * the name, in the order they are offered — the plain forms first
 * (typed, first.last, first_last, firstlast, last.first), then the same
 * with the year or a few digits. Every value is valid (3–30, latin,
 * digits, `.`/`_`, no edge or double dots), lower-case and unique; the
 * caller drops taken and reserved ones.
 */
export function suggestionCandidates(
  seeds: UsernameSeeds,
  year: number,
  random: () => number = Math.random,
): string[] {
  const f = suggestionToken(seeds.firstName);
  const l = suggestionToken(seeds.lastName);
  const typed = typedBase(seeds.typed);
  const bases = [
    typed,
    ...(f && l ? [`${f}.${l}`, `${f}_${l}`, `${f}${l}`, `${l}.${f}`] : []),
    f || l,
  ].filter((b) => b.length > 0);
  const digits = (n: number) =>
    String(10 ** (n - 1) + Math.floor(random() * 9 * 10 ** (n - 1)));
  const out: string[] = [...bases];
  for (const b of bases) {
    out.push(
      joined(b, '', String(year)),
      joined(b, '_', String(year % 100).padStart(2, '0')),
      joined(b, '.', digits(2)),
      joined(b, '', digits(3)),
    );
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    if (!isValidUsername(c) || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}
