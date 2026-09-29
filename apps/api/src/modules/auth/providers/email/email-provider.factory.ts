import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppEnv } from '../../../../config/env.schema';
import { resolveEmailProvider } from '../../../../config/provider-selection';
import type { EmailProvider } from './email-provider.interface';
import { MockEmailProvider } from './mock-email.provider';
import { SesEmailProvider } from './ses-email.provider';

/** SES when configured, else the mock (docs/KEYS_SETUP.md). Shared by the
 * auth emails and the system notification emails (docs/05 §9.5). */
export function createEmailProvider(
  config: ConfigService,
  logger: PinoLogger,
): EmailProvider {
  const { provider, missing } = resolveEmailProvider({
    NODE_ENV: config.getOrThrow<AppEnv['NODE_ENV']>('NODE_ENV'),
    EMAIL_PROVIDER:
      config.getOrThrow<AppEnv['EMAIL_PROVIDER']>('EMAIL_PROVIDER'),
    SES_REGION: config.get<string>('SES_REGION'),
    SES_FROM_ADDRESS: config.get<string>('SES_FROM_ADDRESS'),
  });
  logger.info({ provider, missing }, 'Email provider selected');
  return provider === 'ses'
    ? new SesEmailProvider(config, logger)
    : new MockEmailProvider(config, logger);
}
