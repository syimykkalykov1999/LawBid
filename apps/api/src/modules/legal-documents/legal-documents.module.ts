import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminLegalDocumentsController } from './admin-legal-documents.controller';
import { LegalAcceptanceModule } from './legal-acceptance.module';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsSeed } from './legal-documents.seed';
import { LegalDocumentsService } from './legal-documents.service';

/** Owner 2026-10-05: all legal documents — drafts, versions, rollback,
 * the public texts and the acceptance of them. */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, LegalAcceptanceModule],
  controllers: [LegalDocumentsController, AdminLegalDocumentsController],
  providers: [LegalDocumentsService, LegalDocumentsSeed],
  exports: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
