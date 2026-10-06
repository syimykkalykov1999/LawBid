import { randomBytes } from 'node:crypto';

/**
 * Owner 2026-10-05 (legal): a tiny RFC 5322 / 2045 builder for the SES
 * raw path — multipart/alternative (text + optional html), UTF-8, bodies
 * base64 encoded, non-ASCII subject as an RFC 2047 encoded word. No
 * dependency: the only reason we need raw MIME is custom headers
 * (List-Unsubscribe), nothing fancier.
 */
export interface MimeInput {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  /** Fixed values for tests. */
  date?: Date;
  boundary?: string;
}

const CRLF = '\r\n';

/** Header values must not carry line breaks (header injection). */
export function sanitizeHeaderValue(v: string): string {
  return v.replace(/[\r\n]+/g, ' ').trim();
}

/** Header names: token characters only. */
function validHeaderName(name: string): boolean {
  return /^[A-Za-z0-9-]{1,78}$/.test(name);
}

/** RFC 2047 "B" encoded word when the subject is not plain ASCII. */
export function encodeHeaderText(v: string): string {
  const clean = sanitizeHeaderValue(v);

  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

/** Base64 in 76-char lines (RFC 2045 §6.8). */
export function base64Lines(s: string): string {
  const b64 = Buffer.from(s, 'utf8').toString('base64');
  return b64.match(/.{1,76}/g)?.join(CRLF) ?? '';
}

/** Headers that are set by the builder itself and may not be overridden. */
const RESERVED = new Set([
  'from',
  'to',
  'subject',
  'date',
  'mime-version',
  'content-type',
  'content-transfer-encoding',
]);

export function buildMimeMessage(input: MimeInput): string {
  const boundary =
    input.boundary ?? `=_lawbid_${randomBytes(12).toString('hex')}`;
  const head: string[] = [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${sanitizeHeaderValue(input.to)}`,
    `Subject: ${encodeHeaderText(input.subject)}`,
    `Date: ${(input.date ?? new Date()).toUTCString()}`,
    'MIME-Version: 1.0',
  ];
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (!validHeaderName(name) || RESERVED.has(name.toLowerCase())) continue;
    head.push(`${name}: ${sanitizeHeaderValue(value)}`);
  }
  const textPart = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(input.text),
  ].join(CRLF);
  if (!input.html) {
    return [...head, textPart].join(CRLF) + CRLF;
  }
  const htmlPart = [
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(input.html),
  ].join(CRLF);
  return (
    [
      ...head,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      textPart,
      `--${boundary}`,
      htmlPart,
      `--${boundary}--`,
    ].join(CRLF) + CRLF
  );
}
