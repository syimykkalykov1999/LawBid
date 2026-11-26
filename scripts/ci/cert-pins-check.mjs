#!/usr/bin/env node
// S12 #25 (25.11, MASVS-NETWORK-2, MASTG-TEST-0242/0243): the app pins its
// hosts with the platforms' own pinning only —
//   Android: apps/mobile/android/app/src/main/res/xml/network_security_config.xml
//            <domain-config> + <pin-set expiration="…"> (fails open after it)
//   iOS:     apps/mobile/ios/Runner/Info.plist
//            NSAppTransportSecurity → NSPinnedDomains → NSPinnedCAIdentities
// This check keeps the pins from drifting silently:
//   static (every PR, Repo guards): both platforms pin the same hosts with the
//     same SPKI SHA-256 list, every pin is a SHA-256 in base64, and the Android
//     expiration is still at least MIN_DAYS_LEFT days away (a renewal reminder,
//     not a brick: an expired pin-set just stops pinning);
//   --live (daily, cert-pins.yml): every pinned host's live chain, as Node
//     builds it up to its trust anchor, contains at least one pinned key.
//     A failure means: add the new CA's SPKI to BOTH files before the next
//     phone build — on iOS a wrong pin set has no expiration.
// The SPKI hash is the base64 SHA-256 of the DER SubjectPublicKeyInfo, the
// format both platforms document (OWASP «Pinning Cheat Sheet», Android
// «Certificate pinning», Apple «Identity Pinning»).
import { readFileSync } from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';
import { connect } from 'node:tls';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ANDROID_NSC = 'apps/mobile/android/app/src/main/res/xml/network_security_config.xml';
export const IOS_PLIST = 'apps/mobile/ios/Runner/Info.plist';
export const MIN_DAYS_LEFT = 60;

const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

/** { hosts: {host: Set(pins)}, expiration: 'YYYY-MM-DD' | null } */
export function parseAndroid(xml) {
  const hosts = {};
  const expirations = new Set();
  const body = stripComments(xml);
  for (const m of body.matchAll(/<domain-config\b[^>]*>([\s\S]*?)<\/domain-config>/g)) {
    const block = m[1];
    const set = block.match(/<pin-set\b([^>]*)>([\s\S]*?)<\/pin-set>/);
    if (!set) continue;
    const exp = set[1].match(/expiration="([^"]+)"/);
    expirations.add(exp ? exp[1] : null);
    const pins = new Set(
      [...set[2].matchAll(/<pin\s+digest="SHA-256"\s*>\s*([^<\s]+)\s*<\/pin>/g)].map((p) => p[1]),
    );
    for (const d of block.matchAll(/<domain\b[^>]*>\s*([^<\s]+)\s*<\/domain>/g)) {
      hosts[d[1]] = pins;
    }
  }
  if (expirations.size > 1) throw new Error(`Android: different pin-set expirations ${[...expirations].join(', ')}`);
  return { hosts, expiration: [...expirations][0] ?? null };
}

/** { host: Set(pins) } from NSPinnedDomains (plain-XML plist). */
export function parseIos(plist) {
  const body = stripComments(plist);
  const start = body.indexOf('<key>NSPinnedDomains</key>');
  if (start < 0) return {};
  // The <dict> right after the key, matched by depth.
  const open = body.indexOf('<dict>', start);
  let depth = 0;
  let end = open;
  const re = /<\/?dict>/g;
  re.lastIndex = open;
  for (let t; (t = re.exec(body)); ) {
    depth += t[0] === '<dict>' ? 1 : -1;
    if (depth === 0) {
      end = t.index;
      break;
    }
  }
  const domains = body.slice(open + '<dict>'.length, end);
  const hosts = {};
  // Top-level keys of NSPinnedDomains are the host names; each is followed by
  // its own <dict> holding NSPinnedCAIdentities.
  const entry = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/array>\s*<\/dict>/g;
  for (const m of domains.matchAll(entry)) {
    const inner = m[2];
    if (!inner.includes('<key>NSPinnedCAIdentities</key>')) continue;
    hosts[m[1]] = new Set(
      [...inner.matchAll(/<key>SPKI-SHA256-BASE64<\/key>\s*<string>([^<]+)<\/string>/g)].map((p) => p[1]),
    );
  }
  return hosts;
}

const isSha256B64 = (s) => /^[A-Za-z0-9+/]{43}=$/.test(s) && Buffer.from(s, 'base64').length === 32;

/** Returns a list of problems (empty = fine). */
export function staticProblems(android, ios, today = new Date()) {
  const out = [];
  const aHosts = Object.keys(android.hosts).sort();
  const iHosts = Object.keys(ios).sort();
  if (aHosts.length === 0) out.push('Android: no <pin-set> for any host');
  if (iHosts.length === 0) out.push('iOS: no NSPinnedDomains host');
  if (aHosts.join() !== iHosts.join()) {
    out.push(`pinned hosts differ: Android [${aHosts}] vs iOS [${iHosts}]`);
  }
  for (const h of new Set([...aHosts, ...iHosts])) {
    const a = android.hosts[h] ?? new Set();
    const i = ios[h] ?? new Set();
    for (const p of a) if (!i.has(p)) out.push(`${h}: pin ${p} is on Android only`);
    for (const p of i) if (!a.has(p)) out.push(`${h}: pin ${p} is on iOS only`);
    for (const p of new Set([...a, ...i])) if (!isSha256B64(p)) out.push(`${h}: "${p}" is not a base64 SHA-256`);
    if (a.size > 0 && a.size < 2) out.push(`${h}: one pin only — keep a backup CA (Android docs)`);
  }
  if (!android.expiration) {
    out.push('Android: <pin-set> has no expiration — an old build must fail open');
  } else {
    const exp = new Date(`${android.expiration}T00:00:00Z`);
    if (Number.isNaN(exp.getTime())) out.push(`Android: bad expiration "${android.expiration}"`);
    else {
      const days = Math.floor((exp - today) / 86_400_000);
      if (days < MIN_DAYS_LEFT) {
        out.push(
          `Android: pin-set expires ${android.expiration} (${days} days) — move it about a year ahead in the next phone build`,
        );
      }
    }
  }
  return out;
}

export const spkiSha256 = (der) =>
  createHash('sha256')
    .update(new X509Certificate(der).publicKey.export({ type: 'spki', format: 'der' }))
    .digest('base64');

/** SPKI hashes of every certificate of the chain Node built for `host`. */
export function liveChain(host, { port = 443, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port, servername: host, timeout: timeoutMs }, () => {
      const seen = [];
      let cert = sock.getPeerCertificate(true);
      const fps = new Set();
      while (cert && cert.raw && !fps.has(cert.fingerprint256)) {
        fps.add(cert.fingerprint256);
        seen.push({ subject: cert.subject?.CN ?? cert.subject?.O ?? '?', spki: spkiSha256(cert.raw) });
        cert = cert.issuerCertificate;
      }
      sock.end();
      resolve(seen);
    });
    sock.on('timeout', () => sock.destroy(new Error(`${host}: TLS timeout`)));
    sock.on('error', reject);
  });
}

async function main() {
  const live = process.argv.includes('--live');
  const android = parseAndroid(readFileSync(path.join(ROOT, ANDROID_NSC), 'utf8'));
  const ios = parseIos(readFileSync(path.join(ROOT, IOS_PLIST), 'utf8'));
  const problems = staticProblems(android, ios);
  if (live) {
    for (const [host, pins] of Object.entries(android.hosts)) {
      try {
        const chain = await liveChain(host);
        const hit = chain.find((c) => pins.has(c.spki));
        const names = chain.map((c) => `${c.subject} ${c.spki}`).join('\n    ');
        if (hit) console.log(`ok ${host}: pinned CA «${hit.subject}» is in the live chain`);
        else problems.push(`${host}: no pinned key in the live chain:\n    ${names}`);
      } catch (e) {
        problems.push(`${host}: cannot read the live chain (${e.message})`);
      }
    }
  }
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.log(
    `cert pins ok: ${Object.keys(android.hosts).join(', ')}; Android expiration ${android.expiration}${live ? '; live chains match' : ''}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
