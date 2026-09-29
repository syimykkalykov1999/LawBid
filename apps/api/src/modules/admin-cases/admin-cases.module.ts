import { Module } from '@nestjs/common';
import { AdminCasesController } from './admin-cases.controller';
import { AdminCasesService } from './admin-cases.service';

/** docs/06 §2.3 item 5 (stage 6.5): read side of the case queues. */
@Module({
  controllers: [AdminCasesController],
  providers: [AdminCasesService],
})
export class AdminCasesModule {}
