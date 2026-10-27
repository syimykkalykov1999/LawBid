import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { AdminComplianceController } from './admin-compliance.controller';
import { AdminComplianceService } from './admin-compliance.service';
import { ComplianceCoreModule } from './compliance-core.module';
import { ComplianceController } from './compliance.controller';
import { SesWebhookController } from './ses-webhook.controller';
import { SesWebhookService } from './ses-webhook.service';
import { TwilioInboundController } from './twilio-inbound.controller';

/** The HTTP side: webhooks (Twilio inbound, SES via SNS), the app's
 * age-gate / consent endpoints and the admin's minors tool. */
@Module({
  imports: [ComplianceCoreModule, AuthModule, AdminAccessModule],
  controllers: [
    ComplianceController,
    TwilioInboundController,
    SesWebhookController,
    AdminComplianceController,
  ],
  providers: [AdminComplianceService, SesWebhookService],
})
export class ComplianceModule {}
