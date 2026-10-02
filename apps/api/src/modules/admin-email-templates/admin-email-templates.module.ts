import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { SecretsService } from '../../common/secrets/secrets.service';
import { AuthModule } from '../auth/auth.module';
import { createEmailProvider } from '../auth/providers/email/email-provider.factory';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import {
  ADMIN_TEMPLATE_EMAIL,
  AdminEmailTemplatesService,
} from './admin-email-templates.service';

/** Owner 2026-10-02: admin editor of the transactional emails. The test
 * send uses a provider WITHOUT the override hook (content is final). */
@Module({
  imports: [AuthModule],
  controllers: [AdminEmailTemplatesController],
  providers: [
    AdminEmailTemplatesService,
    {
      provide: ADMIN_TEMPLATE_EMAIL,
      inject: [ConfigService, PinoLogger, SecretsService],
      useFactory: createEmailProvider,
    },
  ],
})
export class AdminEmailTemplatesModule {}
