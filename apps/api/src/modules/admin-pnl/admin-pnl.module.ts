import { Module } from '@nestjs/common';
import { PnlService } from '../../common/pnl/pnl.service';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminPnlController } from './admin-pnl.controller';

/** Owner 2026-10-25: Деньги → «Прибыль» (super admin only). */
@Module({
  imports: [AdminAccessModule],
  controllers: [AdminPnlController],
  providers: [PnlService],
  exports: [PnlService],
})
export class AdminPnlModule {}
