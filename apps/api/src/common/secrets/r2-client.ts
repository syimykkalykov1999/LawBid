import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { STORAGE_REQUEST_HANDLER } from '../http/aws-request-handler';

/** The R2 keys every S3 client of ours needs. */
export interface R2Keys {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * The S3 client for Cloudflare R2 (developers.cloudflare.com/r2/examples/
 * aws/aws-sdk-js-v3): region `auto`, the account's endpoint, and checksums
 * only when an operation requires them.
 *
 * `R2_TEST_ENDPOINT` points the client at a local MinIO for the e2e suite
 * (test/r2-public-store.e2e-spec.ts); production ignores it.
 */
/** Time limits of the object-storage clients (R2 and S3): connect within
 * 3 s; a socket idle for 30 s is given up (idle, not total — a long
 * server-side copy keeps its connection busy). Defined with the other AWS
 * client limits (common/http/aws-request-handler.ts, M5 26.11). */
export { STORAGE_REQUEST_HANDLER };

export function createR2Client(keys: R2Keys): S3Client {
  const test =
    process.env.NODE_ENV === 'production'
      ? undefined
      : process.env.R2_TEST_ENDPOINT;
  return new S3Client({
    // MinIO checks the region of the signature; R2 wants `auto`.
    region: test ? 'us-east-1' : 'auto',
    endpoint: test ?? `https://${keys.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: test !== undefined,
    credentials: {
      accessKeyId: keys.accessKeyId,
      secretAccessKey: keys.secretAccessKey,
    },
    // Infra audit 14.11 (as SES does): a bucket that stops answering frees
    // the request and its socket; the SDK default is no limit at all. M5
    // 26.11: an idle limit (`socketTimeout`) — `requestTimeout` alone only
    // logged a warning.
    requestHandler: STORAGE_REQUEST_HANDLER,
    // Newer SDK checksums are not accepted by every R2 operation.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/**
 * The web app's address, from the convention `media.<web host>` for the public
 * custom domain. Another domain: unknown, the checks that need it are skipped.
 */
export function webOriginOf(publicBaseUrl: string): string | undefined {
  const m = /^https:\/\/media\.([^/]+)\/*$/.exec(publicBaseUrl.trim());
  return m ? `https://${m[1]}` : undefined;
}

/**
 * R2 has no presigned POST. A presigned PUT of exactly [size] bytes; the
 * signature covers Content-Type, Content-Length and Cache-Control, so the
 * client must send those headers as they are.
 */
export function presignR2Put(
  client: S3Client,
  input: {
    bucket: string;
    key: string;
    contentType: string;
    size: number;
    cacheControl: string;
    expiresSec: number;
  },
): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.size,
      CacheControl: input.cacheControl,
    }),
    {
      expiresIn: input.expiresSec,
      signableHeaders: new Set([
        'content-type',
        'content-length',
        'cache-control',
      ]),
    },
  );
}
