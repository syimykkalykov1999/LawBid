#!/usr/bin/env node
// S11-5: the synthetic user. Runs after every deploy and every 5 minutes
// (.github/workflows/synthetic.yml) against production and walks the same
// path a person does, so a release that boots but cannot sign in, serve an
// authenticated call or hold a socket is found by us, not by users.
//
//   node scripts/ops/synthetic-check.mjs <api base url> [--expect-version TAG]
//
// Anonymous probes (always): /health/ready (+version), /api/v1/config/bootstrap,
// a validation round-trip on the sign-in route (proves routing, validation, the
// error envelope — no SMS, no account).
// Signed-in flow (only when SYNTHETIC_IDENTIFIER + SYNTHETIC_PASSWORD are set:
// a dedicated test account with a password, never a real user): password login
// -> authenticated GET /auth/sessions -> Socket.IO handshake on /realtime with
// the access token -> logout. The account always logs out, so the one-device
// rule never blocks the next run. Nothing is created or messaged (no test case
// is posted yet: that needs a quarantined test organisation, see
// docs/runbooks/synthetic-check.md).
// Б6 (25.11): the website too, anonymously, when SYNTHETIC_WEB_URL is set
// (https://lawbid.dev): the home page (the Flutter app's shell), one public
// SEO page (/lawyers/, the static pages of scripts/seo) and, with
// SYNTHETIC_STATUS_URL (https://status.lawbid.dev), the status page and its
// status.json. A broken CloudFront function or S3 origin shows up here.
// SYNTHETIC_ONLY_WEB=1 walks only these (deploy.yml's report-only step).
// Exit 0 = healthy, 1 = at least one step failed (each failed step is printed).
const base = (process.argv[2] ?? process.env.API_URL ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: synthetic-check.mjs <api base url> [--expect-version TAG]');
  process.exit(2);
}
const ev = process.argv.indexOf('--expect-version');
const expectVersion = ev > 0 ? process.argv[ev + 1] : process.env.EXPECT_VERSION || '';
const TIMEOUT_MS = Number(process.env.SYNTHETIC_TIMEOUT_MS ?? 15000);

const failures = [];
const log = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    log.push(`ok   ${name} (${Date.now() - t0} ms)${note ? ' ' + note : ''}`);
  } catch (e) {
    failures.push(name);
    log.push(`FAIL ${name}: ${e.message}`);
  }
}
async function http(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}
const unwrap = (j) => (j && typeof j === 'object' && 'data' in j ? j.data : j);

const onlyWeb = process.env.SYNTHETIC_ONLY_WEB === '1';
if (!onlyWeb) {
  await step('health/ready', async () => {
    const r = await http('GET', '/health/ready');
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const v = r.json?.data?.version ?? r.json?.version;
    if (expectVersion && v !== expectVersion) throw new Error(`version ${v ?? 'none'} != ${expectVersion}`);
    return v ? `version ${v}` : '';
  });
  await step('config/bootstrap', async () => {
    const r = await http('GET', '/api/v1/config/bootstrap');
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  });
  await step('sign-in validation round-trip', async () => {
    // A malformed identifier must come back as a clean 400 envelope, never 5xx.
    const r = await http('POST', '/api/v1/auth/password/login', {
      body: { identifier: 'not-an-identifier', password: 'x' },
    });
    if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  });
}

// Б6: the website (CloudFront web distribution) and the status page.
async function page(url, mustContain) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'text/html,application/json', 'user-agent': 'LawBid-synthetic-check' },
    redirect: 'follow',
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (mustContain && !text.includes(mustContain)) throw new Error(`no ${JSON.stringify(mustContain)} in the answer`);
}
const web = (process.env.SYNTHETIC_WEB_URL ?? '').replace(/\/+$/, '');
const status = (process.env.SYNTHETIC_STATUS_URL ?? '').replace(/\/+$/, '');
if (web) {
  await step('web home page', () => page(`${web}/`, 'flutter_bootstrap.js'));
  await step('web SEO page (/lawyers/)', () => page(`${web}/lawyers/`, '<h1'));
}
if (status) {
  await step('status page', () => page(`${status}/`, 'status.json'));
  await step('status page data (status.json)', () => page(`${status}/status.json?t=${Date.now()}`));
}
if (!web && !status) log.push('skip website (SYNTHETIC_WEB_URL / SYNTHETIC_STATUS_URL not set)');

const ident = process.env.SYNTHETIC_IDENTIFIER;
const pass = process.env.SYNTHETIC_PASSWORD;
if (onlyWeb) {
  log.push('only the website (SYNTHETIC_ONLY_WEB=1)');
} else if (ident && pass) {
  let token;
  await step('password login', async () => {
    const r = await http('POST', '/api/v1/auth/password/login', {
      body: { identifier: ident, password: pass },
    });
    if (r.status !== 201 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
    token = unwrap(r.json)?.accessToken;
    if (!token) throw new Error('no accessToken in the answer');
  });
  if (token) {
    await step('authenticated call (GET /auth/sessions)', async () => {
      const r = await http('GET', '/api/v1/auth/sessions', { token });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    });
    await step('socket.io handshake on /realtime', async () => {
      // Engine.IO v4 over HTTP long-polling: open, connect the namespace with
      // the token, read the CONNECT (40) or CONNECT_ERROR (44) packet.
      const open = await http('GET', '/socket.io/?EIO=4&transport=polling');
      if (open.status !== 200) throw new Error(`open HTTP ${open.status}`);
      const sid = JSON.parse(open.text.replace(/^\d/, '')).sid;
      const q = `/socket.io/?EIO=4&transport=polling&sid=${sid}`;
      const post = await fetch(base + q, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: `40/realtime,${JSON.stringify({ token })}`,
      });
      if (!post.ok) throw new Error(`connect POST HTTP ${post.status}`);
      for (let i = 0; i < 5; i++) {
        const r = await http('GET', q);
        if (r.text.includes('40/realtime')) return 'connected';
        if (r.text.includes('44/realtime')) throw new Error(`namespace refused: ${r.text.slice(0, 120)}`);
      }
      throw new Error('no CONNECT packet from /realtime');
    });
    await step('logout', async () => {
      const r = await http('POST', '/api/v1/auth/logout', { token });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    });
  }
} else {
  log.push('skip signed-in flow (SYNTHETIC_IDENTIFIER / SYNTHETIC_PASSWORD not set)');
}

console.log(log.join('\n'));
if (failures.length) {
  console.error(`::error::synthetic check failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('synthetic check ok');
