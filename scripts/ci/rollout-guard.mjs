#!/usr/bin/env node
// Rollout guard of the store release (owner 2026-11-09, .github/workflows/store-release.yml).
// Before the staged rollout is raised (Play 5 % -> 50 % -> 100 %, App Store phased release
// -> everyone), the new version is compared with the previous one:
//   1. crash-free sessions in Sentry (release health), and
//   2. store complaints: the average star rating of the new reviews
//      (Play: per version code; App Store: last 3 days against the 14 days before, the
//      App Store review API has no version field).
// decision=ok    -> raise
// decision=halt  -> worse than the previous version: the workflow halts the rollout
// decision=wait  -> too little data yet (sessions / reviews): keep the current step
// decision=blind -> a source cannot be read (no Sentry token): the workflow refuses to raise
//                   unless the dispatch says skip_guard
// Writes `decision` and `reasons` to $GITHUB_OUTPUT and a table to $GITHUB_STEP_SUMMARY.
// Own code: no ready-made tool compares these two signals across store APIs; the store calls
// follow the official docs (Sentry releases API with health=1, Google Play Developer API
// reviews.list, App Store Connect API customerReviews).
import { createSign, sign as edSign } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

export const DEFAULTS = {
  maxCrashDropPp: 0.5, // crash-free sessions may fall at most 0.5 percentage points
  minCrashFree: 99.0, // and never below 99 %
  minSessions: 500, // fewer sessions of the new version: wait
  maxRatingDrop: 0.5, // average stars may fall at most half a star
  minReviews: 20, // fewer reviews on either side: no verdict from ratings
};

/** Crash-free verdict. cur / prev: { release, crashFree (percent), sessions } | null. */
export function judgeCrashes(cur, prev, o = DEFAULTS) {
  if (!cur) return { decision: 'wait', reason: 'no session data for the new version yet' };
  if (cur.sessions < o.minSessions) {
    return { decision: 'wait', reason: `${cur.release}: ${cur.sessions} sessions < ${o.minSessions}` };
  }
  if (cur.crashFree < o.minCrashFree) {
    return { decision: 'halt', reason: `${cur.release}: crash-free ${cur.crashFree}% < ${o.minCrashFree}%` };
  }
  if (prev && prev.crashFree - cur.crashFree > o.maxCrashDropPp) {
    return {
      decision: 'halt',
      reason: `${cur.release}: crash-free ${cur.crashFree}% vs ${prev.crashFree}% (${prev.release}), drop > ${o.maxCrashDropPp} pp`,
    };
  }
  return { decision: 'ok', reason: `${cur.release}: crash-free ${cur.crashFree}% (${cur.sessions} sessions)` };
}

/** Ratings verdict. cur / prev: { label, avg, count } | null. */
export function judgeRatings(cur, prev, o = DEFAULTS) {
  if (!cur || !prev || cur.count < o.minReviews || prev.count < o.minReviews) {
    return { decision: 'ok', reason: 'too few reviews to compare (not a stop)' };
  }
  if (prev.avg - cur.avg > o.maxRatingDrop) {
    return {
      decision: 'halt',
      reason: `ratings ${cur.label} ${cur.avg.toFixed(2)}★ (${cur.count}) vs ${prev.label} ${prev.avg.toFixed(2)}★ (${prev.count}), drop > ${o.maxRatingDrop}`,
    };
  }
  return { decision: 'ok', reason: `ratings ${cur.label} ${cur.avg.toFixed(2)}★ vs ${prev.avg.toFixed(2)}★` };
}

const RANK = { ok: 0, wait: 1, blind: 2, halt: 3 };
/** The worst of the verdicts wins. */
export function combine(verdicts) {
  const decision = verdicts.reduce((w, v) => (RANK[v.decision] > RANK[w] ? v.decision : w), 'ok');
  return { decision, reasons: verdicts.map((v) => `${v.decision}: ${v.reason}`) };
}

/** Sentry releases (newest first) -> the two newest with health data. */
export function pickReleases(releases, project) {
  const rows = [];
  for (const r of releases) {
    const h = (r.projects ?? []).find((p) => !project || p.slug === project)?.healthData;
    if (!h?.hasHealthData) continue;
    rows.push({ release: r.version, crashFree: Number(h.crashFreeSessions ?? 0), sessions: Number(h.totalSessions ?? h.sessionsCount ?? 0) });
  }
  return { cur: rows[0] ?? null, prev: rows[1] ?? null };
}

/** Play reviews -> average per version code, newest two codes. */
export function playRatings(reviews) {
  const by = new Map();
  for (const r of reviews) {
    const c = r.comments?.[0]?.userComment;
    if (!c?.starRating || !c.appVersionCode) continue;
    const s = by.get(c.appVersionCode) ?? { sum: 0, count: 0 };
    s.sum += c.starRating;
    s.count += 1;
    by.set(c.appVersionCode, s);
  }
  const codes = [...by.keys()].sort((a, b) => b - a);
  const at = (i) => (codes[i] ? { label: `code ${codes[i]}`, avg: by.get(codes[i]).sum / by.get(codes[i]).count, count: by.get(codes[i]).count } : null);
  return { cur: at(0), prev: at(1) };
}

/** App Store reviews -> last 3 days against the 14 days before. */
export function appStoreRatings(reviews, now = Date.now()) {
  const day = 86_400_000;
  const agg = (from, to, label) => {
    const xs = reviews.filter((r) => {
      const t = Date.parse(r.attributes?.createdDate ?? '');
      return t > now - from * day && t <= now - to * day;
    });
    return xs.length ? { label, avg: xs.reduce((s, r) => s + r.attributes.rating, 0) / xs.length, count: xs.length } : null;
  };
  return { cur: agg(3, 0, 'last 3 days'), prev: agg(17, 3, 'the 14 days before') };
}

// --- I/O ------------------------------------------------------------------------------------

const b64url = (b) => Buffer.from(b).toString('base64url');

async function getJson(url, headers) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url.split('?')[0]}: HTTP ${r.status}`);
  return r.json();
}

async function sentryVerdict(env) {
  const token = env.SENTRY_AUTH_TOKEN;
  const org = env.SENTRY_ORG;
  const project = env.SENTRY_PROJECT || 'lawbid-mobile';
  if (!token || !org) return { decision: 'blind', reason: 'SENTRY_AUTH_TOKEN / SENTRY_ORG not set: crashes cannot be compared' };
  const base = (env.SENTRY_URL || 'https://sentry.io').replace(/\/$/, '');
  const h = { Authorization: `Bearer ${token}` };
  const p = await getJson(`${base}/api/0/projects/${org}/${project}/`, h);
  const rel = await getJson(
    `${base}/api/0/organizations/${org}/releases/?project=${p.id}&health=1&healthStatsPeriod=24h&summaryStatsPeriod=14d&per_page=10`,
    h,
  );
  const { cur, prev } = pickReleases(rel, project);
  return judgeCrashes(cur, prev, thresholds(env));
}

function googleToken(keyFile) {
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    }),
  );
  const s = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key);
  return fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64url(s)}` }),
  })
    .then((r) => r.json())
    .then((j) => j.access_token);
}

async function playVerdict(env) {
  if (!env.PLAY_JSON_KEY_FILE) return { decision: 'ok', reason: 'Play key not set: ratings not compared' };
  const token = await googleToken(env.PLAY_JSON_KEY_FILE);
  const pkg = env.PLAY_PACKAGE || 'com.lawbid.lawbid';
  const j = await getJson(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/reviews?maxResults=100`, {
    Authorization: `Bearer ${token}`,
  });
  const { cur, prev } = playRatings(j.reviews ?? []);
  return judgeRatings(cur, prev, thresholds(env));
}

function ascToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
  const pem = Buffer.from(env.ASC_KEY_CONTENT, 'base64').toString('utf8');
  const s = edSign('sha256', Buffer.from(`${head}.${body}`), { key: pem, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(s)}`;
}

async function appStoreVerdict(env) {
  if (!env.ASC_KEY_ID || !env.ASC_KEY_CONTENT || !env.APP_STORE_ID) {
    return { decision: 'ok', reason: 'App Store key / APP_STORE_ID not set: ratings not compared' };
  }
  const j = await getJson(`https://api.appstoreconnect.apple.com/v1/apps/${env.APP_STORE_ID}/customerReviews?sort=-createdDate&limit=200`, {
    Authorization: `Bearer ${ascToken(env)}`,
  });
  const { cur, prev } = appStoreRatings(j.data ?? []);
  return judgeRatings(cur, prev, thresholds(env));
}

function thresholds(env) {
  const n = (k, d) => (env[k] !== undefined && env[k] !== '' ? Number(env[k]) : d);
  return {
    maxCrashDropPp: n('GUARD_MAX_CRASH_DROP_PP', DEFAULTS.maxCrashDropPp),
    minCrashFree: n('GUARD_MIN_CRASH_FREE', DEFAULTS.minCrashFree),
    minSessions: n('GUARD_MIN_SESSIONS', DEFAULTS.minSessions),
    maxRatingDrop: n('GUARD_MAX_RATING_DROP', DEFAULTS.maxRatingDrop),
    minReviews: n('GUARD_MIN_REVIEWS', DEFAULTS.minReviews),
  };
}

async function safely(name, f) {
  try {
    return await f();
  } catch (e) {
    return { decision: 'blind', reason: `${name}: ${e.message}` };
  }
}

async function main(env = process.env) {
  const platform = env.PLATFORM === 'ios' ? 'ios' : 'android';
  const verdicts = [
    await safely('Sentry', () => sentryVerdict(env)),
    await safely(platform === 'ios' ? 'App Store reviews' : 'Play reviews', () => (platform === 'ios' ? appStoreVerdict(env) : playVerdict(env))),
  ];
  const out = combine(verdicts);
  console.log(JSON.stringify({ platform, ...out }, null, 1));
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `decision=${out.decision}\nreasons=${out.reasons.join(' | ').replace(/\n/g, ' ')}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### Rollout guard (${platform}): **${out.decision}**\n\n${out.reasons.map((r) => `- ${r}`).join('\n')}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
