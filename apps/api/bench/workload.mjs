// Mixed realistic workload for the seeded perf database: discovers real ids
// through the API, then runs every hot endpoint with N virtual users for a
// number of seconds and prints rps / p50 / p95 / p99 per endpoint.
// Usage: CLIENT_TOKENS=tok_client.json ATT_TOKENS=tok_att.json \
//   node bench/workload.mjs [seconds] [connections]
import { readFileSync } from 'node:fs';
import autocannon from 'autocannon';

const base = process.env.BASE_URL ?? 'http://localhost:3055/api/v1';
const client = JSON.parse(readFileSync(process.env.CLIENT_TOKENS, 'utf8'));
const att = JSON.parse(readFileSync(process.env.ATT_TOKENS, 'utf8'));
const seconds = Number(process.argv[2] ?? 6);
const conns = Number(process.argv[3] ?? 30);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const get = async (path, token) => {
  const r = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  return r.status === 200 ? (await r.json()).data ?? null : null;
};
const data = (x) => x?.items ?? x?.data ?? x;

const convs = data(await get('/conversations', client[0])) ?? [];
const convId = convs[0]?.id;
const feed = data(await get('/feed', client[0])) ?? [];
const postId = feed[0]?.id;
const attorneyUsername = feed.find((p) => p.author?.username)?.author?.username;
const attorneyId = feed[0]?.author?.id;
const targets = [
  ['bootstrap', '/config/bootstrap', client],
  ['session', '/me/session', client],
  ['feed', '/feed', client],
  ['feed p2', '/feed?limit=20', client],
  ['reels', '/reels', client],
  ['chat list', '/conversations', client],
  ['chat msgs', `/conversations/${convId}/messages`, client],
  ['notifications', '/notifications', client],
  ['badges', '/badges', client],
  ['client profile', '/users/me/profile', client],
  ['attorney profile', `/attorneys/${attorneyUsername}`, client],
  ['attorney posts', `/attorneys/${attorneyId}/posts`, client],
  ['post', `/posts/${postId}`, client],
  ['search attorneys', '/search/attorneys?q=law3', client],
  ['search people', '/search/people?q=law', client],
  ['search posts', '/search/posts?q=deposit', client],
  ['search suggest', '/search/suggest?q=law', client],
  ['att me profile', '/attorneys/me/profile', att],
  ['att me stats', '/attorneys/me/stats', att],
  ['saved posts', '/saved-items/posts', client],
];
const rows = [];
for (const [name, path, tokens] of targets) {
  if (only && !only.test(name)) continue;
  let i = Math.floor(Math.random() * 200);
  const r = await autocannon({
    url: base + path,
    duration: seconds,
    connections: conns,
    requests: [
      {
        method: 'GET',
        setupRequest: (req) => {
          req.headers = { ...req.headers, authorization: `Bearer ${tokens[i++ % tokens.length]}` };
          return req;
        },
      },
    ],
  });
  rows.push({
    endpoint: name,
    rps: Math.round(r.requests.average),
    p50: r.latency.p50,
    p97_5: r.latency.p97_5,
    p99: r.latency.p99,
    non2xx: r.non2xx,
    bytes: Math.round(r.throughput.average / Math.max(1, r.requests.average)),
  });
}
console.table(rows);
