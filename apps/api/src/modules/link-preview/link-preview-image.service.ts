import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { FilesService } from '../files/files.service';
import { S3StorageService } from '../files/files.public';
import { safeFetchImage, type SafeFetchOptions } from './safe-fetch';

/** Storage prefix of the re-hosted pictures (public media bucket). */
export const LINK_PREVIEW_IMAGE_PREFIX = 'link-preview/';
/** Same cap as the scan worker's sharp calls (decompression bombs). */
const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 80;

export type ImageFetcher = typeof safeFetchImage;

/**
 * Media batch A (R7, audit 13.11): the picture of a link card used to load
 * straight from the third-party site, so every reader's IP reached it and
 * the size was uncapped. Like Telegram (which re-hosts preview pictures),
 * the server now fetches the `og:image` once through the SSRF-safe fetch,
 * makes a WebP at most `chat.link_preview_image_px` (600) on its long side
 * with sharp, stores it in the public media bucket (R2 when on) under
 * `link-preview/<sha256 of the image URL>.webp` and the card carries OUR
 * link. Anything that goes wrong means a card without a picture — the
 * third-party URL is never handed to the app.
 *
 * Admin settings (Система → Настройки, `chat.*`): `link_preview_images`
 * (off = no pictures at all), `link_preview_image_max_kb` (download cap),
 * `link_preview_image_timeout_ms`, `link_preview_image_px`.
 */
@Injectable()
export class LinkPreviewImageService {
  private readonly log = new Logger(LinkPreviewImageService.name);

  constructor(
    private readonly settings: AppSettingsService,
    private readonly storage: S3StorageService,
    private readonly files: FilesService,
  ) {}

  /** Test hook (the SSRF-safe image fetch). */
  fetchImage: ImageFetcher = safeFetchImage;

  /** Our link for [imageUrl], or null (no picture on the card). */
  async rehost(
    imageUrl: string,
    opts: Pick<SafeFetchOptions, 'allowLocal' | 'isDenied'>,
  ): Promise<string | null> {
    try {
      if (!(await this.settings.boolean('chat.link_preview_images'))) {
        return null;
      }
      const [maxKb, timeoutMs, px] = await Promise.all([
        this.settings.number('chat.link_preview_image_max_kb'),
        this.settings.number('chat.link_preview_image_timeout_ms'),
        this.settings.number('chat.link_preview_image_px'),
      ]);
      const bucket = await this.storage.resolveBucket('media');
      const key = `${LINK_PREVIEW_IMAGE_PREFIX}${createHash('sha256')
        .update(`${px}:${imageUrl}`)
        .digest('hex')}.webp`;
      // Already stored by an earlier card (any chat): no second download.
      if (!(await this.storage.head(bucket, key))) {
        const got = await this.fetchImage(imageUrl, {
          ...opts,
          maxBytes: Math.max(1, maxKb) * 1024,
          timeoutMs: Math.max(500, timeoutMs),
        });
        const webp = await sharp(got.body, {
          limitInputPixels: MAX_INPUT_PIXELS,
          failOn: 'error',
        })
          .rotate()
          .resize({
            width: px,
            height: px,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        await this.storage.put(bucket, key, webp, 'image/webp');
      }
      return await this.files.publicMediaLink(bucket, key);
    } catch (e) {
      this.log.debug(
        `link preview picture skipped (${e instanceof Error ? e.message : String(e)})`,
      );
      return null;
    }
  }
}
