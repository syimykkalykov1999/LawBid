import { Module } from '@nestjs/common';
import { QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';

/** Owner 2026-11-02: quick replies for the chat composer. */
@Module({
  controllers: [QuickRepliesController],
  providers: [QuickRepliesService],
})
export class QuickRepliesModule {}
