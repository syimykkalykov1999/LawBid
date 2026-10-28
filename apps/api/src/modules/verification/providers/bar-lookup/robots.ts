/**
 * Owner 2026-10-28 (polite use): before a registry page is read, the
 * site's robots.txt is honoured — a path disallowed for our User-Agent
 * (or for "*") is never requested; the lookup then falls back to a
 * verifier. robots.txt is fetched at most once a day per host; a missing
 * or unreadable robots.txt allows (RFC 9309 §2.3.1.3).
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;

interface Rule {
  allow: boolean;
  path: string;
}

const cache = new Map<string, { at: number; rules: Rule[] }>();

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(`robots.txt of ${new URL(url).host} does not allow this page`);
  }
}

/** Test hook: forget every cached robots.txt. */
export function clearRobotsCache(): void {
  cache.clear();
}

export async function assertRobotsAllowed(
  url: URL,
  agent: { token: string; userAgent: string },
  fetchImpl: typeof fetch,
  now = Date.now(),
): Promise<void> {
  const origin = url.origin;
  let entry = cache.get(origin);
  if (!entry || now - entry.at > TTL_MS) {
    entry = { at: now, rules: await load(origin, agent, fetchImpl) };
    cache.set(origin, entry);
  }
  if (!allowed(entry.rules, url.pathname + url.search)) {
    throw new RobotsDisallowedError(url.toString());
  }
}

async function load(
  origin: string,
  agent: { token: string; userAgent: string },
  fetchImpl: typeof fetch,
): Promise<Rule[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(new URL('/robots.txt', origin), {
      headers: { 'User-Agent': agent.userAgent },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return [];
    const text = (await res.text()).slice(0, MAX_BYTES);
    return parseRobots(text, agent.token);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** The rules of the group naming our agent, else of "*". */
export function parseRobots(text: string, agentToken: string): Rule[] {
  const ours = agentToken.toLowerCase();
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'disallow' && value)
      cur.rules.push({ allow: false, path: value });
    if (key === 'allow' && value) cur.rules.push({ allow: true, path: value });
  }
  const named = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && ours.startsWith(a)),
  );
  const chosen = named.length
    ? named
    : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/** Longest matching rule wins; Allow wins a tie (RFC 9309 §2.2.2). */
export function allowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  let bestLen = -1;
  for (const r of rules) {
    if (!matches(r.path, path)) continue;
    const len = r.path.length;
    if (len > bestLen || (len === bestLen && r.allow)) {
      best = r;
      bestLen = len;
    }
  }
  return best ? best.allow : true;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    `^${body
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}${anchored ? '$' : ''}`,
    'i',
  );
  return re.test(path);
}
