import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../../admin-access/admin-access.module';
import { ChatSystemModule } from '../../chat/chat-system.module';
import { FilesModule } from '../../files/files.module';
import { JournalModule } from '../../journal/journal.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CasesModule } from '../cases.module';
import { CaseBillingController } from './case-billing.controller';
import { CaseBillingService } from './case-billing.service';
import {
  AdminFormTemplatesController,
  CaseDocumentsController,
} from './case-documents.controller';
import { CaseSigningController } from './case-signing.controller';
import { CaseSigningService } from './case-signing.service';
import { CaseToolsSweepModule } from './case-tools-sweep.module';
import { CaseToolsSupport } from './case-tools.support';
import { FormTemplatesService } from './form-templates.service';

/**
 * Owner 2026-10-20 — tools inside an accepted case: the attorney's time and
 * expenses with an invoice document, e-signature of a PDF by both sides,
 * documents built from the admin's templates. A module of its own so the
 * case workspace module stays as it was.
 */
@Module({
  imports: [
    CasesModule,
    FilesModule,
    JournalModule,
    NotificationsModule,
    ChatSystemModule,
    AdminAccessModule,
    CaseToolsSweepModule,
  ],
  controllers: [
    CaseBillingController,
    CaseSigningController,
    CaseDocumentsController,
    AdminFormTemplatesController,
  ],
  providers: [
    CaseToolsSupport,
    CaseBillingService,
    CaseSigningService,
    FormTemplatesService,
  ],
})
export class CaseToolsModule {}
