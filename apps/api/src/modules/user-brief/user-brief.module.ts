import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { UserBriefService } from './user-brief.service';

@Module({
  imports: [FilesModule],
  providers: [UserBriefService],
  exports: [UserBriefService],
})
export class UserBriefModule {}
