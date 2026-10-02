import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { AdminSanctionsController } from './admin-sanctions.controller';
import { AdminSanctionsService } from './admin-sanctions.service';

/** Owner 2026-10-02: "Санкции" — blocks and bans (user, phone, e-mail, device). */
@Module({
  imports: [AdminAccessModule, AuthModule],
  controllers: [AdminSanctionsController],
  providers: [AdminSanctionsService],
})
export class AdminSanctionsModule {}
