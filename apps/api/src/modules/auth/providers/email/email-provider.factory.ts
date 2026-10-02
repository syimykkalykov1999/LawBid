import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppEnv } from '../../../../config/env.schema';
import { resolveEmailProvider } from '../../../../config/provider-selection';
import type { EmailMessage, EmailProvider } from './email-provider.interface';
import type { SecretsService } from '../../../../common/secrets/secrets.service';
import { MockEmailProvider } from './mock-email.provider';
import { SesEmailProvider } from './ses-email.provider';
import type { PrismaService } from '../../../../prisma/prisma.service';
import {
  applyEmailTemplateOverride,
  type EmailTemplateLoader,
} from './email-template-overrides';

/**
 * SES when configured, else the mock (docs/KEYS_SETUP.md). Shared by the
 * auth emails and the system notification emails (docs/05 §9.5).
 * Owner 2026-10-01: the sender address / region can be changed in the
 * admin (Integrations → Email sender) — read at send time.
 * Owner 2026-10-02: with `prisma`, an enabled admin override of the
 * built-in template (`email_templates`, cached 60 s) is applied first;
 * any failure falls back to the built-in message.
 */
export function createEmailProvider(
  config: ConfigService,
  logger: PinoLogger,
  secrets?: SecretsService,
  prisma?: PrismaService,
): EmailProvider {
  const { provider, missing } = resolveEmailProvider({
    NODE_ENV: config.getOrThrow<AppEnv['NODE_ENV']>('NODE_ENV'),
    EMAIL_PROVIDER:
      config.getOrThrow<AppEnv['EMAIL_PROVIDER']>('EMAIL_PROVIDER'),
    SES_REGION: config.get<string>('SES_REGION'),
    SES_FROM_ADDRESS: config.get<string>('SES_FROM_ADDRESS'),
  });
  logger.info({ provider, missing }, 'Email provider selected at boot');
  const delivery = new DynamicEmailProvider(
    config,
    logger,
    new MockEmailProvider(config, logger),
    secrets,
  );
  if (!prisma) return delivery;
  return new TemplateOverrideEmailProvider(
    delivery,
    (key, locale) =>
      prisma.emailTemplate.findUnique({
        where: { key_locale: { key, locale } },
        select: {
          subject: true,
          text_body: true,
          html_body: true,
          enabled: true,
        },
      }),
    logger,
  );
}

/** Applies admin template overrides before delivering; never blocks a
 * message on an override problem (login codes must always go out). */
export class TemplateOverrideEmailProvider implements EmailProvider {
  constructor(
    private readonly inner: EmailProvider,
    private readonly loader: EmailTemplateLoader,
    private readonly logger: Pick<PinoLogger, 'warn'>,
  ) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    let out: EmailMessage = message;
    try {
      out = await applyEmailTemplateOverride(message, this.loader);
    } catch (error) {
      this.logger.warn(
        {
          templateKey: message.template?.key,
          err: error instanceof Error ? error.message : String(error),
        },
        'email template override failed; sending the built-in email',
      );
    }
    return this.inner.sendEmail({
      to: out.to,
      subject: out.subject,
      text: out.text,
      ...(out.html ? { html: out.html } : {}),
    });
  }
}

class DynamicEmailProvider implements EmailProvider {
  private cached?: { key: string; provider: SesEmailProvider };

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    private readonly mock: EmailProvider,
    private readonly secrets?: SecretsService,
  ) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    if (this.config.get<string>('EMAIL_PROVIDER') === 'mock') {
      return this.mock.sendEmail(message);
    }
    const f = (await this.secrets?.get('ses'))?.fields ?? {};
    const region = f.region ?? this.config.get<string>('SES_REGION');
    const from = f.fromAddress ?? this.config.get<string>('SES_FROM_ADDRESS');
    if (!region || !from) {
      const env = this.config.get<string>('NODE_ENV') ?? 'development';
      if (env === 'staging' || env === 'production') {
        this.logger.error({ alert: 'email_not_configured' }, 'SES missing');
        throw new Error('Email is not configured');
      }
      return this.mock.sendEmail(message);
    }
    // Audit 2026-10-02: keyed by a hash of the secret, not its length — a
    // rotated secret of the same length must rebuild the SES client.
    const secretHash = createHash('sha256')
      .update(f.secretAccessKey ?? '')
      .digest('hex')
      .slice(0, 16);
    const key = `${region}|${from}|${f.accessKeyId ?? ''}|${secretHash}`;
    if (this.cached?.key !== key) {
      this.cached = {
        key,
        provider: new SesEmailProvider(
          {
            region,
            fromAddress: from,
            accessKeyId: f.accessKeyId,
            secretAccessKey: f.secretAccessKey,
          },
          this.logger,
        ),
      };
    }
    return this.cached.provider.sendEmail(message);
  }
}
