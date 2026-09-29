import { Global, Module } from '@nestjs/common';
import {
  AllowAllModerationHook,
  CONTENT_MODERATION_HOOK,
} from './content-moderation.hook';

/** docs/05 §12: moderation connection points only (process = docs/06). */
@Global()
@Module({
  providers: [
    { provide: CONTENT_MODERATION_HOOK, useClass: AllowAllModerationHook },
  ],
  exports: [CONTENT_MODERATION_HOOK],
})
export class ModerationModule {}
