/**
 * Security & legal pass 2026-10-24 (ABA Model Rule 1.6(c): reasonable
 * efforts to prevent disclosure of client information). Error reports and
 * log lines must never carry what a client told their attorney: document
 * names, message text, phone numbers, e-mail addresses, or a signed link
 * that opens a file. This is the one place that knows how to clean a
 * string; Sentry's `beforeSend` (app.setup.ts) and any log helper use it.
 */

/** Field names whose value is dropped whole. */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'phone',
  'phone_e164',
  'phoneNumber',
  'email',
  'identifier',
  'value',
  'code',
  'authorization',
  'cookie',
  'refreshToken',
  'idToken',
  'nonce',
  'reauthToken',
  'password',
  'token',
  'secret',
  // Key material (S3-3): never in a report even if an env dump slips in.
  'MESSAGE_ENC_KEYS',
  'SECRETS_MASTER_KEYS',
  'JWT_KEYS',
  'ADMIN_TOTP_ENC_KEY',
  // Message / post / chat text.
  'body',
  'body_original',
  'body_display',
  'text',
  'content',
  'caption',
  'note',
  'notes',
  'comment',
  'description',
  'title',
  'private_details',
  'privateDetails',
  // Document names.
  'file_name',
  'fileName',
  'filename',
  'original_name',
  'originalName',
  // Names of people.
  'first_name',
  'last_name',
  'firstName',
  'lastName',
  'display_name',
  'displayName',
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 9+ digits with optional separators and a leading +: a phone number.
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
// A query string on a URL: signed links carry their secret there.
const URL_QUERY_RE = /(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>#]*/g;
// Signature-style parameters outside a full URL (a bare fragment of one).
const SIGNED_PARAM_RE =
  /\b(X-Amz-[A-Za-z-]+|Signature|Key-Pair-Id|Policy|Expires)=[^&\s"']+/g;
// A file name by its extension: documents, images, archives, audio.
const FILE_NAME_RE =
  /[^/\\"'<>|:*?\r\n]{1,100}\.(?:pdf|docx?|xlsx?|pptx?|rtf|txt|csv|odt|ods|png|jpe?g|gif|heic|webp|tiff?|zip|rar|7z|mp3|m4a|wav|ogg|mp4|mov)\b/gi;

/** Longest string kept; the rest is cut (a stack of text is never needed). */
export const SCRUB_MAX_CHARS = 600;

/** Removes e-mails, phone numbers, URL query strings (signed links), file
 * names and cuts long text. Pure; safe to call on any string. */
export function scrubString(
  input: string,
  maxChars: number = SCRUB_MAX_CHARS,
): string {
  let s = input
    .replace(URL_QUERY_RE, '$1?[REDACTED]')
    .replace(SIGNED_PARAM_RE, '$1=[REDACTED]')
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(FILE_NAME_RE, '[file]');
  if (s.length > maxChars) s = `${s.slice(0, maxChars)}…`;
  return s;
}

/** Longest stack kept in a log line (a stack is for debugging, but it can
 * carry an interpolated message with client data). */
const LOG_STACK_MAX_CHARS = 4000;

/**
 * S3-12: pino `formatters.log` hook. Provider SDK errors (axios from
 * Twilio / Stripe / Bunny, fetch wrappers) carry the request with its
 * headers and body; the path redaction removes the known fields and this
 * cleans what is left in the error text the same way Sentry's scrubber
 * does. The `err` object is copied, never mutated.
 */
export function scrubLogObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const err = obj.err;
  if (!err || typeof err !== 'object') return obj;
  // `message` and `stack` of a real Error are not enumerable: copy them.
  const e: Record<string, unknown> = { ...(err as Record<string, unknown>) };
  if (err instanceof Error) {
    e.type ??= err.name;
    e.message ??= err.message;
    e.stack ??= err.stack;
  }
  if (typeof e.message === 'string') e.message = scrubString(e.message, 2000);
  if (typeof e.stack === 'string') {
    e.stack = scrubString(e.stack, LOG_STACK_MAX_CHARS);
  }
  // A request / response object left on the error is never useful in logs.
  for (const k of ['config', 'request', 'response']) {
    if (k in e) e[k] = '[REDACTED]';
  }
  return { ...obj, err: e };
}

/** Cleans a value in place: sensitive keys become `[REDACTED]`, every other
 * string goes through [scrubString]. Cycles are cut by a depth limit. */
export function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (!value || typeof value !== 'object' || depth > 8) return value;
  const o = value as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    o[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : scrubDeep(o[k], depth + 1);
  }
  return o;
}
