import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { createHmac, randomInt } from 'node:crypto';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { SMS_PROVIDER, EMAIL_PROVIDER } from '../providers/provider.tokens';
import type { SmsProvider } from '../providers/sms/sms-provider.interface';
import type { EmailProvider } from '../providers/email/email-provider.interface';

export type OtpChannel = 'phone' | 'email';
/** Keeps a login OTP's Redis keys from colliding with a "verify new
 * contact" OTP for the same phone/email requested concurrently. */
export type OtpPurpose = 'login' | 'contact';

export type OtpVerifyResult = 'ok' | 'invalid' | 'expired' | 'locked';

// Single atomic round trip for verify — see docs/CHANGELOG.md stage 1.4
// for the race this avoids (a naive get-then-check-then-incr has a TOCTOU
// window where concurrent requests can both pass with 4 prior attempts).
// KEYS: 1=code hash key, 2=attempts key, 3=lock key
// ARGV: 1=candidateHash, 2=maxAttempts, 3=lockoutSeconds
const VERIFY_LUA = `
if redis.call('EXISTS', KEYS[3]) == 1 then
  return {'locked', redis.call('TTL', KEYS[3])}
end
local stored = redis.call('GET', KEYS[1])
if not stored then
  return {'expired', 0}
end
-- Lua string equality on two HMAC-SHA256 hex digests isn't constant-time,
-- but that's fine here: an attacker who doesn't know OTP_CODE_SECRET
-- can't grind a matching digest by timing this comparison, only by
-- guessing the 6-digit code itself, which the attempt counter below
-- already bounds at 5 tries.
if stored == ARGV[1] then
  redis.call('DEL', KEYS[1], KEYS[2])
  return {'ok', 0}
end
local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[2], ARGV[3])
end
if attempts >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[3], '1', 'EX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return {'locked', tonumber(ARGV[3])}
end
return {'invalid', tonumber(ARGV[2]) - attempts}
`;

/**
 * Owns OTP generation, hashing, delivery, and the attempt/lockout state
 * machine for BOTH stage 1.4's login flow (purpose='login') and stage
 * 1.4's contact-verification flow (purpose='contact', used by
 * UsersModule's ContactsService) — one implementation, not two, so the
 * security properties (hashing, lockout, rate limits) apply uniformly.
 *
 * docs/01_FOUNDATION_AUTH.md §10.6: "Хранить OTP только в виде хэша
 * (HMAC) в Redis с TTL, никогда в логах" — codes are HMAC-SHA256'd with
 * OTP_CODE_SECRET before storage; the raw code only ever exists in
 * memory long enough to hash it and hand it to the SMS/email provider.
 *
 * The attempts counter lives in ITS OWN Redis key with its OWN TTL that a
 * fresh /otp/request does NOT reset (see requestOtp: it overwrites the
 * code key but never touches the attempts key). Putting attempts inside
 * the code's own key would let an attacker reset their attempt budget by
 * simply requesting a new code after 4 wrong guesses.
 */
@Injectable()
export class OtpService {
  private readonly codeTtlSeconds: number;
  private readonly maxAttempts: number;
  private readonly lockoutSeconds: number;
  private readonly devFixedCode: boolean;
  private readonly codeSecret: string;
  private readonly keyPepper: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly config: ConfigService,
  ) {
    this.codeTtlSeconds = this.config.getOrThrow<number>(
      'OTP_CODE_TTL_SECONDS',
    );
    this.maxAttempts = this.config.getOrThrow<number>('OTP_MAX_ATTEMPTS');
    this.lockoutSeconds = this.config.getOrThrow<number>('OTP_LOCKOUT_SECONDS');
    this.devFixedCode = this.config.getOrThrow<boolean>('OTP_DEV_FIXED_CODE');
    this.codeSecret = this.config.getOrThrow<string>('OTP_CODE_SECRET');
    this.keyPepper = this.config.getOrThrow<string>('OTP_KEY_PEPPER');
  }

  /** Always succeeds (barring a provider outage) regardless of whether an
   * account exists for this identifier — docs/01_FOUNDATION_AUTH.md
   * §10.6's anti-enumeration rule applies here, not at verify. */
  async requestOtp(
    channel: OtpChannel,
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const code = this.devFixedCode ? '000000' : this.generateCode();
    const codeHash = this.hashCode(channel, identifier, code);
    const idHash = this.hashIdentifier(purpose, channel, identifier);

    await this.redis.set(
      this.codeKey(idHash),
      codeHash,
      'EX',
      this.codeTtlSeconds,
    );
    // Deliberately NOT touching the attempts key — see class doc.

    if (channel === 'phone') {
      await this.smsProvider.send(identifier, code);
    } else {
      await this.emailProvider.send(identifier, code);
    }
  }

  async verifyOtp(
    channel: OtpChannel,
    identifier: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<OtpVerifyResult> {
    const candidateHash = this.hashCode(channel, identifier, code);
    const idHash = this.hashIdentifier(purpose, channel, identifier);

    const result = (await this.redis.eval(
      VERIFY_LUA,
      3,
      this.codeKey(idHash),
      this.attemptsKey(idHash),
      this.lockKey(idHash),
      candidateHash,
      this.maxAttempts,
      this.lockoutSeconds,
    )) as [OtpVerifyResult, number];

    return result[0];
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /** Binds channel+identifier into the HMAC input so a code harvested via
   * one channel can't be replayed against another. */
  private hashCode(
    channel: OtpChannel,
    identifier: string,
    code: string,
  ): string {
    return createHmac('sha256', this.codeSecret)
      .update(`${channel}:${this.normalize(channel, identifier)}:${code}`)
      .digest('hex');
  }

  /** Raw phone/email never becomes part of a Redis key — keys leak into
   * SLOWLOG/MONITOR/keyspace notifications, which pino's redaction can't
   * cover. Uses a pepper separate from OTP_CODE_SECRET so a leaked Redis
   * key can't be used to help forge a code hash. */
  private hashIdentifier(
    purpose: OtpPurpose,
    channel: OtpChannel,
    identifier: string,
  ): string {
    return createHmac('sha256', this.keyPepper)
      .update(`${purpose}:${channel}:${this.normalize(channel, identifier)}`)
      .digest('hex')
      .slice(0, 32);
  }

  private normalize(channel: OtpChannel, identifier: string): string {
    return channel === 'email'
      ? identifier.trim().toLowerCase()
      : identifier.trim();
  }

  private codeKey(idHash: string): string {
    return `otp:code:${idHash}`;
  }
  private attemptsKey(idHash: string): string {
    return `otp:att:${idHash}`;
  }
  private lockKey(idHash: string): string {
    return `otp:lock:${idHash}`;
  }
}
