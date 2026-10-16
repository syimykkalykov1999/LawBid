import { Module } from '@nestjs/common';
import { PublicDirectoryController } from './public-directory.controller';
import { PublicDirectoryService } from './public-directory.service';

@Module({
  controllers: [PublicDirectoryController],
  providers: [PublicDirectoryService],
})
export class PublicDirectoryModule {}
