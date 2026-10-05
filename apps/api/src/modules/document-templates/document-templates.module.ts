import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { AdminDocumentTemplatesController } from './admin-document-templates.controller';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentTemplatesService } from './document-templates.service';

/** Owner 2026-10-05 — document templates: admin library + app section. */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, FilesModule],
  controllers: [DocumentTemplatesController, AdminDocumentTemplatesController],
  providers: [DocumentTemplatesService],
})
export class DocumentTemplatesModule {}
