import { FilePurpose } from '@prisma/client';

/** MIME types the upload pipeline understands (docs/03 §2.2, §4.1;
 * docs/05 §3.2). HEIC is converted to JPEG by the scan worker. */
export const FILE_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  pdf: 'application/pdf',
  // Owner 2026-09-30 (OQ-034): Word documents attached to a case.
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
export type FileMime = (typeof FILE_MIME)[keyof typeof FILE_MIME];
export const ALL_FILE_MIMES: readonly FileMime[] = Object.values(FILE_MIME);

export type BucketKind = 'documents' | 'media';

export interface PurposeRule {
  readonly mimes: readonly FileMime[];
  /** app_config key holding the size limit in MB (docs/03 §9). */
  readonly sizeSetting: 'files.max_size_mb' | 'files.avatar_max_size_mb';
  /** Verification files live in the documents bucket (docs/02 §1.6),
   * avatars and post photos in the media bucket (docs/06 §6). */
  readonly bucket: BucketKind;
}

const IMAGES: readonly FileMime[] = [
  FILE_MIME.jpeg,
  FILE_MIME.png,
  FILE_MIME.heic,
];

/**
 * Per-purpose rules:
 * - avatar: JPEG/PNG/HEIC up to files.avatar_max_size_mb (docs/03 §4.1);
 * - post_image: JPEG/PNG/HEIC up to 10 MB (docs/05 §3.2 = files.max_size_mb);
 * - verification_document: JPEG/PNG/HEIC/PDF (PDF for licenses) up to
 *   files.max_size_mb (docs/03 §2.2);
 * - verification_selfie: camera photo, JPEG/PNG/HEIC.
 */
export const PURPOSE_RULES: Record<FilePurpose, PurposeRule> = {
  avatar: {
    mimes: IMAGES,
    sizeSetting: 'files.avatar_max_size_mb',
    bucket: 'media',
  },
  post_image: {
    mimes: IMAGES,
    sizeSetting: 'files.max_size_mb',
    bucket: 'media',
  },
  // OQ-031: private (documents bucket, short signed links, never the CDN).
  case_photo: {
    mimes: IMAGES,
    sizeSetting: 'files.max_size_mb',
    bucket: 'documents',
  },
  // OQ-034: case documents — photos, PDF, Word; private like case photos
  // (only the owner and the attorney whose bid was accepted open them).
  case_attachment: {
    mimes: [...IMAGES, FILE_MIME.pdf, FILE_MIME.docx],
    sizeSetting: 'files.max_size_mb',
    bucket: 'documents',
  },
  verification_document: {
    mimes: [...IMAGES, FILE_MIME.pdf],
    sizeSetting: 'files.max_size_mb',
    bucket: 'documents',
  },
  verification_selfie: {
    mimes: IMAGES,
    sizeSetting: 'files.max_size_mb',
    bucket: 'documents',
  },
  // docs/05 §3.6: prepared, off behind the `video_posts` flag (presign
  // answers FEATURE_DISABLED). Video MIME types and transcoding arrive
  // when the flag is turned on.
  post_video: {
    mimes: [],
    sizeSetting: 'files.max_size_mb',
    bucket: 'media',
  },
  // docs/06 §5.2: written by the data-export worker only; never presigned
  // (no MIME is accepted for upload).
  data_export: {
    mimes: [],
    sizeSetting: 'files.max_size_mb',
    bucket: 'documents',
  },
};

export const MB = 1024 * 1024;

/** docs/03 §2.2: the pre-signed upload link lives 5 minutes. */
export const PRESIGN_TTL_SEC = 300;

/** How long a presigned upload may wait for POST /files/:id/confirm. */
export const UPLOAD_INTENT_TTL_SEC = 60 * 60;

/** Signed GET links for avatars/post photos (media bucket). §9 has no key
 * for media; documents use verification.signed_url_ttl_sec. */
export const MEDIA_SIGNED_URL_TTL_SEC = 60 * 60;

/** Avatar output (docs/03 §4.1: square, "сжатие до 1024 px"): the main
 * object is 1024 px; smaller variants are stored next to it. */
export const AVATAR_MAIN_PX = 1024;
export const AVATAR_VARIANT_PX: readonly number[] = [256];

/** docs/05 §3.2 post photos: stored main ≤ 2048 px on the long side (the
 * app already downscales), variants 320 px (preview) and 1080 px (medium). */
export const POST_IMAGE_MAIN_PX = 2048;
export const POST_IMAGE_VARIANT_PX: readonly number[] = [320, 1080];

/** Decompression-bomb guard for the scan worker: images above this many
 * pixels (width × height) are refused before decoding. 40 MP covers any
 * phone photo or document scan (≈160 MB as raw RGBA). */
export const MAX_INPUT_PIXELS = 40_000_000;

/** `<key>_w256` — never `<key>/256`: MinIO forbids an object whose name
 * is a "directory" prefix of another object. */
export function variantKey(key: string, px: number): string {
  return `${key}_w${px}`;
}

export function isImageMime(mime: string): boolean {
  return (IMAGES as readonly string[]).includes(mime);
}
