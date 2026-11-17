// Local stand-in for CloudFront in front of build/web (row 173 test).
// MODE=none | cred | corp ; PORT ; ROOT (build/web) ; PROBE (harness dir)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const { MODE = "none", PORT = "8173", ROOT, PROBE } = process.env;
const API = "http://127.0.0.1:3173";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".css": "text/css",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".bin": "application/octet-stream",
};
// The app policy of infra/modules/web/main.tf (csp.app), API = the local one.
const stripe = "https://js.stripe.com https://*.js.stripe.com";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' https://www.gstatic.com https://challenges.cloudflare.com ${stripe} https://accounts.google.com https://appleid.cdn-apple.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com",
  "img-src 'self' data: blob: https: http://127.0.0.1:8179",
  "media-src 'self' blob: https: http://127.0.0.1:8179",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: ${API} ws://127.0.0.1:3173 http://127.0.0.1:8179 https://*.ingest.sentry.io https://api.stripe.com https://accounts.google.com`,
  `frame-src 'self' https://challenges.cloudflare.com ${stripe} https://hooks.stripe.com https://accounts.google.com http://127.0.0.1:8179`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");
http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    let p = decodeURIComponent(u.pathname);
    let base = ROOT;
    if (p.startsWith("/probe/")) {
      base = PROBE;
      p = p.slice(6);
    }
    let file = normalize(join(base, p));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(p)) file = join(ROOT, "index.html");
    }
    let body;
    try {
      body = await readFile(file);
    } catch {
      res.writeHead(404).end("nf");
      return;
    }
    const h = {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    };
    const isPay = p === "/pay.html" || p === "/pay.js";
    if (MODE !== "none" && !isPay) {
      h["cross-origin-opener-policy"] =
        MODE === "popups" ? "same-origin-allow-popups" : "same-origin";
      h["cross-origin-embedder-policy"] =
        MODE === "corp" ? "require-corp" : "credentialless";
    }
    res.writeHead(200, h).end(body);
  })
  .listen(+PORT, "127.0.0.1", () =>
    console.log(`serving ${ROOT} mode=${MODE} on ${PORT}`),
  );
