/**
 * Security pass 2026-10-25 (S3-13): the env validator used to guarantee
 * only a length (32+ characters), not randomness — a dictionary phrase
 * passed. On staging/production a key must now look like CSPRNG output
 * (NIST SP 800-133): base64 / base64url of at least 32 random bytes, a
 * long hex string, or any long high-entropy string (a password-manager
 * generated one), or — for the two key lists — a KMS-wrapped entry.
 * `KEY_STRENGTH_CHECK=off` skips the check (documented escape hatch).
 */
const HEX = /^[0-9a-fA-F]+$/;

/** Shannon entropy in bits per character. */
export function entropyBitsPerChar(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** A reason the secret is too weak, or null when it looks random. */
export function keyStrengthProblem(secret: string): string | null {
  if (secret.length < 32) return 'shorter than 32 characters';
  const distinct = new Set(secret).size;
  const bits = entropyBitsPerChar(secret);
  if (HEX.test(secret)) {
    // Hex carries 4 bits per character: 64 characters = 32 bytes.
    if (secret.length < 64) return 'hex keys need 64+ characters (32 bytes)';
    // 64 random hex characters measure 3.4-4.0 bits/char (sample entropy
    // of 64 draws); 3.5 rejected about 1 in 6000 real keys.
    return distinct >= 12 && bits >= 3.3 ? null : 'low entropy';
  }
  const need = secret.length >= 48 ? 24 : 16;
  // 43 random base64url characters measure from about 4.2 bits/char; a
  // dictionary phrase stays near 3.4-3.9.
  if (distinct < need || bits < 4.0) return 'low entropy (not random)';
  return null;
}

/** Every weak secret in a "kid:secret,…" list (`kms:` entries are fine). */
export function weakKeysInList(list: string): string[] {
  const out: string[] = [];
  for (const pair of list.split(',')) {
    const i = pair.indexOf(':');
    const kid = i === -1 ? pair : pair.slice(0, i);
    const secret = i === -1 ? '' : pair.slice(i + 1);
    if (secret.startsWith('kms:')) continue;
    const problem = keyStrengthProblem(secret);
    if (problem) out.push(`${kid}: ${problem}`);
  }
  return out;
}
