import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PublicDirectoryController } from './public-directory.controller';
import { PublicDirectoryService } from './public-directory.service';

@Module({
  imports: [FilesModule],
  controllers: [PublicDirectoryController],
  providers: [PublicDirectoryService],
})
export class PublicDirectoryModule {}
