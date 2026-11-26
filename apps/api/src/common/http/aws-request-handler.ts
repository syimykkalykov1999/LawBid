/**
 * Time limits of every AWS SDK v3 client of ours (and of R2, which speaks
 * S3). M5 (docs/dev/SECOND_PASS_2026-11-26.md; AWS Well-Architected
 * REL05-BP05 «Set client timeouts»): without them a half-open socket holds
 * the caller — a moderation or verification job until its BullMQ lock
 * expires and the job runs again, an admin board until the browser gives up.
 *
 * The values are the SDK's own `requestHandler` constructor options
 * (NodeHttpHandlerOptions of @smithy/node-http-handler, Apache-2.0; passing
 * the options object instead of a handler instance is the SDK's documented
 * shorthand). What each option does in the installed @smithy 4.14
 * (node_modules/@smithy/types/dist-types/http/httpHandlerInitialization.d.ts):
 *  - `connectionTimeout`: the TCP + TLS connect phase;
 *  - `socketTimeout`: the socket may be idle that long, also while a body
 *    streams in (a body that stalls after fast headers fails too);
 *  - `requestTimeout`: the whole request and response. On its own it only
 *    LOGS a warning — `throwOnRequestTimeout: true` makes it an error that
 *    destroys the request. Before this file our R2/S3/SES clients set
 *    `requestTimeout` alone, so they never actually gave up.
 */

/** Connect within 3 s (as SES, R2 and S3 did before). */
export const AWS_CONNECT_TIMEOUT_MS = 3_000;

/** One AWS API call (CloudWatch, ECS, RDS, ElastiCache, Auto Scaling,
 * Budgets, Cost Explorer, SNS, Backup, KMS, Kinesis, Rekognition): the same
 * 10 s as one SES send (SES_SEND_TIMEOUT_MS). Their answers are small and
 * come in well under a second; a call that takes 10 s is a hung one. */
export const AWS_API_TIMEOUT_MS = 10_000;

/** Object storage: a socket idle for 30 s is given up. Idle, not total — a
 * large upload or a long server-side copy keeps its connection busy. */
export const AWS_STORAGE_IDLE_MS = 30_000;

/** The options every client passes as `requestHandler`. */
export interface AwsRequestHandlerOptions {
  readonly connectionTimeout: number;
  readonly socketTimeout: number;
  readonly requestTimeout?: number;
  readonly throwOnRequestTimeout?: boolean;
}

/** A call that must END within [totalMs]: connect 3 s, idle and total
 * [totalMs], and the total limit really throws (TimeoutError). */
export function awsRequestHandler(totalMs: number): AwsRequestHandlerOptions {
  return {
    connectionTimeout: Math.min(AWS_CONNECT_TIMEOUT_MS, totalMs),
    socketTimeout: totalMs,
    requestTimeout: totalMs,
    throwOnRequestTimeout: true,
  };
}

/** AWS API calls (see AWS_API_TIMEOUT_MS). */
export const AWS_API_REQUEST_HANDLER = awsRequestHandler(AWS_API_TIMEOUT_MS);

/** Object storage (R2 and S3): connect 3 s, idle 30 s, no total limit. */
export const STORAGE_REQUEST_HANDLER: AwsRequestHandlerOptions = {
  connectionTimeout: AWS_CONNECT_TIMEOUT_MS,
  socketTimeout: AWS_STORAGE_IDLE_MS,
};
