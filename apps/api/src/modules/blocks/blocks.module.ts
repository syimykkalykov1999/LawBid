import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

/** Owner decision 2026-09-29 (OQ-028): user blocks. Global so the chat,
 * follows, search and profile modules share one instance. */
@Module({
  imports: [FilesModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
