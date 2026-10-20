import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsCoreModule } from './consultations-core.module';

/** Owner 2026-10-20: booking a consultation. */
@Module({
  imports: [ConsultationsCoreModule],
  controllers: [ConsultationsController],
})
export class ConsultationsModule {}
