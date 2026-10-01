import { Global, Module } from '@nestjs/common';
import { SecretsService } from './secrets.service';

/** Owner 2026-10-01: API keys managed in the admin (global). */
@Global()
@Module({
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
