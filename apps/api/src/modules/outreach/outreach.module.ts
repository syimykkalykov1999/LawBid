import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { SecretsService } from '../../common/secrets/secrets.service';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { createEmailProvider } from '../auth/providers/email/email-provider.factory';
import { PartnersCoreModule } from '../partners/partners.module';
import { AdminOutreachController } from './admin-outreach.controller';
import { AdminOutreachService } from './admin-outreach.service';
import { NyRegistrySource } from './ny-registry.source';
import { OutreachController } from './outreach.controller';
import { OUTREACH_EMAIL, OutreachService } from './outreach.service';

/** The outreach service alone — imported by ReferralsCoreModule (a lead
 * registers with the partner code) and PartnersCoreModule's consumers
 * (a commission accrues → the lead paid). */
@Module({
  imports: [AuthModule, PartnersCoreModule],
  providers: [
    OutreachService,
    {
      provide: OUTREACH_EMAIL,
      inject: [ConfigService, PinoLogger, SecretsService],
      useFactory: createEmailProvider,
    },
  ],
  exports: [OutreachService],
})
export class OutreachCoreModule {}

@Module({
  imports: [OutreachCoreModule, AdminAccessModule],
  controllers: [AdminOutreachController, OutreachController],
  providers: [AdminOutreachService, NyRegistrySource],
})
export class OutreachModule {}
