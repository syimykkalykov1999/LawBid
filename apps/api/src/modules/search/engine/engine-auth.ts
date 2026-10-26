import type { AwsCredentials } from './sigv4';

/** `domain` = provisioned OpenSearch domain (open inside the VPC / basic
 * auth), `serverless` = Amazon OpenSearch Serverless (SigV4, service `aoss`). */
export type EngineKind = 'domain' | 'serverless';

export function parseEngineKind(v: unknown): EngineKind {
  return v === 'serverless' ? 'serverless' : 'domain';
}

export type CredentialsProvider = () => Promise<AwsCredentials | null>;

/**
 * Credentials of the running task: env keys (local / CI) first, else the ECS
 * task role from the container credentials endpoint. Cached until 5 minutes
 * before they expire. No SDK: one small fetch.
 */
export function awsCredentialsProvider(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): CredentialsProvider {
  let cached: { creds: AwsCredentials; expiresAt: number } | null = null;
  return async () => {
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      return {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN || undefined,
      };
    }
    if (cached && cached.expiresAt - 5 * 60_000 > now()) return cached.creds;
    const rel = env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    const full = env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    const url = rel ? `http://169.254.170.2${rel}` : full;
    if (!url) return null;
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(2000),
        headers: env.AWS_CONTAINER_AUTHORIZATION_TOKEN
          ? { authorization: env.AWS_CONTAINER_AUTHORIZATION_TOKEN }
          : {},
      });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        AccessKeyId?: string;
        SecretAccessKey?: string;
        Token?: string;
        Expiration?: string;
      };
      if (!j.AccessKeyId || !j.SecretAccessKey) return null;
      const creds = {
        accessKeyId: j.AccessKeyId,
        secretAccessKey: j.SecretAccessKey,
        sessionToken: j.Token,
      };
      cached = {
        creds,
        expiresAt: j.Expiration
          ? Date.parse(j.Expiration)
          : now() + 15 * 60_000,
      };
      return creds;
    } catch {
      return null;
    }
  };
}
