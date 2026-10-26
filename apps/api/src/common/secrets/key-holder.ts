/**
 * Security pass 2026-10-25 (S3-3): the plaintext data keys must not sit in
 * `process.env` (visible to child processes, `/proc/<pid>/environ`, crash
 * dumps and error reporters that capture the environment). Boot order:
 *
 *   1. `unwrapKmsWrappedKeys()` turns `kms:` entries into plaintext;
 *   2. `captureKeyEnv()` copies the key variables into this module-level
 *      holder (before Nest reads the config);
 *   3. Nest boots — env validation and every cipher constructor read the
 *      keys (through `readKey`, holder first, config second);
 *   4. `scrubKeyEnv()` deletes the variables from `process.env`.
 *
 * Without `captureKeyEnv` (tests, local CLI) `readKey` simply falls back to
 * the config, so behaviour is unchanged there.
 */

/** Variables that carry raw or unwrapped key material. */
export const KEY_ENV_VARS = [
  'MESSAGE_ENC_KEYS',
  'SECRETS_MASTER_KEYS',
  'JWT_KEYS',
  'ADMIN_TOTP_ENC_KEY',
  // BUG-1 (package N-12b): HMAC key of the chat search blind index.
  'SEARCH_INDEX_KEY',
] as const;

export type KeyEnvVar = (typeof KEY_ENV_VARS)[number];

const held = new Map<string, string>();

/** Copies the key variables of [env] into the holder. */
export function captureKeyEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  let n = 0;
  for (const name of KEY_ENV_VARS) {
    const v = env[name];
    if (v) {
      held.set(name, v);
      n += 1;
    }
  }
  return n;
}

/** Deletes the key variables from [env]; the holder keeps them. Returns
 * the names removed. */
export function scrubKeyEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const removed: string[] = [];
  for (const name of KEY_ENV_VARS) {
    if (name in env) {
      delete env[name];
      removed.push(name);
    }
  }
  return removed;
}

/** The held value of [name], else [fallback] (the ConfigService read). */
export function readKey(
  name: KeyEnvVar,
  fallback: () => string | undefined,
): string | undefined {
  return held.get(name) ?? fallback();
}

/** Test helper. */
export function resetKeyHolder(): void {
  held.clear();
}
