import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminDataRequestsController } from './admin-data-requests.controller';
import { AdminDataRequestsService } from './admin-data-requests.service';

/** docs/06 §2.3 item 11, §5.4 (stage 6.5): government data requests. */
@Module({
  imports: [AdminAccessModule],
  controllers: [AdminDataRequestsController],
  providers: [AdminDataRequestsService],
})
export class AdminDataRequestsModule {}
