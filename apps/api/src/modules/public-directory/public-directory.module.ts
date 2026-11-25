import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PublicDirectoryController } from './public-directory.controller';
import { PublicDirectoryService } from './public-directory.service';

/**
 * Holes re-check (25.11, item 17): provided ONCE, here. JobsModule used to
 * list PublicDirectoryService again (`seo.generate`), so the API process ran a second instance (Nest:
 * a provider belongs to one module, others import it). JobsModule imports
 * this module; jobs.module.spec.ts fails on any copy.
 */
@Module({
  // S3StorageService (the public avatar domain), as before. FilesModule is
  // already in the worker's graph (ChatModule, PostsModule import it), so
  // the worker gains no controller from this.
  imports: [FilesModule],
  providers: [PublicDirectoryService],
  exports: [PublicDirectoryService],
})
export class PublicDirectoryCoreModule {}

@Module({
  imports: [PublicDirectoryCoreModule],
  controllers: [PublicDirectoryController],
  exports: [PublicDirectoryCoreModule],
})
export class PublicDirectoryModule {}
