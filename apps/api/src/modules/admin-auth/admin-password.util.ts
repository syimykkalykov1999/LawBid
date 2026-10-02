import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Admin passwords and the security answer are stored only as scrypt hashes
 * (`scrypt$N$r$p$salt$hash`, memory-hard, random salt per value). No
 * dependency: node:crypto is enough and keeps the supply chain short.
 */
const N = 1 << 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAX_MEM = 128 * N * R * 2;

function scrypt(
  value: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: MAX_MEM };
  return new Promise((resolve, reject) => {
    scryptCb(value, salt, KEY_LEN, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashSecret(value: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(value, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifySecret(
  value: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(
    value,
    Buffer.from(salt, 'base64'),
    Number(n),
    Number(r),
    Number(p),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A throwaway hash so a wrong login costs the same time as a wrong password. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashSecret('not-a-real-password');
  return dummy;
}

/** Security answers are compared ignoring case and extra spaces. */
export function normalizeAnswer(answer: string): string {
  return answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,38}[a-z0-9]$/;

export function normalizeLogin(login: string): string {
  return login.normalize('NFKC').trim().toLowerCase();
}

/** Returns a human message, or null when the password is acceptable. */
export function passwordProblem(
  password: string,
  login?: string | null,
): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  if (login && password.toLowerCase().includes(login.toLowerCase())) {
    return 'Password must not contain the login.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password needs letters and digits.';
  }
  return null;
}
