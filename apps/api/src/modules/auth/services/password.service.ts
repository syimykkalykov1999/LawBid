import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { COMMON_PASSWORDS } from '../data/common-passwords';

const COMMON_SET: ReadonlySet<string> = new Set(COMMON_PASSWORDS);
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/** Owner 2026-10-13: the password rules shown by the app (8+ characters). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Security pass 2026-10-25 (S3-6): OWASP Password Storage cheat sheet —
// scrypt with N=2^16, r=8, p=2 (64 MiB, about 100-200 ms on one vCPU).
// Older hashes (N=2^14, p=1) still verify and are rewritten on the next
// successful sign-in (`needsRehash`).
export const SCRYPT_N = 65536;
export const SCRYPT_R = 8;
export const SCRYPT_P = 2;
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

  /** Hashes running now / waiting (see `withSlot`). */
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  /**
   * Owner 2026-10-25: at most `security.password_hash_concurrency` scrypt
   * runs at once on this server (libuv's pool also does file system and DNS
   * work: a sign-in flood must not queue those behind hashes). Others wait
   * in line; beyond `security.password_hash_max_queue` the request is
   * refused with RATE_LIMITED. Metric line: `password_hash_queue`.
   */
  private async withSlot<T>(work: () => Promise<T>): Promise<T> {
    const max = await this.readInt('security.password_hash_concurrency', 2, 1);
    // Read both settings first: from the check below to the slot grab
    // nothing may be awaited (a slot freed meanwhile would be missed).
    const maxQueue = await this.readInt(
      'security.password_hash_max_queue',
      200,
      0,
    );
    if (this.running >= max) {
      if (this.waiting.length >= maxQueue) {
        this.logger?.warn(
          { metric: 'password_hash_rejected', queued: this.waiting.length },
          'password hash queue full',
        );
        throw new HttpException(
          {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests. Try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
      // The releasing run handed its slot over: `running` is unchanged.
    } else {
      this.running++;
    }
    this.logger?.info(
      {
        metric: 'password_hash_queue',
        running: this.running,
        queued: this.waiting.length,
      },
      'password hash queue',
    );
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }

  private async readInt(
    key:
      | 'security.password_hash_concurrency'
      | 'security.password_hash_max_queue'
      | 'security.password_breach_timeout_ms',
    fallback: number,
    min: number,
  ): Promise<number> {
    try {
      const v = await this.settings?.number(key);
      if (v !== undefined && Number.isFinite(v) && v >= min)
        return Math.round(v);
    } catch {
      // settings unreachable: keep the default
    }
    return fallback;
  }

  private async readFlag(
    key:
      | 'security.password_breach_check_enabled'
      | 'security.password_common_list_enabled',
  ): Promise<boolean> {
    try {
      return (await this.settings?.boolean(key)) ?? true;
    } catch {
      return true;
    }
  }

  /**
   * NIST SP 800-63B-4 §3.1.1.2: a new password is compared, as a whole,
   * against a blocklist (the common list, then breach corpuses via the
   * Pwned Passwords range API, k-anonymity: only the first 5 characters of
   * the SHA-1 leave the server, with `Add-Padding`). A hit is refused with
   * the reason (AUTH_PASSWORD_COMPROMISED). If the breach service is slow
   * or down the check is skipped (logged): sign-up never depends on it.
   */
  async assertNotCompromised(password: string): Promise<void> {
    const reject = (reason: 'common' | 'breached'): never => {
      throw new HttpException(
        {
          code: ErrorCode.AUTH_PASSWORD_COMPROMISED,
          message:
            'This password is too common or has appeared in a data breach. Choose a different one.',
          details: { reason },
        },
        HttpStatus.BAD_REQUEST,
      );
    };
    if (
      (await this.readFlag('security.password_common_list_enabled')) &&
      COMMON_SET.has(password.normalize('NFKC').toLowerCase())
    ) {
      reject('common');
    }
    // No settings service (a bare unit test): never reach the network.
    if (!this.settings) return;
    if (!(await this.readFlag('security.password_breach_check_enabled')))
      return;
    if (await this.isBreached(password)) reject('breached');
  }

  private async isBreached(password: string): Promise<boolean> {
    const timeoutMs = await this.readInt(
      'security.password_breach_timeout_ms',
      1500,
      200,
    );
    try {
      const sha1 = createHash('sha1')
        .update(password.normalize('NFKC'))
        .digest('hex')
        .toUpperCase();
      const res = await fetch(HIBP_RANGE_URL + sha1.slice(0, 5), {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'LawBid-API' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HIBP status ${res.status}`);
      const suffix = sha1.slice(5);
      for (const line of (await res.text()).split('\n')) {
        const [hash, count] = line.trim().split(':');
        if (hash === suffix) return Number(count) > 0; // padding rows are 0
      }
      return false;
    } catch (err) {
      this.logger?.warn(
        { metric: 'password_breach_check_skipped', err: String(err) },
        'breached-password check skipped (service unavailable)',
      );
      return false;
    }
  }

  isAcceptable(password: string): boolean {
    return (
      password.length >= PASSWORD_MIN_LENGTH &&
      password.length <= PASSWORD_MAX_LENGTH
    );
  }

  /** True when [stored] was made with weaker parameters than today's. */
  needsRehash(stored: string | null): boolean {
    if (!stored) return false;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== FORMAT) return false;
    const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    return n < SCRYPT_N || r < SCRYPT_R || p < SCRYPT_P;
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await this.withSlot(() =>
      scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH),
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
    const key = await this.withSlot(() =>
      scryptAsync(
        password,
        Buffer.from(salt, 'base64url'),
        Number(n),
        Number(r),
        Number(p),
        expected.length,
      ),
    );
    return real && timingSafeEqual(key, expected);
  }

  private getDummy(): Promise<string> {
    this.dummyHash ??= this.hash(randomBytes(18).toString('base64url'));
    return this.dummyHash;
  }
}
