import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  CdnInvalidationQueue,
  type FlushResult,
} from '../../modules/files/storage/cdn-invalidation';
import {
  createCloudFrontInvalidationSender,
  type InvalidationSender,
} from '../../modules/files/storage/cloudfront-invalidation.client';
import { withJobLock } from './job-lock';

/** Test seam: replaces the signed CloudFront call. */
export const CDN_INVALIDATION_SENDER = Symbol('CDN_INVALIDATION_SENDER');

/**
 * Owner 2026-10-25 (caching round 2, S2-1): `cdn.invalidate`, every other
 * minute. Sends the queued wildcard paths of removed files to CloudFront in
 * one request per distribution (batching keeps the per-path bill and the
 * 15-wildcard-in-flight limit in check). Without a distribution id, or with
 * `cdn.invalidate_on_delete` off, it does nothing.
 */
@Injectable()
export class CdnInvalidateJob {
  private sender?: InvalidationSender;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional()
    @Inject(CDN_INVALIDATION_SENDER)
    sender?: InvalidationSender,
  ) {
    this.sender = sender;
    this.logger.setContext(CdnInvalidateJob.name);
  }

  run(): Promise<FlushResult | null> {
    return withJobLock(this.redis, 'cdn.invalidate', 90_000, () =>
      this.flush(),
    );
  }

  async flush(): Promise<FlushResult | null> {
    const media = this.config.get<string>('CLOUDFRONT_MEDIA_DISTRIBUTION_ID');
    const documents = this.config.get<string>(
      'CLOUDFRONT_PRIVATE_DISTRIBUTION_ID',
    );
    if (!media && !documents) return null;
    const mode = this.settings
      ? await this.settings.string('cdn.invalidate_on_delete')
      : 'auto';
    if (mode === 'off') return null;
    const batchMax = this.settings
      ? await this.settings.number('cdn.invalidate_batch_paths')
      : 500;
    const monthlyCap = this.settings
      ? await this.settings.number('cdn.invalidate_max_paths_month')
      : 5000;
    // «Авто»: the daily ceiling applies; «Вкл»: only the monthly one.
    const dailyCap =
      mode === 'auto' && this.settings
        ? await this.settings.number('cdn.invalidate_max_paths_day')
        : 0;
    this.sender ??= createCloudFrontInvalidationSender();
    const queue = new CdnInvalidationQueue(this.redis);
    const res = await queue.flush(
      this.sender,
      {
        distributions: { media, documents },
        batchMax,
        monthlyCap,
        dailyCap,
      },
      (err, target) =>
        this.logger.warn({ err, target }, 'CloudFront invalidation failed'),
    );
    if (res.dropped > 0) {
      this.logger.warn(
        { alert: 'cdn_invalidation_cap', dropped: res.dropped, monthlyCap },
        'CloudFront invalidation cap reached; paths dropped (edge copies expire by TTL)',
      );
    }
    if (res.paths > 0) this.logger.info(res, 'CloudFront invalidation sent');
    return res;
  }
}
