import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import decodeHeic from 'heic-decode';
import {
  AVATAR_MAIN_PX,
  AVATAR_VARIANT_PX,
  POST_IMAGE_MAIN_PX,
  POST_IMAGE_VARIANT_PX,
  FILE_MIME,
  MAX_INPUT_PIXELS,
  type FileMime,
} from '../files.policy';

export interface ProcessedImage {
  data: Buffer;
  mime: FileMime;
  width: number;
  height: number;
}

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
  }): Promise<ProcessedFile> {
    if (input.mime === FILE_MIME.pdf || input.mime === FILE_MIME.docx) {
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
      const main = await this.square(oriented, AVATAR_MAIN_PX);
      const variants = new Map<number, ProcessedImage>();
      for (const px of AVATAR_VARIANT_PX) {
        variants.set(px, await this.square(oriented, px));
      }
      return { main, variants, width: main.width, height: main.height };
    }

    if (input.postImage) {
      const oriented = await source
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const main = await this.fitted(oriented, POST_IMAGE_MAIN_PX);
      const variants = new Map<number, ProcessedImage>();
      for (const px of POST_IMAGE_VARIANT_PX) {
        variants.set(px, await this.fitted(oriented, px));
      }
      return { main, variants, width: main.width, height: main.height };
    }

    if (input.mime === FILE_MIME.heic) {
      const { data, info } = await source
        .rotate()
        .jpeg({ quality: 90, mozjpeg: true })
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

  /** Long side ≤ [px], aspect kept, never upscaled, JPEG, no metadata. */
  private async fitted(
    raw: { data: Buffer; info: sharp.OutputInfo },
    px: number,
  ): Promise<ProcessedImage> {
    const { width, height, channels } = raw.info;
    const out = await sharp(raw.data, {
      raw: { width, height, channels },
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .resize(px, px, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      data: out.data,
      mime: FILE_MIME.jpeg,
      width: out.info.width,
      height: out.info.height,
    };
  }

  private async square(
    raw: { data: Buffer; info: sharp.OutputInfo },
    px: number,
  ): Promise<ProcessedImage> {
    const { width, height, channels } = raw.info;
    const side = Math.min(px, width, height);
    const out = await sharp(raw.data, {
      raw: { width, height, channels },
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .resize(side, side, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      data: out.data,
      mime: FILE_MIME.jpeg,
      width: out.info.width,
      height: out.info.height,
    };
  }
}
