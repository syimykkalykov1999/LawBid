import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { S3StorageService } from './s3-storage.service';

/**
 * Dev/test convenience: creates the documents/media buckets in local MinIO
 * if they are missing (private — no policy is ever attached). Never runs
 * in staging/production, where buckets are Terraform-managed (docs/06 §6).
 */
@Injectable()
export class FilesBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly storage: S3StorageService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FilesBootstrapService.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    const env = this.config.get<string>('NODE_ENV');
    if ((env !== 'development' && env !== 'test') || !this.storage.configured) {
      return;
    }
    try {
      const created = await this.storage.ensureBuckets();
      if (created.length > 0) {
        this.logger.info({ created }, 'Created missing S3 buckets (dev/test)');
      }
    } catch (err) {
      // Never block dev boot on MinIO being down; uploads will fail visibly.
      this.logger.warn(
        { err },
        'Could not ensure S3 buckets (is MinIO running?)',
      );
    }
  }
}
