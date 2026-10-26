import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import { AttorneyTrustService } from './attorney-trust.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { assertEmailFlowsOn } from '../feature-flags/email-flows';

const CODE_TTL_SEC = 15 * 60;
const SEND_LIMIT_PER_DAY = 5;
const ATTEMPTS_MAX = 5;
/** Free mailboxes prove nothing about a firm. */
const PUBLIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'yandex.ru',
  'yandex.com',
  'mail.ru',
]);

interface Pending {
  code: string;
  domain: string;
  email: string;
  attempts: number;
}

/**
 * Owner 2026-10-05: an attorney whose Stripe account belongs to a firm
 * proves the link by receiving a code at an address on the firm's own
 * domain (@smithlaw.com, not gmail). The confirmed domain is kept on the
 * trust row; it counts automatically when it is the Stripe company's
 * website domain.
 */
@Injectable()
export class FirmEmailService {
  constructor(
    private readonly trust: AttorneyTrustService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @InjectPinoLogger(FirmEmailService.name)
    private readonly logger: PinoLogger,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async request(
    attorneyId: string,
    rawEmail: string,
    locale: string,
  ): Promise<{ domain: string }> {
    // Admin «Вход и письма по почте» off: the code could not be delivered.
    await assertEmailFlowsOn(this.flags);
    const email = rawEmail.trim().toLowerCase();
    const at = email.lastIndexOf('@');
    const domain = at > 0 ? email.slice(at + 1) : '';
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Enter a work e-mail address.',
        details: { field: 'email' },
      });
    }
    if (PUBLIC_DOMAINS.has(domain)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'A free mailbox cannot confirm a firm. Use your address at the firm.',
        details: { field: 'email', reason: 'public_domain' },
      });
    }
    const sent = await this.redis.incr(this.sentKey(attorneyId));
    if (sent === 1)
      await this.redis.expire(this.sentKey(attorneyId), 24 * 3600);
    if (sent > SEND_LIMIT_PER_DAY) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many codes today. Try tomorrow.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pending: Pending = { code, domain, email, attempts: 0 };
    await this.redis.set(
      this.key(attorneyId),
      JSON.stringify(pending),
      'EX',
      CODE_TTL_SEC,
    );
    const ru = locale.startsWith('ru');
    await this.email.sendEmail({
      to: email,
      subject: ru
        ? 'Код подтверждения фирмы — LawBid'
        : 'Your firm confirmation code — LawBid',
      text: ru
        ? `Код подтверждения адреса в вашей фирме: ${code}. Действует 15 минут. Если вы не запрашивали код, просто проигнорируйте письмо.`
        : `Your code to confirm your firm e-mail: ${code}. It expires in 15 minutes. If you did not ask for it, ignore this message.`,
      template: {
        key: 'trust_firm_email_code',
        vars: { code, domain },
        locale,
      },
    });
    this.logger.info({ attorneyId, domain }, 'Firm e-mail code sent');
    return { domain };
  }

  async confirm(attorneyId: string, code: string): Promise<{ domain: string }> {
    const raw = await this.redis.get(this.key(attorneyId));
    const pending = raw ? (JSON.parse(raw) as Pending) : null;
    if (!pending) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request a code first.',
        details: { field: 'code', reason: 'expired' },
      });
    }
    if (pending.code !== code.trim()) {
      pending.attempts += 1;
      if (pending.attempts >= ATTEMPTS_MAX) {
        await this.redis.del(this.key(attorneyId));
      } else {
        const ttl = await this.redis.ttl(this.key(attorneyId));
        await this.redis.set(
          this.key(attorneyId),
          JSON.stringify(pending),
          'EX',
          ttl > 0 ? ttl : CODE_TTL_SEC,
        );
      }
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Wrong code.',
        details: { field: 'code', reason: 'mismatch' },
      });
    }
    await this.redis.del(this.key(attorneyId));
    await this.trust.onFirmEmailConfirmed(attorneyId, pending.domain);
    return { domain: pending.domain };
  }

  private key(attorneyId: string): string {
    return `trust:firm-email:${attorneyId}`;
  }

  private sentKey(attorneyId: string): string {
    return `trust:firm-email:sent:${attorneyId}`;
  }
}
