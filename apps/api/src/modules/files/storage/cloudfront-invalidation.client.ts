import { createHash, createHmac, randomUUID } from 'node:crypto';
import { SignatureV4 } from '@smithy/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

/**
 * Owner 2026-10-25 (caching round 2, S2-1): CloudFront `CreateInvalidation`
 * as one signed REST call, so no extra SDK package is installed. The
 * request is the documented `POST /2020-05-31/distribution/{id}/invalidation`
 * with an XML body, signed with SigV4 (service `cloudfront`, region
 * `us-east-1`, the global endpoint). Credentials come from the default AWS
 * chain, i.e. the ECS task role in production.
 */
export interface InvalidationRequest {
  distributionId: string;
  /** Paths with a leading slash; `/key*` is one wildcard path. */
  paths: string[];
  /** Idempotency token; a retry with the same token is the same request. */
  callerReference?: string;
}

export type InvalidationSender = (req: InvalidationRequest) => Promise<void>;

const HOST = 'cloudfront.amazonaws.com';

/** Escapes the five XML special characters. */
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function invalidationBody(
  paths: string[],
  callerReference: string,
): string {
  const items = paths.map((p) => `<Path>${xml(p)}</Path>`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">' +
    `<Paths><Quantity>${paths.length}</Quantity><Items>${items}</Items></Paths>` +
    `<CallerReference>${xml(callerReference)}</CallerReference>` +
    '</InvalidationBatch>'
  );
}

/** Minimal SHA-256 / HMAC adapter in the shape SignatureV4 expects. */
type SourceData = string | ArrayBuffer | ArrayBufferView;

function toBuffer(data: SourceData): Buffer {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from(data);
}

class Sha256 {
  private readonly parts: Buffer[] = [];
  constructor(private readonly secret?: SourceData) {}
  update(data: SourceData): void {
    this.parts.push(toBuffer(data));
  }
  digest(): Promise<Uint8Array> {
    const body = Buffer.concat(this.parts);
    const out = this.secret
      ? createHmac('sha256', toBuffer(this.secret)).update(body).digest()
      : createHash('sha256').update(body).digest();
    return Promise.resolve(new Uint8Array(out));
  }
  reset(): void {
    this.parts.length = 0;
  }
}

/** The production sender (signed `fetch`). */
export function createCloudFrontInvalidationSender(
  fetchFn: typeof fetch = fetch,
): InvalidationSender {
  const signer = new SignatureV4({
    service: 'cloudfront',
    region: 'us-east-1',
    credentials: defaultProvider(),
    sha256: Sha256,
  });
  return async (req) => {
    const body = invalidationBody(
      req.paths,
      req.callerReference ?? randomUUID(),
    );
    const path = `/2020-05-31/distribution/${encodeURIComponent(req.distributionId)}/invalidation`;
    const signed = await signer.sign({
      method: 'POST',
      protocol: 'https:',
      hostname: HOST,
      path,
      query: {},
      headers: {
        host: HOST,
        'content-type': 'text/xml',
      },
      body,
    });
    // fetch sets Host and Content-Length itself.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(signed.headers)) {
      if (k.toLowerCase() !== 'host') headers[k] = String(v);
    }
    const res = await fetchFn(`https://${HOST}${path}`, {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`CloudFront invalidation refused: ${res.status} ${text}`);
    }
  };
}
