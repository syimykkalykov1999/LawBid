import { Module } from '@nestjs/common';
import { AgeGateService } from './age-gate.service';
import { EmailSuppressionService } from './email-suppression.service';
import { SmsComplianceService } from './sms-compliance.service';

/**
 * 2026-10-25 (legal register): the services other modules call. Needs only
 * Prisma and the app settings (both global), so AuthModule and the outreach
 * module can import it without a cycle (this file must not import AuthModule).
 */
@Module({
  providers: [AgeGateService, SmsComplianceService, EmailSuppressionService],
  exports: [AgeGateService, SmsComplianceService, EmailSuppressionService],
})
export class ComplianceCoreModule {}
