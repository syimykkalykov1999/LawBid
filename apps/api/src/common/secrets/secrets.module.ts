import { Global, Module } from '@nestjs/common';
import { MessageBodyCipher } from './message-body-cipher';
import { MessageSearchIndex } from './message-search-index';
import { SecretsService } from './secrets.service';

/** Owner 2026-10-01: API keys managed in the admin (global); chat
 * message encryption at rest (scaling TZ point 11) and its blind search
 * index (BUG-1, package N-12b). */
@Global()
@Module({
  providers: [SecretsService, MessageBodyCipher, MessageSearchIndex],
  exports: [SecretsService, MessageBodyCipher, MessageSearchIndex],
})
export class SecretsModule {}
