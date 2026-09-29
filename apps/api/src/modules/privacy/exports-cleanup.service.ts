import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../files/storage/s3-storage.service';

/** A queued/processing export older than this is considered lost. */
const STALE_AFTER_MS = 24 * 3600 * 1000;

/**
 * docs/06 §5.3 "очистка … просроченные экспорт-файлы": ready exports past
 * `expires_at` lose their S3 object (`files.deleted_at`) and become
 * `expired`; jobs stuck in queued/processing for a day are marked failed.
 */
@Injectable()
export class ExportsCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExportsCleanupService.name);
  }

  async run(
    now: Date = new Date(),
  ): Promise<{ expired: number; failed: number }> {
    const due = await this.prisma.dataExportJob.findMany({
      where: { status: 'ready', expires_at: { lt: now } },
      include: {
        file: { select: { id: true, s3_bucket: true, s3_key: true } },
      },
      take: 1000,
    });
    let expired = 0;
    for (const job of due) {
      if (job.file) {
        if (this.storage.configured) {
          await this.storage.remove(job.file.s3_bucket, [job.file.s3_key]);
        }
        await this.prisma.file.update({
          where: { id: job.file.id },
          data: { deleted_at: now },
        });
      }
      await this.prisma.dataExportJob.update({
        where: { id: job.id },
        data: { status: 'expired' },
      });
      expired += 1;
    }
    const { count: failed } = await this.prisma.dataExportJob.updateMany({
      where: {
        status: { in: ['queued', 'processing'] },
        created_at: { lt: new Date(now.getTime() - STALE_AFTER_MS) },
      },
      data: { status: 'failed', error: 'stale' },
    });
    if (expired || failed)
      this.logger.info({ expired, failed }, 'exports cleanup');
    return { expired, failed };
  }
}
