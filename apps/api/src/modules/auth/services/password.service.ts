import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Owner 2026-10-13: the password rules shown by the app (8+ characters). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const FORMAT = 'scrypt';

function scryptAsync(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      { N: n, r, p, maxmem: 128 * n * r * 2 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/**
 * Password hashing with Node's built-in scrypt (no native dependency).
 * Stored as `scrypt$N$r$p$salt$hash` (base64url) so the cost can be raised
 * later while old hashes still verify.
 */
@Injectable()
export class PasswordService {
  /** A hash of a random password, verified against when the account is
   * unknown or has no password — so a miss costs the same time as a hit and
   * the answer does not reveal which accounts exist. */
  private dummyHash?: Promise<string>;

  isAcceptable(password: string): boolean {
    return (
      password.length >= PASSWORD_MIN_LENGTH &&
      password.length <= PASSWORD_MAX_LENGTH
    );
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(
      password,
      salt,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      KEY_LENGTH,
    );
    return [
      FORMAT,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
  }

  /** Constant-time check; a null / malformed `stored` still burns the same
   * work and returns false. */
  async verify(password: string, stored: string | null): Promise<boolean> {
    const parts = (stored ?? (await this.getDummy())).split('$');
    const real = stored !== null && parts.length === 6 && parts[0] === FORMAT;
    const [, n, r, p, salt, hash] = real
      ? parts
      : (await this.getDummy()).split('$');
    const expected = Buffer.from(hash, 'base64url');
    const key = await scryptAsync(
      password,
      Buffer.from(salt, 'base64url'),
      Number(n),
      Number(r),
      Number(p),
      expected.length,
    );
    return real && timingSafeEqual(key, expected);
  }

  private getDummy(): Promise<string> {
    this.dummyHash ??= this.hash(randomBytes(18).toString('base64url'));
    return this.dummyHash;
  }
}
