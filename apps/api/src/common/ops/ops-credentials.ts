import { createHash, createHmac } from 'node:crypto';
import { ECSClient } from '@aws-sdk/client-ecs';

export interface AwsCredentialIdentity {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * Infra audit S4-1 (2026-10-25): the admin «Масштаб / Запуск / Расходы» calls
 * (rds:ModifyDBInstance, ecs:UpdateService, budgets:*, ...) must not sit on
 * the task role of the process that serves the internet. When Terraform sets
 * `ops_role_split = true` it passes OPS_ROLE_ARN and OPS_ROLE_EXTERNAL_ID
 * (a Secrets Manager secret) and strips those rights from the task role; this
 * helper then assumes the separate `<name>-ops` role over STS and the three
 * ops services (aws-ops, aws-capacity, launch) sign their calls with it.
 * Without OPS_ROLE_ARN (default, local, CI) nothing changes: the default
 * credential chain is used.
 *
 * Dependency-free on purpose (no @aws-sdk/client-sts in the shared install):
 * one SigV4-signed STS AssumeRole call made with the task's own credentials.
 */

export type CredentialProvider = () => Promise<AwsCredentialIdentity>;

export interface OpsRoleConfig {
  roleArn: string;
  externalId?: string;
  region: string;
  /** The task's own credentials (the SDK default chain). */
  baseCredentials: CredentialProvider;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

const SESSION_SECONDS = 900;
const REFRESH_BEFORE_MS = 120_000;

const sha256 = (data: string): string =>
  createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

const encode = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export interface SigV4Input {
  method: string;
  host: string;
  path: string;
  /** Already-decoded query parameters. */
  query: Record<string, string>;
  /** Extra headers to sign (lower-case names). host and x-amz-date are added. */
  headers: Record<string, string>;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  amzDate: string; // 20150830T123600Z
}

/** AWS Signature Version 4 (header form). Returns the headers to send. */
export function signV4(i: SigV4Input): Record<string, string> {
  const date = i.amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...i.headers,
    host: i.host,
    'x-amz-date': i.amzDate,
  };
  if (i.sessionToken) headers['x-amz-security-token'] = i.sessionToken;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${headers[n].trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const canonicalQuery = Object.keys(i.query)
    .sort()
    .map((k) => `${encode(k)}=${encode(i.query[k])}`)
    .join('&');
  const canonicalRequest = [
    i.method,
    i.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    sha256(i.body),
  ].join('\n');
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = [
    'AWS4-HMAC-SHA256',
    i.amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${i.secretAccessKey}`, date);
  const kRegion = hmac(kDate, i.region);
  const kService = hmac(kRegion, i.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(toSign, 'utf8')
    .digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  if (!m) throw new Error(`STS answer has no ${name}`);
  return m[1];
}

/** A provider that assumes the ops role and refreshes it before expiry. */
export function assumeOpsRole(cfg: OpsRoleConfig): CredentialProvider {
  const doFetch = cfg.fetchFn ?? fetch;
  const now = cfg.now ?? (() => new Date());
  let cached: AwsCredentialIdentity | undefined;
  let inflight: Promise<AwsCredentialIdentity> | undefined;

  const load = async (): Promise<AwsCredentialIdentity> => {
    const base = await cfg.baseCredentials();
    const host = `sts.${cfg.region}.amazonaws.com`;
    const params: Record<string, string> = {
      Action: 'AssumeRole',
      Version: '2011-06-15',
      RoleArn: cfg.roleArn,
      RoleSessionName: 'lawbid-ops',
      DurationSeconds: String(SESSION_SECONDS),
    };
    if (cfg.externalId) params.ExternalId = cfg.externalId;
    const body = Object.keys(params)
      .sort()
      .map((k) => `${encode(k)}=${encode(params[k])}`)
      .join('&');
    const amzDate = now()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '');
    const headers = signV4({
      method: 'POST',
      host,
      path: '/',
      query: {},
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body,
      region: cfg.region,
      service: 'sts',
      accessKeyId: base.accessKeyId,
      secretAccessKey: base.secretAccessKey,
      sessionToken: base.sessionToken,
      amzDate,
    });
    delete headers.host; // fetch sets it from the URL
    const res = await doFetch(`https://${host}/`, {
      method: 'POST',
      headers,
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ops role: STS AssumeRole failed (${res.status})`);
    }
    const creds: AwsCredentialIdentity = {
      accessKeyId: tag(text, 'AccessKeyId'),
      secretAccessKey: tag(text, 'SecretAccessKey'),
      sessionToken: tag(text, 'SessionToken'),
      expiration: new Date(tag(text, 'Expiration')),
    };
    cached = creds;
    return creds;
  };

  return async () => {
    if (
      cached?.expiration &&
      cached.expiration.getTime() - now().getTime() > REFRESH_BEFORE_MS
    ) {
      return cached;
    }
    inflight ??= load().finally(() => {
      inflight = undefined;
    });
    return inflight;
  };
}

/** The task's own credentials: the SDK default chain, borrowed from a client. */
const defaultChain = (region: string) => (): CredentialProvider =>
  new ECSClient({ region }).config.credentials as CredentialProvider;

const providers = new Map<string, CredentialProvider>();

/**
 * Credentials for the ops AWS calls. `undefined` = use the default chain
 * (ops_role_split off). `makeBase` returns the task's own credentials.
 */
export function opsCredentials(
  env: (name: string) => string | undefined,
  region: string,
  makeBase: () => CredentialProvider = defaultChain(region),
): CredentialProvider | undefined {
  const roleArn = env('OPS_ROLE_ARN');
  if (!roleArn) return undefined;
  const externalId = env('OPS_ROLE_EXTERNAL_ID');
  const key = `${roleArn}|${region}`;
  let p = providers.get(key);
  if (!p) {
    p = assumeOpsRole({
      roleArn,
      externalId,
      region,
      baseCredentials: makeBase(),
    });
    providers.set(key, p);
  }
  return p;
}
