// Environment of one k6 run + the "never production" guard.
//
//   API_URL    https://<alb-dns>/api/v1 or http://localhost:3055/api/v1
//   WS_URL     wss://<alb-dns> or ws://localhost:3055   (Socket.IO host)
//   HOST_HEADER  optional Host header (the ALB routes by host name)
//   CDN_URL    https://<cloudfront>.cloudfront.net (static assets), empty = skip
//   PROFILE    local | smoke | m1 | m10 | calls-smoke | calls-full
//   SHARD, SHARDS  this generator is number SHARD (0-based) of SHARDS; every
//              rate / VU count of the profile is divided by SHARDS
//   TOKENS_FILE, FIXTURES_FILE  produced by scripts/mint-tokens.sh + discover.mjs
//   PROD_HOSTS comma list of hostnames that must never be loaded
//   ALLOW_LOCAL=1  allows localhost (run-local.sh sets it)
//   ALLOW_HOSTS comma list of extra host names that may be loaded although their
//              name has no "loadtest" (the nightly staging run passes its own
//              staging host); PROD_HOSTS is still checked first and always wins
export const API_URL = (__ENV.API_URL || '').replace(/\/$/, '');
export const WS_URL = (__ENV.WS_URL || '').replace(/\/$/, '');
export const HOST_HEADER = __ENV.HOST_HEADER || '';
export const CDN_URL = (__ENV.CDN_URL || '').replace(/\/$/, '');
export const PROFILE = __ENV.PROFILE || 'local';
export const SHARDS = Math.max(1, Number(__ENV.SHARDS || 1));
export const SHARD = Number(__ENV.SHARD || 0);

const hostOf = (u) => {
  const m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(u || '');
  return m ? m[1].toLowerCase() : '';
};

// Owner rule: refuse to run against the production API. Three independent
// checks (the workflow, the generator script and this one) so that a typo
// in one place cannot reach production.
export function assertSafeTarget() {
  const host = hostOf(API_URL);
  if (!host) throw new Error('API_URL is empty: refusing to run');
  const prod = (__ENV.PROD_HOSTS || 'api.lawbid.dev,api.lawbid.app,lawbid.dev,lawbid.app,admin.lawbid.dev,admin.lawbid.app')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const h of [host, hostOf(WS_URL), (HOST_HEADER || '').toLowerCase()]) {
    if (h && prod.includes(h)) throw new Error(`REFUSING: ${h} is a production host`);
  }
  const local = host === 'localhost' || host === '127.0.0.1';
  const loadtest = host.indexOf('lawbid-loadtest') !== -1 || host.indexOf('loadtest') !== -1;
  if (local && __ENV.ALLOW_LOCAL !== '1') throw new Error('localhost needs ALLOW_LOCAL=1 (run-local.sh)');
  const allowed = (__ENV.ALLOW_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!local && !loadtest && allowed.indexOf(host) === -1) {
    throw new Error(`REFUSING: ${host} does not look like a load-test stack (its name must contain "loadtest")`);
  }
}
