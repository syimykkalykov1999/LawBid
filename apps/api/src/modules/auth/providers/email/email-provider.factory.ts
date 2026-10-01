import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppEnv } from '../../../../config/env.schema';
import { resolveEmailProvider } from '../../../../config/provider-selection';
import type { EmailMessage, EmailProvider } from './email-provider.interface';
import type { SecretsService } from '../../../../common/secrets/secrets.service';
import { MockEmailProvider } from './mock-email.provider';
import { SesEmailProvider } from './ses-email.provider';

/**
 * SES when configured, else the mock (docs/KEYS_SETUP.md). Shared by the
 * auth emails and the system notification emails (docs/05 §9.5).
 * Owner 2026-10-01: the sender address / region can be changed in the
 * admin (Integrations → Email sender) — read at send time.
 */
export function createEmailProvider(
  config: ConfigService,
  logger: PinoLogger,
  secrets?: SecretsService,
): EmailProvider {
  const { provider, missing } = resolveEmailProvider({
    NODE_ENV: config.getOrThrow<AppEnv['NODE_ENV']>('NODE_ENV'),
    EMAIL_PROVIDER:
      config.getOrThrow<AppEnv['EMAIL_PROVIDER']>('EMAIL_PROVIDER'),
    SES_REGION: config.get<string>('SES_REGION'),
    SES_FROM_ADDRESS: config.get<string>('SES_FROM_ADDRESS'),
  });
  logger.info({ provider, missing }, 'Email provider selected at boot');
  return new DynamicEmailProvider(
    config,
    logger,
    new MockEmailProvider(config, logger),
    secrets,
  );
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
    const key = `${region}|${from}`;
    if (this.cached?.key !== key) {
      this.cached = {
        key,
        provider: new SesEmailProvider(
          { region, fromAddress: from },
          this.logger,
        ),
      };
    }
    return this.cached.provider.sendEmail(message);
  }
}
