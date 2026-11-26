// Б6 (25.11): the synthetic check also walks the website and the status
// page. A local fake server plays the API, the site and the status host.
//   node --test scripts/ops/synthetic-check.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./synthetic-check.mjs', import.meta.url));
let siteBroken = false;
let base;
const server = createServer((req, res) => {
  const send = (status, body, type = 'text/html') => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };
  const url = req.url ?? '/';
  // API (always healthy here: a broken website must be found on its own).
  if (url.startsWith('/health/ready')) return send(200, '{"data":{"version":"t1"}}', 'application/json');
  if (url.startsWith('/api/v1/config/bootstrap')) return send(200, '{"data":{}}', 'application/json');
  if (url.startsWith('/api/v1/auth/password/login')) return send(400, '{"error":{}}', 'application/json');
  // Website and status page.
  if (url === '/site/') return siteBroken ? send(503, 'Service Unavailable') : send(200, '<script src="flutter_bootstrap.js" async></script>');
  if (url === '/site/lawyers/') return send(200, '<h1>Lawyers by state</h1>');
  if (url === '/status/') return send(200, '<script>fetch("status.json")</script>');
  if (url.startsWith('/status/status.json')) return send(200, '{"overall":"ok"}', 'application/json');
  return send(404, 'not found');
});

before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const run = (env) =>
  new Promise((resolve) => {
    execFile('node', [script, base], { env: { ...process.env, SYNTHETIC_IDENTIFIER: '', SYNTHETIC_PASSWORD: '', ...env } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, out: stdout + stderr }),
    );
  });

test('the website and the status page are walked when their addresses are set', async () => {
  siteBroken = false;
  const r = await run({ SYNTHETIC_WEB_URL: `${base}/site`, SYNTHETIC_STATUS_URL: `${base}/status` });
  assert.equal(r.code, 0, r.out);
  for (const s of ['ok   web home page', 'ok   web SEO page (/lawyers/)', 'ok   status page', 'ok   status page data (status.json)', 'ok   health/ready']) {
    assert.match(r.out, new RegExp(s.replace(/[()/]/g, '\\$&')));
  }
});

test('a broken website fails the check even while the API is healthy', async () => {
  siteBroken = true;
  const r = await run({ SYNTHETIC_WEB_URL: `${base}/site`, SYNTHETIC_ONLY_WEB: '1' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL web home page: HTTP 503/);
  assert.doesNotMatch(r.out, /health\/ready/, 'SYNTHETIC_ONLY_WEB=1 walks only the website');
});

test('without the addresses the old API-only check is unchanged', async () => {
  siteBroken = true;
  const r = await run({});
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /skip website/);
});
