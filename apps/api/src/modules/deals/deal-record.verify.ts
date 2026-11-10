import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

/**
 * Deal record v2 (owner 2026-11-08): the authenticity check. The QR on the
 * PDF opens `GET /deal-records/:id/verify` — a public page with no names
 * and no terms, only the record code, its state and the SHA-256
 * fingerprints the platform keeps (a file cannot contain its own hash, so
 * the QR carries the record id and the page shows the hash). The page
 * also lets the visitor pick their PDF: the browser computes its SHA-256
 * (Web Crypto, nothing uploaded) and says whether it is the sealed or the
 * unsigned file of this record.
 */

const DEFAULT_API_BASE = 'https://api.lawbid.dev/api/v1';

/** Public base of the API, no trailing slash (same as the calendar links). */
export function publicApiBase(config: ConfigService): string {
  const v = config.get<string>('CALENDAR_API_BASE_URL');
  return (v && v.trim() ? v.trim() : DEFAULT_API_BASE).replace(/\/+$/, '');
}

/** What the QR encodes. */
export const dealRecordVerifyUrl = (apiBase: string, recordId: string) =>
  `${apiBase.replace(/\/+$/, '')}/deal-records/${recordId}/verify`;

/** `Anna I.` from `Anna Ivanova`; `@a…` from `@anna` (public page only). */
export function maskName(fullName: string): string {
  const n = fullName.trim();
  if (n === '' || n === '—') return '—';
  if (n.startsWith('@')) return `@${n.slice(1, 2)}…`;
  const words = n.split(/\s+/);
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';
  return last ? `${first} ${Array.from(last)[0]}.` : first;
}

export interface VerifyView {
  recordCode: string;
  /** Masked (maskName): no full names, no contacts, no case content. */
  client: string;
  attorney: string;
  status: string;
  createdAt: Date;
  sealedAt: Date | null;
  snapshotSha256: string;
  unsignedSha256: string | null;
  sealedSha256: string | null;
}

const esc = (v: string): string =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const stampOf = (d: Date) =>
  `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const STYLE =
  'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0B0D;color:#fff;margin:0;display:flex;justify-content:center}' +
  'main{max-width:560px;padding:28px 16px}h1{color:#C9A24A;font-size:22px;margin:0 0 12px}' +
  'dl{margin:0}dt{opacity:.65;font-size:13px;margin-top:12px}dd{margin:2px 0 0;font-size:15px;word-break:break-all}' +
  'code{font-family:ui-monospace,Menlo,monospace;font-size:13px}p{opacity:.8;line-height:1.45}' +
  'label{display:inline-block;margin-top:16px;padding:12px 18px;border-radius:10px;background:#C9A24A;color:#0B0B0D;font-weight:600;cursor:pointer}' +
  'input{display:none}#r,#v{margin-top:14px;font-size:15px;font-weight:600}';

/** The HTML page plus the CSP that allows only its own inline script. */
export function verifyPage(
  view: VerifyView | null,
  /** `?sha256=` of the link: compared on the server. */
  claimed?: string,
): {
  status: number;
  html: string;
  csp: string;
} {
  const nonce = randomBytes(16).toString('base64');
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  const head = (title: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style></head><body><main>`;
  if (!view) {
    return {
      status: 404,
      csp,
      html: `${head('Record not found')}<h1>Record not found</h1><p>There is no LawBid deal record at this address. Check that you scanned the code on the document itself.</p></main></body></html>`,
    };
  }
  const known: Record<string, string> = {};
  if (view.sealedSha256) known[view.sealedSha256] = 'sealed';
  if (view.unsignedSha256) known[view.unsignedSha256] = 'unsigned';
  const claim = claimed?.trim().toLowerCase();
  const verdict =
    claim && /^[0-9a-f]{64}$/.test(claim)
      ? known[claim] === 'sealed'
        ? '<div id="v" style="color:#7BD88F">Authentic: the fingerprint matches the sealed record.</div>'
        : known[claim] === 'unsigned'
          ? '<div id="v" style="color:#7BD88F">Authentic unsigned copy (before signatures).</div>'
          : '<div id="v" style="color:#FF6B6B">Changed: this fingerprint is not one of this record.</div>'
      : '';
  const sealed = view.status === 'sealed' && view.sealedSha256;
  const state = sealed
    ? `Sealed — signed by both parties on ${stampOf(view.sealedAt ?? view.createdAt)}`
    : view.status === 'awaiting_signatures' ||
        view.status === 'preparing' ||
        view.status === 'sealing'
      ? 'Waiting for signatures'
      : view.status === 'declined'
        ? 'Declined — not signed by both parties'
        : 'Not sealed';
  const rows = [
    ['Record code', esc(view.recordCode)],
    ['State', esc(state)],
    [
      'Parties',
      `${esc(view.client)} (client) · ${esc(view.attorney)} (attorney)`,
    ],
    ['Created', esc(stampOf(view.createdAt))],
    [
      'SHA-256 of the sealed PDF',
      view.sealedSha256 ? `<code>${esc(view.sealedSha256)}</code>` : '—',
    ],
    [
      'SHA-256 of the unsigned PDF',
      view.unsignedSha256 ? `<code>${esc(view.unsignedSha256)}</code>` : '—',
    ],
    [
      'SHA-256 of the recorded data',
      `<code>${esc(view.snapshotSha256)}</code>`,
    ],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');
  const script = `(function(){var k=${JSON.stringify(known).replace(/</g, '\\u003c')};var i=document.getElementById('f'),r=document.getElementById('r');i.addEventListener('change',function(){var f=i.files&&i.files[0];if(!f)return;r.textContent='Checking…';f.arrayBuffer().then(function(b){return crypto.subtle.digest('SHA-256',b)}).then(function(d){var h=Array.prototype.map.call(new Uint8Array(d),function(x){return('0'+x.toString(16)).slice(-2)}).join('');var m=k[h];r.style.color=m?'#7BD88F':'#FF6B6B';r.textContent=m==='sealed'?'Authentic: this is the sealed record signed by both parties.':m==='unsigned'?'Authentic unsigned copy (before signatures).':'Changed: this file is not a copy of this record. SHA-256 '+h;}).catch(function(){r.textContent='This browser cannot check files.'})})})();`;
  return {
    status: 200,
    csp,
    html:
      `${head('Deal record check — LawBid')}<h1>Deal record check</h1>` +
      `<p>This page shows the fingerprint (SHA-256) that LawBid keeps for this deal record. Pick your PDF to compare: the check runs in your browser, the file is not uploaded.</p>` +
      `${verdict}<dl>${rows}</dl>` +
      `<label for="f">Check my PDF</label><input id="f" type="file" accept="application/pdf"><div id="r" role="status"></div>` +
      `<p style="font-size:13px;margin-top:18px">LawBid is not a party to the agreement between the client and the attorney. This record is not a contract.</p>` +
      `<script nonce="${nonce}">${script}</script></main></body></html>`,
  };
}
