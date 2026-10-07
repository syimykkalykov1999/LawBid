// Serves the browser preview (build.sh) and forwards /api and /socket.io
// to the real API, so the app talks to its own origin and needs no CORS.
// The forwarded requests carry no Origin/Referer, like the phone app's.
//
//   node tool/web_preview/serve.mjs [dir] [port]
//
// dir defaults to build/web_preview, port to 8080; PREVIEW_API overrides
// the API (default https://api.lawbid.dev). No dependencies.
import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
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

const isApi = (url) => url.startsWith('/api/') || url.startsWith('/socket.io/');

function upstreamHeaders(headers) {
  const h = { ...headers, host: api.host };
  delete h.origin;
  delete h.referer;
  return h;
}

function proxy(req, res) {
  const up = https.request(
    {
      host: api.hostname,
      port: api.port || 443,
      path: req.url,
      method: req.method,
      headers: upstreamHeaders(req.headers),
    },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
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
  isApi(req.url) ? proxy(req, res) : serveFile(req, res),
);

// Realtime chat (socket.io over websocket): pipe the raw upgrade through.
server.on('upgrade', (req, socket, head) => {
  if (!isApi(req.url)) return socket.destroy();
  const up = tls.connect(
    { host: api.hostname, port: Number(api.port || 443), servername: api.hostname },
    () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(upstreamHeaders(req.headers))) {
        for (const one of [v].flat()) lines.push(`${k}: ${one}`);
      }
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    },
  );
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(port, () => {
  console.log(`Preview: http://localhost:${port}  (API: ${api.origin})`);
});
