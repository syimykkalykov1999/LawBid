import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FilesModule } from '../files/files.module';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';

/** Owner 2026-10-01 — Telegram-style stickers (chat wires them in). */
@Module({
  imports: [FilesModule, UsageLimitsModule],
  controllers: [StickersController],
  providers: [StickersService],
  exports: [StickersService],
})
export class StickersModule {}
