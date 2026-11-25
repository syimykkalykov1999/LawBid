import { Module } from '@nestjs/common';
import { PnlService } from '../../common/pnl/pnl.service';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminPnlController } from './admin-pnl.controller';

/**
 * Holes re-check (25.11, item 17): provided ONCE, here. JobsModule used to
 * list this service again, so the API process ran a second instance (Nest:
 * a provider belongs to one module, others import it). JobsModule imports
 * this module; jobs.module.spec.ts fails on any copy.
 */
@Module({
  providers: [PnlService],
  exports: [PnlService],
})
export class PnlCoreModule {}

/** Owner 2026-10-25: Деньги → «Прибыль» (super admin only). */
@Module({
  imports: [PnlCoreModule, AdminAccessModule],
  controllers: [AdminPnlController],
  exports: [PnlCoreModule],
})
export class AdminPnlModule {}
