/**
 * Owner 2026-10-20 (Telegram): the @username rules shared by people,
 * channels and groups. Pure functions; the database checks live in
 * UsernamePolicyService.
 */
export type UsernameKind = 'user' | 'channel' | 'group';

/** Channels and groups: 5–32, a–z 0–9 _, a letter first, no «__», no «_» last. */
export const HANDLE_MIN = 5;
export const HANDLE_MAX = 32;
export const HANDLE_RE = /^(?=.{5,32}$)[A-Za-z](?:[A-Za-z0-9]|_(?!_|$))*$/;
/** The same rule as a JSON-schema pattern (OpenAPI). */
export const HANDLE_PATTERN =
  '^@?(?=.{5,32}$)[A-Za-z](?:[A-Za-z0-9]|_(?!_|$))*$';

/** "@Name " → "name". */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/** People keep the older, wider format (dots, 3–30): docs/03 §6. */
const PERSON_RE = /^(?![._])(?!.*\.\.)[a-z0-9._]{3,30}(?<![._])$/;

export function isValidHandle(lower: string, kind: UsernameKind): boolean {
  return kind === 'user' ? PERSON_RE.test(lower) : HANDLE_RE.test(lower);
}

/**
 * The look-alike key: 0→o, 1 and i→l, `_` and `.` dropped. Two handles with
 * the same skeleton read the same ("pavel_law", "pave1law", "paveilaw").
 * Mirrors the SQL function username_skeleton().
 */
export function skeleton(u: string): string {
  return u
    .toLowerCase()
    .replace(/[01i]/g, (c) => (c === '0' ? 'o' : 'l'))
    .replace(/[_.]/g, '');
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789_.'.split('');

/** Every string one edit (delete, swap, replace, insert) away from [u]. */
export function editDistanceOne(u: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i <= u.length; i += 1) {
    if (i < u.length) {
      out.add(u.slice(0, i) + u.slice(i + 1));
      if (i + 1 < u.length) {
        out.add(u.slice(0, i) + u[i + 1] + u[i] + u.slice(i + 2));
      }
      for (const c of ALPHABET) out.add(u.slice(0, i) + c + u.slice(i + 1));
    }
    for (const c of ALPHABET) out.add(u.slice(0, i) + c + u.slice(i));
  }
  out.delete(u);
  return [...out].filter((v) => v.length > 0);
}

/** Levenshtein distance, early out above 1 (used on the brand list). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}

/** Letters, digits and `_` only, in the handle's own alphabet. */
export function handleBase(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, HANDLE_MAX);
}

/**
 * Ideas for a channel or group handle from what the person typed and the
 * title: name, name_law, name_legal, name1, name2026 … (valid by the rule,
 * the caller drops taken ones).
 */
export function handleSuggestions(
  seeds: readonly (string | null | undefined)[],
  year: number,
  random: () => number = Math.random,
): string[] {
  const bases = [
    ...new Set(seeds.map(handleBase).filter((b) => b.length >= 2)),
  ];
  const out: string[] = [];
  const add = (base: string, tail: string) => {
    const head = base.slice(0, HANDLE_MAX - tail.length).replace(/_+$/, '');
    out.push(head + tail);
  };
  for (const b of bases) {
    out.push(b);
    add(b, '_law');
    add(b, '_legal');
    add(b, '1');
    add(b, '2');
    add(b, `_${year}`);
    add(b, String(year));
    add(b, `_${10 + Math.floor(random() * 90)}`);
    add(b, `_${100 + Math.floor(random() * 900)}`);
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    if (!HANDLE_RE.test(c) || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}
