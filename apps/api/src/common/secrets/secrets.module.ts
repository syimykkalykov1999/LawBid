import { Global, Module } from '@nestjs/common';
import { MessageBodyCipher } from './message-body-cipher';
import { SecretsService } from './secrets.service';

/** Owner 2026-10-01: API keys managed in the admin (global); chat
 * message encryption at rest (scaling TZ point 11). */
@Global()
@Module({
  providers: [SecretsService, MessageBodyCipher],
  exports: [SecretsService, MessageBodyCipher],
})
export class SecretsModule {}
