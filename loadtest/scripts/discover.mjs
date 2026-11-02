// Finds real ids in the seeded load-test database THROUGH THE API (the way
// apps/api/bench/workload.mjs does), so the k6 mix only asks for things that
// exist. Writes the fixtures file k6 reads (FIXTURES_FILE).
//
//   API_URL=https://<alb>/api/v1 [HOST_HEADER=api.loadtest.example] \
//   JWT_SECRET=... node discover.mjs <fixtures.json> <conversations> [assets]
// Needs NODE_TLS_REJECT_UNAUTHORIZED=0 when the ALB is addressed by its AWS
// name (set by the callers; it is our own throw-away stack).
import { writeFileSync } from 'node:fs';
import { access, accessFor } from './jwt.mjs';

const [out, wantConvs = '300', nAssets = '0'] = process.argv.slice(2);
const base = (process.env.API_URL || '').replace(/\/$/, '');
if (!out || !base) {
  console.error('usage: API_URL=... discover.mjs <fixtures.json> <conversations> [assets]');
  process.exit(2);
}
const hostHeader = process.env.HOST_HEADER;

async function api(path, token) {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  if (hostHeader) headers.host = hostHeader;
  const r = await fetch(base + path, { headers });
  if (r.status !== 200) return { status: r.status, data: null };
  const j = await r.json();
  return { status: 200, data: j.data ?? j };
}
// the strict validators of the API accept only real version-4 ids (see sql/loadtest-extra.sql)
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const list = (d) => (Array.isArray(d) ? d : (d?.items ?? d?.data ?? []));

const fx = { conversations: [], posts: [], cases: [], usernames: [], attorneyIds: [], assets: [], langs: [], practices: [], states: [], deals: [] };

// 1. chats with v4 ids (sending a message / starting a call need them,
//    sql/loadtest-extra.sql): the chats of the first 1 200 attorneys, 20 at a time.
const seen = new Set();
const wantC = Number(wantConvs);
outer: for (let start = 1; start <= 1200 && fx.conversations.length < wantC; start += 20) {
  const batch = [];
  for (let g = start; g < start + 20 && g <= 1200; g++) {
    const at = access(10 * g, 'attorney');
    batch.push(api('/conversations', at).then((r) => ({ at, r, g })));
  }
  for (const { at, r, g } of await Promise.all(batch)) {
    if (r.status !== 200) {
      if (g === 1) {
        console.error(`discover: GET /conversations answered ${r.status} for the first seeded attorney: is the API up, the JWT secret the API's, the database seeded?`);
        process.exit(1);
      }
      continue;
    }
    for (const c of list(r.data)) {
      const cp = c.counterpart?.id;
      if (!c.id || !cp || seen.has(c.id) || !V4.test(c.id)) continue;
      seen.add(c.id);
      fx.conversations.push({ id: c.id, at, ct: accessFor(cp, 'client') });
      if (fx.conversations.length >= wantC) break outer;
    }
  }
}

// 2. feed + reels of 25 different people (post ids, attorneys), attorney search
for (let n = 1; n <= 30; n++) {
  if (n % 10 === 0) continue;
  const c = access(n, 'client');
  for (const p of ['/feed?limit=20', ...(n <= 3 ? ['/reels'] : [])]) {
    for (const post of list((await api(p, c)).data)) {
      if (post.id && V4.test(post.id)) fx.posts.push(post.id);
      if (post.author?.username) fx.usernames.push(post.author.username);
      if (post.author?.id && V4.test(post.author.id)) fx.attorneyIds.push(post.author.id);
    }
  }
}
for (const q of ['law', 'sofia', 'omar', 'carter', 'kim']) {
  for (const a of list((await api(`/search/attorneys?q=${q}`, access(1, 'client'))).data)) {
    if (a.username) fx.usernames.push(a.username);
    if (a.id && V4.test(a.id)) fx.attorneyIds.push(a.id);
  }
}
const uniq = (a) => [...new Set(a)];
// more posts from POSTS_FILE (one id per line, local-docker/prepare.sh): the
// feeds of 25 people repeat the same few dozen posts
if (process.env.POSTS_FILE) {
  const { readFileSync } = await import('node:fs');
  for (const id of readFileSync(process.env.POSTS_FILE, 'utf8').split('\n')) if (V4.test(id.trim())) fx.posts.push(id.trim());
}
// attorneys with version-4 ids (the profile sub-pages validate the id
// strictly; md5 seed ids mostly are not v4): ATTORNEYS_FILE "<id> <username>"
if (process.env.ATTORNEYS_FILE) {
  const { readFileSync } = await import('node:fs');
  for (const line of readFileSync(process.env.ATTORNEYS_FILE, 'utf8').split('\n')) {
    const [id, username] = line.trim().split(/\s+/);
    if (id && V4.test(id)) fx.attorneyIds.push(id);
    if (username) fx.usernames.push(username);
  }
}
fx.posts = uniq(fx.posts);
fx.usernames = uniq(fx.usernames);
fx.attorneyIds = uniq(fx.attorneyIds);

// 3. cases: the OWNER (a client) opens his case list and the bids of a case.
//    (GET /cases/:id is the attorney's view and needs a case matching the attorney: not used.)
//    Kept only when the bids list answers 200 for that client.
for (let n = 1; n < 800 && fx.cases.length < 60; n++) {
  if (n % 10 === 0) continue;
  const t = access(n, 'client');
  for (const c of list((await api('/users/me/cases', t)).data)) {
    if (!c?.id || !V4.test(c.id)) continue; // strict validators want v4 ids (sql/loadtest-extra.sql)
    if ((await api(`/cases/${c.id}/bids`, t)).status === 200) fx.cases.push({ id: c.id, t });
  }
}

// languages for the i18n bundle of the cold start (a database without
// translations has none: then the mix skips that request)
for (const l of list((await api('/i18n/languages', access(1, 'client'))).data)) if (l.code) fx.langs.push(l.code);

// 4. full mix (MIX=full): practice areas + states for a new case (API list,
//    or PRACTICES_FILE when the API lists none), and cases with an accepted offer for the deal record, found by
//    DEALS_FILE (one "<case id> <client user id>" per line, local-docker/prepare.sh)
for (const p of list((await api('/practice-areas', access(1, 'client'))).data)) if (p.id) fx.practices.push(p.id);
if (process.env.PRACTICES_FILE) {
  const { readFileSync } = await import('node:fs');
  for (const id of readFileSync(process.env.PRACTICES_FILE, 'utf8').split('\n')) if (id.trim()) fx.practices.push(id.trim());
}
fx.practices = [...new Set(fx.practices)];
fx.states = (process.env.STATES || 'CA,NY,TX,FL,IL,WA,MA,GA,NJ,PA').split(',');
if (process.env.DEALS_FILE) {
  const { readFileSync } = await import('node:fs');
  for (const line of readFileSync(process.env.DEALS_FILE, 'utf8').split('\n')) {
    const [id, client] = line.trim().split(/\s+/);
    if (id && client && V4.test(id)) fx.deals.push({ id, t: accessFor(client, 'client') });
  }
}

// 5. static assets uploaded by the workflow (scripts/upload-assets.sh)
for (let i = 0; i < Number(nAssets); i++) fx.assets.push(`/assets/a-${i}.bin`);

writeFileSync(out, JSON.stringify(fx));
console.error(
  `fixtures: ${fx.conversations.length} chats, ${fx.posts.length} posts, ${fx.usernames.length} usernames, ${fx.attorneyIds.length} attorneys, ${fx.cases.length} cases, ${fx.practices.length} practices, ${fx.deals.length} deals, ${fx.assets.length} assets -> ${out}`,
);
if (fx.conversations.length === 0 || fx.posts.length === 0) {
  console.error('discover: no chats or posts found: the database is not seeded (scripts/ops/*-load-gen.sql)');
  process.exit(1);
}
