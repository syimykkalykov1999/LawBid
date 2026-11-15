import { scrypt as scryptCb, type ScryptOptions } from 'node:crypto';
import { scrypt as scryptBare } from 'crypto';

/**
 * Unit tests run scrypt at a test cost (see `test/setup/fast-kdf.ts`): the
 * production N=2^16, r=8, p=2 (64 MiB, 0.2-2 s under parallel jest load)
 * pushed the password specs past the 5 s timeout (KNOWN_ERRORS №157).
 */
function scrypt(
  fn: typeof scryptCb,
  password: string,
  opts: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    fn(password, 'salt', 64, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

const PROD = { N: 65536, r: 8, p: 2 };
const TWO_MIB = 2 * 1024 * 1024;

describe('unit-test scrypt cost (test/setup/fast-kdf.ts)', () => {
  it('a production-cost hash runs in 2 MiB instead of 64 MiB', async () => {
    const key = await scrypt(scryptCb, 'Correct horse 1', {
      ...PROD,
      maxmem: TWO_MIB,
    });
    expect(key).toHaveLength(64);
  });

  it('covers the bare `crypto` import too', async () => {
    const key = await scrypt(scryptBare, 'Correct horse 1', {
      ...PROD,
      maxmem: TWO_MIB,
    });
    expect(key).toHaveLength(64);
  });

  it('stays deterministic per (password, N): verify still matches, other N or password does not', async () => {
    const a = await scrypt(scryptCb, 'Correct horse 1', PROD);
    const b = await scrypt(scryptCb, 'Correct horse 1', PROD);
    const legacy = await scrypt(scryptCb, 'Correct horse 1', {
      N: 16384,
      r: 8,
      p: 1,
    });
    const other = await scrypt(scryptCb, 'Correct horse 2', PROD);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(legacy)).toBe(false);
    expect(a.equals(other)).toBe(false);
  });
});
