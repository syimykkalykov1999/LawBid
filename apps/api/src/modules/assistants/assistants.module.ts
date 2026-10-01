import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AssistantActivityInterceptor } from './assistant-activity.interceptor';
import { AuthModule } from '../auth/auth.module';
import { CaseCommentsModule } from '../case-comments/case-comments.module';
import { CommentsModule } from '../comments/comments.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostsModule } from '../posts/posts.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AssistantsController } from './assistants.controller';
import { AssistantsService } from './assistants.service';
import { TasksService } from './tasks.service';
import { BidDraftsController, BidDraftsService } from './bid-drafts';
import { AdminTeamsController, AdminTeamsService } from './admin-teams';
import { AdminAccessModule } from '../admin-access/admin-access.module';

/** Owner 2026-09-30 (OQ-048): attorney assistants. */
@Module({
  imports: [
    AdminAccessModule,
    AuthModule,
    SubscriptionsModule,
    NotificationsModule,
    FilesModule,
    PostsModule,
    CommentsModule,
    CaseCommentsModule,
    ProfilesModule,
  ],
  controllers: [
    AssistantsController,
    BidDraftsController,
    AdminTeamsController,
  ],
  providers: [
    AssistantsService,
    TasksService,
    BidDraftsService,
    AdminTeamsService,
    { provide: APP_INTERCEPTOR, useClass: AssistantActivityInterceptor },
  ],
  exports: [AssistantsService],
})
export class AssistantsModule {}
