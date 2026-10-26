import { createHash, createHmac } from 'node:crypto';

/**
 * A minimal AWS Signature Version 4 signer on node:crypto.
 *
 * Why not the SDK: `@opensearch-project/opensearch` is not a dependency (the
 * engine client talks plain fetch on purpose, so the API image does not grow)
 * and `@smithy/signature-v4` is only a transitive package. SigV4 is ~60 lines
 * and is checked against AWS's own published test vector (sigv4.spec.ts).
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignInput {
  method: string;
  /** Absolute URL, query string included. */
  url: string;
  body?: string;
  region: string;
  /** `aoss` = OpenSearch Serverless, `es` = provisioned domain. */
  service: string;
  credentials: AwsCredentials;
  date: Date;
  /** Sign `x-amz-content-sha256` too (OpenSearch Serverless requires it). */
  contentSha256Header?: boolean;
}

const sha256hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, s: string): Buffer =>
  createHmac('sha256', key).update(s, 'utf8').digest();

/** RFC 3986 encoding as AWS wants it (`*` and `!'()` are escaped too). */
function enc(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Returns the headers to add to the request (authorization and friends). */
export function signRequest(input: SignInput): Record<string, string> {
  const u = new URL(input.url);
  const amzDate = input.date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256hex(input.body ?? '');

  // Non-S3 services: every path segment is encoded twice.
  const canonicalPath =
    u.pathname
      .split('/')
      .map((seg) => enc(enc(safeDecode(seg))))
      .join('/') || '/';
  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort((a, b) =>
      a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1,
    )
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const signed: Record<string, string> = {
    host: u.host,
    'x-amz-date': amzDate,
  };
  if (input.contentSha256Header) signed['x-amz-content-sha256'] = payloadHash;
  if (input.credentials.sessionToken) {
    signed['x-amz-security-token'] = input.credentials.sessionToken;
  }
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${signed[n].trim()}\n`)
    .join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${input.credentials.secretAccessKey}`, day);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(toSign, 'utf8')
    .digest('hex');

  const out: Record<string, string> = {
    'x-amz-date': amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (input.contentSha256Header) out['x-amz-content-sha256'] = payloadHash;
  if (input.credentials.sessionToken) {
    out['x-amz-security-token'] = input.credentials.sessionToken;
  }
  return out;
}
