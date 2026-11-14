import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
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

/**
 * CPU cores this process may really use: the container's quota (cgroup v2
 * `cpu.max`, v1 `cpu.cfs_quota_us` / `cpu.cfs_period_us` — what ECS Fargate
 * sets from the task's `cpu`), else the cores Node sees. A 0.5 vCPU task
 * reports 0.5 here although the machine shows two cores.
 */
export function usableCores(
  read: (path: string) => string = (p) => readFileSync(p, 'utf8'),
  visible: () => number = availableParallelism,
): number {
  try {
    const [quota, period] = read('/sys/fs/cgroup/cpu.max').trim().split(/\s+/);
    if (quota !== 'max' && Number(period) > 0) {
      return Number(quota) / Number(period);
    }
  } catch {
    // not cgroup v2
  }
  try {
    const quota = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
    const period = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
    if (quota > 0 && period > 0) return quota / period;
  } catch {
    // no cgroup v1 quota either
  }
  return visible();
}

/**
 * Owner 2026-11-09 («фото обрабатываются долго»): the sizes of one picture
 * (and their AVIF twins) are encoded at once only where there are cores to
 * run them on. Measured: at once costs 15–35 % more CPU in total (09.11,
 * bench in the PR), so on a container under two cores it would be slower.
 */
let atOnceCache: boolean | undefined;
export function encodeAtOnce(): boolean {
  return (atOnceCache ??= usableCores() >= 2);
}

/**
 * Every size of one picture; a size whose output is the same as another's —
 * a 1000 px photo is 1000 px as «main» and as «1080» — is encoded only once
 * and shares its bytes. [outSide] is the long side a size really comes out
 * at (never upscaled). [atOnce]: all sizes in parallel (sharp pipelines that
 * share the decoded pixels), else one after another.
 */
async function sizesAtOnce(
  mainPx: number,
  variantPx: readonly number[],
  outSide: (px: number) => number,
  make: (px: number) => Promise<ProcessedImage>,
  atOnce: boolean,
): Promise<{ main: ProcessedImage; variants: Map<number, ProcessedImage> }> {
  const bySide = new Map<number, Promise<ProcessedImage>>();
  const once = async (px: number): Promise<ProcessedImage> => {
    const side = outSide(px);
    let job = bySide.get(side);
    if (!job) {
      job = make(px);
      bySide.set(side, job);
    }
    return job;
  };
  const all = [mainPx, ...variantPx];
  const done: ProcessedImage[] = [];
  if (atOnce) {
    done.push(...(await Promise.all(all.map(once))));
  } else {
    for (const px of all) done.push(await once(px));
  }
  const [main, ...rest] = done;
  const variants = new Map<number, ProcessedImage>();
  variantPx.forEach((px, i) => variants.set(px, rest[i]));
  return { main, variants };
}

@Injectable()
export class ImageProcessor {
  /** Encode the sizes at once (default: only with two cores or more;
   * tests set it). */
  atOnce: () => boolean = encodeAtOnce;

  async process(input: {
    data: Buffer;
    mime: FileMime;
    avatar: boolean;
    postImage?: boolean;
    format?: ImageFormat;
    quality?: ImageQuality;
    /** Owner row 106: a post / chat photo that is already small, upright,
     * JPEG or WebP and carries no EXIF / XMP / IPTC is stored as sent (only
     * the smaller sizes are made). `images.keep_small_originals`. */
    keepSmallOriginal?: boolean;
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
      const side = (px: number) =>
        Math.min(px, oriented.info.width, oriented.info.height);
      const { main, variants } = await sizesAtOnce(
        AVATAR_MAIN_PX,
        AVATAR_VARIANT_PX,
        side,
        (px) => this.square(oriented, px, format, q),
        this.atOnce(),
      );
      return { main, variants, width: main.width, height: main.height };
    }

    if (input.postImage) {
      const kept = input.keepSmallOriginal
        ? await this.keptOriginal(input.data, input.mime, source, format, q)
        : null;
      if (kept) return kept;
      const oriented = await source
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const long = Math.max(oriented.info.width, oriented.info.height);
      const { main, variants } = await sizesAtOnce(
        POST_IMAGE_MAIN_PX,
        POST_IMAGE_VARIANT_PX,
        (px) => Math.min(px, long),
        (px) => this.fitted(oriented, px, format, q),
        this.atOnce(),
      );
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

  /**
   * Owner row 106 (media audit 13.11, batch F item 14): the app already
   * sends chat photos as 1600 px JPEG and post photos at ≤ 2048 px.
   * Encoding such a photo again costs worker CPU and a second generation
   * of JPEG/WebP loss, and its bytes do not get much smaller. Kept as is
   * only when nothing would change but the encoder: no rotation, no
   * metadata to strip (GPS!), no transparency to flatten, not over the main
   * size. The smaller sizes (and the AVIF twins) are made as before.
   * Null: the usual full processing.
   */
  private async keptOriginal(
    data: Buffer,
    mime: FileMime,
    source: sharp.Sharp,
    format: ImageFormat,
    q: ImageQuality,
  ): Promise<ProcessedFile | null> {
    if (mime !== FILE_MIME.jpeg && mime !== FILE_MIME.webp) return null;
    const meta = await source.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    assertPixels(width, height);
    const long = Math.max(width, height);
    if (
      long === 0 ||
      long > POST_IMAGE_MAIN_PX ||
      (meta.orientation ?? 1) !== 1 ||
      meta.exif !== undefined ||
      meta.xmp !== undefined ||
      meta.iptc !== undefined ||
      meta.hasAlpha === true ||
      (meta.pages ?? 1) > 1
    ) {
      return null;
    }
    const main: ProcessedImage = { data, mime, width, height };
    const raw = await source
      .clone()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (q.avif) {
      const twin = await sharp(raw.data, {
        raw: {
          width: raw.info.width,
          height: raw.info.height,
          channels: raw.info.channels,
        },
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .avif({ quality: q.avif.quality, effort: q.avif.effort })
        .toBuffer({ resolveWithObject: true });
      if (twin.data.length < data.length) {
        main.avif = {
          data: twin.data,
          mime: 'image/avif',
          width: twin.info.width,
          height: twin.info.height,
        };
      }
    }
    const variants = new Map<number, ProcessedImage>();
    const smaller = POST_IMAGE_VARIANT_PX.filter((px) => px < long);
    const made = this.atOnce()
      ? await Promise.all(smaller.map((px) => this.fitted(raw, px, format, q)))
      : await smaller.reduce<Promise<ProcessedImage[]>>(
          async (acc, px) => [
            ...(await acc),
            await this.fitted(raw, px, format, q),
          ],
          Promise.resolve([]),
        );
    smaller.forEach((px, i) => variants.set(px, made[i]));
    // A size the photo does not reach is the photo itself, as before.
    for (const px of POST_IMAGE_VARIANT_PX) {
      if (!variants.has(px)) variants.set(px, main);
    }
    return { main, variants, width, height };
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
    // Owner 2026-11-09: with cores to spare the AVIF twin is encoded at the
    // same time as the WebP/JPEG (sharp's clone() of one pipeline).
    const avifPipe = q.avif ? img.clone() : null;
    const encodeAvif = () =>
      avifPipe!
        .avif({ quality: q.avif!.quality, effort: q.avif!.effort })
        .toBuffer({ resolveWithObject: true });
    const avifEarly = avifPipe && this.atOnce() ? encodeAvif() : null;
    // Never left unobserved while the main encode is awaited.
    avifEarly?.catch(() => undefined);
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
    if (avifPipe) {
      const a = await (avifEarly ?? encodeAvif());
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
