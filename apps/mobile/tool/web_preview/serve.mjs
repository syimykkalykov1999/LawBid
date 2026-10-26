// Serves the browser preview (build.sh) and forwards /api and /socket.io
// to the real API, so the app talks to its own origin and needs no CORS.
// The forwarded requests carry no Origin/Referer, like the phone app's.
//
//   node tool/web_preview/serve.mjs [dir] [port]
//
// dir defaults to build/web_preview, port to 8080; PREVIEW_API overrides
// the API (default https://api.lawbid.dev). No dependencies.
//
// PREVIEW_STORAGE (owner 2026-10-18, phone in a browser): the local file
// and video hosts, comma separated, e.g.
// http://172.20.10.4:9000,http://172.20.10.4:4010 (S3_ENDPOINT and
// DEV_FAKE_BUNNY_HOST of apps/api/.env). Their links in the API's answers
// are rewritten to this server's /__storage0/, /__storage1/…, and those
// requests are forwarded to them: a phone that opened the preview over
// https (or from another network) cannot reach a plain-http address on the
// Mac, so photos, files and videos did not upload or show.
import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { extname, join, normalize, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'build/web_preview');
const port = Number(process.argv[3] ?? 8080);
const api = new URL(process.env.PREVIEW_API ?? 'https://api.lawbid.dev');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

const storages = (process.env.PREVIEW_STORAGE ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s, i) => ({ url: new URL(s), path: `/__storage${i}` }));
const storage = storages.length > 0 ? storages : null;

const isApi = (url) => url.startsWith('/api/') || url.startsWith('/socket.io/');
const storageFor = (url) =>
  storages.find((s) => url === s.path || url.startsWith(`${s.path}/`));

/** This server's own address as the phone sees it (cloudflared: https). */
function selfOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() ||
    (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host}`;
}

function upstreamHeaders(headers) {
  const h = { ...headers, host: api.host };
  delete h.origin;
  delete h.referer;
  return h;
}

// PREVIEW_API=http://localhost:3000 talks to a local API (plain http / ws).
const plain = api.protocol === 'http:';

function proxy(req, res) {
  const headers = upstreamHeaders(req.headers);
  // Storage links are rewritten in the text, so the answer must come
  // uncompressed.
  if (storage) delete headers['accept-encoding'];
  const up = (plain ? http : https).request(
    {
      host: api.hostname,
      port: api.port || (plain ? 80 : 443),
      path: req.url,
      method: req.method,
      headers,
    },
    (r) => {
      const json = String(r.headers['content-type'] ?? '').includes('json');
      if (!storage || !json) {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
        return;
      }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        let text = Buffer.concat(chunks).toString('utf8');
        for (const s of storages) {
          text = text.split(s.url.origin).join(selfOrigin(req) + s.path);
        }
        const body = Buffer.from(text);
        const out = { ...r.headers, 'content-length': body.length };
        delete out['transfer-encoding'];
        res.writeHead(r.statusCode ?? 502, out);
        res.end(body);
      });
    },
  );
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
}

// The storage keeps its own address in the Host header: signed links are
// signed for it.
function proxyStorage(req, res, { url: storage, path: prefix }) {
  const path = req.url.slice(prefix.length) || '/';
  const headers = { ...req.headers, host: storage.host };
  delete headers.origin;
  delete headers.referer;
  const up = (storage.protocol === 'https:' ? https : http).request(
    {
      host: storage.hostname,
      port: storage.port || (storage.protocol === 'https:' ? 443 : 80),
      path,
      method: req.method,
      headers,
    },
    (r) => {
      const out = { ...r.headers };
      // A resumable video upload answers with its next address.
      const loc = out.location;
      if (typeof loc === 'string' && loc.startsWith(storage.origin)) {
        out.location = selfOrigin(req) + prefix + loc.slice(storage.origin.length);
      }
      res.writeHead(r.statusCode ?? 502, out);
      r.pipe(res);
    },
  );
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
}

function serveFile(req, res) {
  const path = decodeURIComponent(req.url.split('?')[0]);
  let file = normalize(join(dir, path));
  if (!file.startsWith(dir)) return res.writeHead(403).end();
  let stat;
  try {
    stat = statSync(file);
    if (stat.isDirectory()) {
      file = join(file, 'index.html');
      stat = statSync(file);
    }
  } catch {
    // App routes (/feed, /cases/…) are Flutter's: hand back the shell.
    file = join(dir, 'index.html');
    stat = statSync(file);
  }
  const html = file.endsWith('.html');
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'content-length': stat.size,
    // Each rebuild must show at once on the phone; the big files are
    // revalidated, not re-downloaded, when unchanged.
    'cache-control': html ? 'no-store' : 'no-cache',
    'x-robots-tag': 'noindex, nofollow',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) =>
  isApi(req.url)
    ? proxy(req, res)
    : storageFor(req.url)
      ? proxyStorage(req, res, storageFor(req.url))
      : serveFile(req, res),
);

// Realtime chat (socket.io over websocket): pipe the raw upgrade through.
server.on('upgrade', (req, socket, head) => {
  if (!isApi(req.url)) return socket.destroy();
  const connect = plain
    ? (cb) => net.connect({ host: api.hostname, port: Number(api.port || 80) }, cb)
    : (cb) =>
        tls.connect(
          {
            host: api.hostname,
            port: Number(api.port || 443),
            servername: api.hostname,
          },
          cb,
        );
  const up = connect(() => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(upstreamHeaders(req.headers))) {
        for (const one of [v].flat()) lines.push(`${k}: ${one}`);
      }
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(port, () => {
  console.log(
    `Preview: http://localhost:${port}  (API: ${api.origin}` +
      (storage ? `, files: ${storages.map((s) => s.url.origin).join(', ')})` : ')'),
  );
});
