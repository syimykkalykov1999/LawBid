import { Module } from '@nestjs/common';
import { LegalAcceptanceModule } from '../legal-documents/legal-acceptance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FirmsController } from './firms.controller';
import { FirmsService } from './firms.service';

@Module({
  imports: [LegalAcceptanceModule, NotificationsModule],
  controllers: [FirmsController],
  providers: [FirmsService],
  exports: [FirmsService],
})
export class FirmsModule {}
