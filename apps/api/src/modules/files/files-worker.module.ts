import { Module } from '@nestjs/common';
import { filesCoreProviders } from './files-core.providers';

/** The `files` queue worker inside the dedicated worker process
 * (src/worker.ts, docs/06 §6). Needs global Config/Prisma/Redis/Logger. */
@Module({ providers: filesCoreProviders({ mode: 'worker' }) })
export class FilesWorkerModule {}
