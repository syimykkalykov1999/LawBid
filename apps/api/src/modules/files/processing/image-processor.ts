import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import decodeHeic from 'heic-decode';
import {
  AVATAR_MAIN_PX,
  AVATAR_VARIANT_PX,
  POST_IMAGE_MAIN_PX,
  POST_IMAGE_VARIANT_PX,
  FILE_MIME,
  IMAGE_MIMES,
  MAX_INPUT_PIXELS,
  type FileMime,
} from '../files.policy';

export interface ProcessedImage {
  data: Buffer;
  mime: FileMime;
  width: number;
  height: number;
  /** Owner 2026-10-25: the AVIF twin of the same pixels (when asked). */
  avif?: { data: Buffer; mime: 'image/avif'; width: number; height: number };
}

/** Encoder settings (Admin → settings `images.*`). `avif` null = no twins.
 * The defaults are the values used before AVIF existed. */
export interface ImageQuality {
  jpeg: number;
  webp: number;
  avif: { quality: number; effort: number } | null;
}

export const DEFAULT_IMAGE_QUALITY: ImageQuality = {
  jpeg: 90,
  webp: 88,
  avif: null,
};

const clamp = (n: unknown, lo: number, hi: number, d: number): number =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.min(hi, Math.max(lo, Math.round(n)))
    : d;

/** Reads `images.*` (bad values fall back to the defaults). */
export async function imageQuality(
  settings: AppSettingsService | undefined,
): Promise<ImageQuality> {
  if (!settings) return DEFAULT_IMAGE_QUALITY;
  try {
    const [on, avif, effort, webp, jpeg] = await Promise.all([
      settings.boolean('images.avif_enabled'),
      settings.number('images.avif_quality'),
      settings.number('images.avif_effort'),
      settings.number('images.webp_quality'),
      settings.number('images.jpeg_quality'),
    ]);
    return {
      jpeg: clamp(jpeg, 1, 100, 90),
      webp: clamp(webp, 1, 100, 88),
      avif: on
        ? { quality: clamp(avif, 1, 100, 60), effort: clamp(effort, 0, 9, 2) }
        : null,
    };
  } catch {
    return DEFAULT_IMAGE_QUALITY;
  }
}

/** The moment AVIF twins started (`images.avif_since`); null = serve none
 * (switch off, empty or unreadable). */
export async function avifSince(
  settings: AppSettingsService | undefined,
): Promise<Date | null> {
  if (!settings) return null;
  try {
    if (!(await settings.boolean('images.avif_enabled'))) return null;
    const raw = (await settings.string('images.avif_since')).trim();
    const d = raw ? new Date(raw) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

/** Owner 2026-10-05: what resized photos are written as
 * (`storage.image_format`). WebP is ≈30% smaller than JPEG at the same
 * look; every phone and browser LawBid supports shows it. */
export type ImageFormat = 'jpeg' | 'webp';

export interface ProcessedFile {
  /** Replaces the stored object (null = keep the upload as is). */
  main: ProcessedImage | null;
  /** Extra sized variants (px → image), stored next to the main object. */
  variants: Map<number, ProcessedImage>;
  /** Dimensions of what is stored (main or the untouched upload). */
  width: number | null;
  height: number | null;
}

/**
 * Server-side image work of the scan worker (sharp):
 * - HEIC → JPEG (docs/03 §2.2, docs/05 §3.2). Prebuilt sharp has no HEVC
 *   decoder (patents), so HEIC is decoded by libheif compiled to WASM
 *   (heic-decode) and re-encoded by sharp;
 * - avatar (docs/03 §4.1): EXIF orientation applied, square centre crop,
 *   1024 px JPEG plus a 256 px variant, all metadata (EXIF/GPS) stripped
 *   — sharp writes no metadata unless asked to.
 * - post photo (docs/05 §3.2): oriented, re-encoded JPEG ≤ 2048 px with
 *   320/1080 px variants — metadata (EXIF/GPS location!) stripped.
 * Other files (PDF, JPEG/PNG documents) are left as uploaded.
 * Every input is capped at MAX_INPUT_PIXELS (sharp `limitInputPixels`,
 * plus a header check where nothing is decoded); an oversized image is
 * rejected like an undecodable one (the scan job marks it `failed`).
 */
/** heic-decode's `all()` result; @types/heic-decode omits the header
 * dimensions and `dispose()` the library provides. */
type HeicImages = Array<{
  width: number;
  height: number;
  decode(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}> & { dispose(): void };

function assertPixels(width: number, height: number): void {
  if (width * height > MAX_INPUT_PIXELS) {
    throw new Error(
      `Image ${width}x${height} exceeds ${MAX_INPUT_PIXELS} input pixels`,
    );
  }
}

@Injectable()
export class ImageProcessor {
  async process(input: {
    data: Buffer;
    mime: FileMime;
    avatar: boolean;
    postImage?: boolean;
    format?: ImageFormat;
    quality?: ImageQuality;
  }): Promise<ProcessedFile> {
    const format = input.format ?? 'jpeg';
    const q = input.quality ?? DEFAULT_IMAGE_QUALITY;
    // Documents and audio are stored as uploaded (OQ-034/040/047).
    if (!IMAGE_MIMES.has(input.mime)) {
      return { main: null, variants: new Map(), width: null, height: null };
    }
    const source =
      input.mime === FILE_MIME.heic
        ? await this.heicToSharp(input.data)
        : sharp(input.data, {
            failOn: 'error',
            limitInputPixels: MAX_INPUT_PIXELS,
          });

    if (input.avatar) {
      // Decode + orient once, then crop each size from raw pixels.
      const oriented = await source
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const main = await this.square(oriented, AVATAR_MAIN_PX, format, q);
      const variants = new Map<number, ProcessedImage>();
      for (const px of AVATAR_VARIANT_PX) {
        variants.set(px, await this.square(oriented, px, format, q));
      }
      return { main, variants, width: main.width, height: main.height };
    }

    if (input.postImage) {
      const oriented = await source
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const main = await this.fitted(oriented, POST_IMAGE_MAIN_PX, format, q);
      const variants = new Map<number, ProcessedImage>();
      for (const px of POST_IMAGE_VARIANT_PX) {
        variants.set(px, await this.fitted(oriented, px, format, q));
      }
      return { main, variants, width: main.width, height: main.height };
    }

    if (input.mime === FILE_MIME.heic) {
      const { data, info } = await source
        .rotate()
        .jpeg({ quality: q.jpeg, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const main = {
        data,
        mime: FILE_MIME.jpeg,
        width: info.width,
        height: info.height,
      };
      return {
        main,
        variants: new Map(),
        width: main.width,
        height: main.height,
      };
    }

    const meta = await source.metadata();
    assertPixels(meta.width ?? 0, meta.height ?? 0);
    const swap = (meta.orientation ?? 1) >= 5;
    return {
      main: null,
      variants: new Map(),
      width: (swap ? meta.height : meta.width) ?? null,
      height: (swap ? meta.width : meta.height) ?? null,
    };
  }

  private async heicToSharp(data: Buffer): Promise<sharp.Sharp> {
    // `all` reads dimensions without decoding, so a HEIC bomb is refused
    // before libheif allocates its pixels.
    const images = (await decodeHeic.all({
      buffer: new Uint8Array(data),
    })) as HeicImages;
    try {
      const first = images[0];
      assertPixels(first.width, first.height);
      const img = await first.decode();
      return sharp(
        Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength),
        {
          raw: { width: img.width, height: img.height, channels: 4 },
          limitInputPixels: MAX_INPUT_PIXELS,
        },
      );
    } finally {
      images.dispose();
    }
  }

  /** Long side ≤ [px], aspect kept, never upscaled, JPEG or WebP, no
   * metadata. */
  private async fitted(
    raw: { data: Buffer; info: sharp.OutputInfo },
    px: number,
    format: ImageFormat,
    q: ImageQuality,
  ): Promise<ProcessedImage> {
    const { width, height, channels } = raw.info;
    const out = sharp(raw.data, {
      raw: { width, height, channels },
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .resize(px, px, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' });
    return this.encode(out, format, q);
  }

  private async square(
    raw: { data: Buffer; info: sharp.OutputInfo },
    px: number,
    format: ImageFormat,
    q: ImageQuality,
  ): Promise<ProcessedImage> {
    const { width, height, channels } = raw.info;
    const side = Math.min(px, width, height);
    const out = sharp(raw.data, {
      raw: { width, height, channels },
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .resize(side, side, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' });
    return this.encode(out, format, q);
  }

  /** JPEG (mozjpeg) or WebP at the admin quality (defaults 90 / 88 — the
   * same look as before) and, when asked, the AVIF twin of the same
   * pixels. sharp writes no metadata (EXIF/GPS) unless asked to. */
  private async encode(
    img: sharp.Sharp,
    format: ImageFormat,
    q: ImageQuality,
  ): Promise<ProcessedImage> {
    const avifPipe = q.avif ? img.clone() : null;
    const out =
      format === 'webp'
        ? await img
            .webp({ quality: q.webp, effort: 4 })
            .toBuffer({ resolveWithObject: true })
        : await img
            .jpeg({ quality: q.jpeg, mozjpeg: true })
            .toBuffer({ resolveWithObject: true });
    const result: ProcessedImage = {
      data: out.data,
      mime: format === 'webp' ? FILE_MIME.webp : FILE_MIME.jpeg,
      width: out.info.width,
      height: out.info.height,
    };
    if (avifPipe && q.avif) {
      const a = await avifPipe
        .avif({ quality: q.avif.quality, effort: q.avif.effort })
        .toBuffer({ resolveWithObject: true });
      // Never keep an AVIF that is not smaller than what it twins.
      if (a.data.length < out.data.length) {
        result.avif = {
          data: a.data,
          mime: 'image/avif',
          width: a.info.width,
          height: a.info.height,
        };
      }
    }
    return result;
  }
}
