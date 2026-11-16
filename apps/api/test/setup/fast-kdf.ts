/**
 * Unit tests only (jest `setupFiles` in apps/api/package.json; e2e keeps the
 * real cost). Production scrypt is N=2^16, r=8, p=2: 64 MiB and 0.2-2 s per
 * hash on a busy machine, so the password specs (several hashes each) hit
 * the 5 s timeout under parallel jest load (KNOWN_ERRORS №157).
 *
 * Here `crypto.scrypt` runs the same algorithm with N / 64 (at least 2):
 * still real scrypt and deterministic per (password, salt, N, r, p), so
 * hash/verify/rehash logic is tested unchanged; the stored string keeps the
 * production N. Same idea as Django's documented MD5PasswordHasher in test
 * settings and Rails' `SecurePassword.min_cost` (idea only, no code copied).
 */
type Crypto = typeof import('node:crypto');

const COST_DIVISOR = 64;

function fastCrypto(): Crypto {
  const real = jest.requireActual<Crypto>('node:crypto');
  const cheap = (opts: Record<string, unknown> | undefined) => {
    if (!opts) return opts;
    const n = (opts.N ?? opts.cost) as number | undefined;
    if (typeof n !== 'number') return opts;
    const out: Record<string, unknown> = { ...opts };
    delete out.cost; // the `N` alias
    out.N = Math.max(2, Math.floor(n / COST_DIVISOR));
    return out;
  };
  const scrypt = ((...args: unknown[]) => {
    // scrypt(password, salt, keylen, [options], callback)
    if (args.length >= 5) args[3] = cheap(args[3] as Record<string, unknown>);
    return (real.scrypt as (...a: unknown[]) => void)(...args);
  }) as Crypto['scrypt'];
  const scryptSync = ((...args: unknown[]) => {
    if (args.length >= 4) args[3] = cheap(args[3] as Record<string, unknown>);
    return (real.scryptSync as (...a: unknown[]) => Buffer)(...args);
  }) as Crypto['scryptSync'];
  return { ...real, scrypt, scryptSync };
}

jest.mock('node:crypto', fastCrypto);
jest.mock('crypto', fastCrypto);
