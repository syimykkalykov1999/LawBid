import { Global, Module } from '@nestjs/common';
import { VersionEtagService } from './version-etag.service';

/** Owner 2026-10-25 (S2-12): cheap version-stamp ETags for the controllers
 * of posts, cases, chats and notifications. */
@Global()
@Module({
  providers: [VersionEtagService],
  exports: [VersionEtagService],
})
export class VersionEtagModule {}
