import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminContentModule } from '../admin-content/admin-content.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VideosModule } from '../videos/videos.module';
import { AdminMediaController } from './admin-media.controller';
import { AdminStickersService } from './admin-stickers.service';
import { AdminVideosService } from './admin-videos.service';

/** Audit 2026-10-02: admin control of reels (Bunny video assets) and
 * sticker packs — features the app had with no admin screen. */
@Module({
  imports: [
    AdminAccessModule,
    AdminContentModule,
    FilesModule,
    NotificationsModule,
    VideosModule,
  ],
  controllers: [AdminMediaController],
  providers: [AdminVideosService, AdminStickersService],
})
export class AdminMediaModule {}
