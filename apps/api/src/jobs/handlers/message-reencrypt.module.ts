import { Module } from '@nestjs/common';
import { MessageReencryptJob } from './message-reencrypt.job';

/**
 * Holes re-check (25.11, item 17): `messages.reencrypt` provided ONCE.
 * JobsModule runs it, AdminOpsModule reads / resets its Redis progress; both
 * listed the class, so the API process held two instances. Its dependencies
 * (Prisma, Redis, MessageBodyCipher, SecretsService, app settings, logger)
 * are global modules. jobs.module.spec.ts fails on a copy.
 */
@Module({
  providers: [MessageReencryptJob],
  exports: [MessageReencryptJob],
})
export class MessageReencryptJobModule {}
