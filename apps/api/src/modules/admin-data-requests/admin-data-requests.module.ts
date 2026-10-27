import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { AdminDataRequestsController } from './admin-data-requests.controller';
import { AdminDataRequestsService } from './admin-data-requests.service';
import { AdminLegalExportController } from './legal-export.controller';
import { LegalExportService } from './legal-export.service';
import { LegalExportsCoreModule } from './legal-exports-core.module';
import { LegalRequestService } from './legal-request.service';
import { LegalLookupService } from './legal-lookup.service';

/** docs/06 §2.3 item 11, §5.4 (stage 6.5): government data requests, plus
 * (owner 2026-10-20) account lookup, evidence archives and legal holds. */
@Module({
  imports: [AdminAccessModule, AuthModule, LegalExportsCoreModule],
  controllers: [AdminDataRequestsController, AdminLegalExportController],
  providers: [
    AdminDataRequestsService,
    LegalLookupService,
    LegalExportService,
    LegalRequestService,
  ],
})
export class AdminDataRequestsModule {}
