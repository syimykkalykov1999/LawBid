/**
 * Owner 2026-10-22 (docs/SECURITY_TODO.md «KMS-wrapped keys»): the two key
 * lists in the task environment — MESSAGE_ENC_KEYS (chat texts at rest)
 * and SECRETS_MASTER_KEYS (the admin key store) — may hold data keys
 * wrapped by an AWS KMS key instead of raw secrets:
 *
 *     m1:<raw secret>,m2:kms:<base64 CiphertextBlob>
 *
 * `unwrapKmsWrappedKeys()` runs once per process before Nest boots
 * (main.ts, worker.ts, the CLI): every `kms:` entry is decrypted with one
 * `kms:Decrypt` call and replaced in process.env by its plaintext, so the
 * synchronous consumers (SecretEnvelope, MessageBodyCipher, SecretsService)
 * keep working unchanged and the plaintext lives only in this process's
 * memory. Raw entries pass through untouched; without any `kms:` entry
 * KMS is never contacted (local dev, tests).
 *
 * The task role may only Decrypt with the dedicated data-keys key and only
 * with the encryption context `app=<stack name>` (infra/modules/stack):
 * DATA_KEYS_KMS_APP carries that name, DATA_KEYS_KMS_KEY_ARN the key (both
 * optional — a ciphertext names its own key).
 */
export const KMS_WRAPPED_PREFIX = 'kms:';

/** Env vars that are "kid:secret,…" lists and may carry wrapped entries. */
export const KMS_WRAPPED_ENV_VARS = [
  'MESSAGE_ENC_KEYS',
  'SECRETS_MASTER_KEYS',
] as const;

export type KmsDecrypt = (
  ciphertext: Uint8Array,
  context: { keyId?: string; encryptionContext?: Record<string, string> },
) => Promise<Uint8Array>;

export interface UnwrapResult {
  /** Entries decrypted, per env var name. */
  unwrapped: Record<string, number>;
}

/** True when any listed var has at least one `kid:kms:…` entry. */
export function hasKmsWrappedKeys(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return KMS_WRAPPED_ENV_VARS.some((name) =>
    splitEntries(env[name]).some((e) => e.wrapped),
  );
}

interface Entry {
  kid: string;
  secret: string;
  wrapped: boolean;
}

function splitEntries(raw: string | undefined): Entry[] {
  if (!raw) return [];
  return raw
    .split(',')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const i = pair.indexOf(':');
      const kid = i === -1 ? pair : pair.slice(0, i);
      const secret = i === -1 ? '' : pair.slice(i + 1);
      return {
        kid,
        secret,
        wrapped: secret.startsWith(KMS_WRAPPED_PREFIX),
      };
    });
}

/**
 * Replaces every wrapped entry in [env] with its plaintext. [decrypt]
 * defaults to the AWS SDK (loaded lazily so tests and local runs never
 * touch it). Throws when a wrapped entry cannot be decrypted: booting with
 * a half-usable key list would silently make chats unreadable.
 */
export async function unwrapKmsWrappedKeys(
  env: Record<string, string | undefined> = process.env,
  decrypt?: KmsDecrypt,
): Promise<UnwrapResult> {
  const unwrapped: Record<string, number> = {};
  if (!hasKmsWrappedKeys(env)) return { unwrapped };
  const kms = decrypt ?? (await awsDecrypt(env));
  const keyId = env.DATA_KEYS_KMS_KEY_ARN || undefined;
  const app = env.DATA_KEYS_KMS_APP || undefined;
  const encryptionContext = app ? { app } : undefined;
  for (const name of KMS_WRAPPED_ENV_VARS) {
    const entries = splitEntries(env[name]);
    if (!entries.some((e) => e.wrapped)) continue;
    const out: string[] = [];
    let count = 0;
    for (const e of entries) {
      if (!e.wrapped) {
        out.push(`${e.kid}:${e.secret}`);
        continue;
      }
      const blob = Buffer.from(
        e.secret.slice(KMS_WRAPPED_PREFIX.length),
        'base64',
      );
      if (blob.length === 0) {
        throw new Error(`${name}: key "${e.kid}" has an empty kms: ciphertext`);
      }
      let plain: Uint8Array;
      try {
        plain = await kms(blob, { keyId, encryptionContext });
      } catch (err) {
        throw new Error(
          `${name}: kms:Decrypt failed for key "${e.kid}" (${(err as Error).message})`,
        );
      }
      const secret = Buffer.from(plain).toString('utf8');
      if (secret.length < 32) {
        throw new Error(
          `${name}: key "${e.kid}" decrypted to fewer than 32 chars`,
        );
      }
      out.push(`${e.kid}:${secret}`);
      count += 1;
    }
    env[name] = out.join(',');
    unwrapped[name] = count;
  }
  return { unwrapped };
}

async function awsDecrypt(
  env: Record<string, string | undefined>,
): Promise<KmsDecrypt> {
  const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient({
    region: env.AWS_REGION ?? env.S3_REGION ?? 'us-east-1',
  });
  return async (ciphertext, { keyId, encryptionContext }) => {
    const res = await client.send(
      new DecryptCommand({
        CiphertextBlob: ciphertext,
        KeyId: keyId,
        EncryptionContext: encryptionContext,
      }),
    );
    if (!res.Plaintext) throw new Error('KMS returned no plaintext');
    return res.Plaintext;
  };
}
