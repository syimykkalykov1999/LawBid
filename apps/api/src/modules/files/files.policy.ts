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
  // Owner 2026-09-30 (OQ-040): voice messages — AAC in an MPEG-4 (.m4a)
  // container, what the app records on iOS and Android.
  m4a: 'audio/mp4',
  // Voice messages recorded in a browser (MediaRecorder): Opus in a WebM
  // container (Chrome, Firefox). Safari records audio/mp4 (the m4a type).
  // Accepted for chat_voice only.
  webm: 'audio/webm',
  // Owner 2026-09-30 (OQ-047): chat attachments after acceptance — every
  // common photo and office format.
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
} as const;
export type FileMime = (typeof FILE_MIME)[keyof typeof FILE_MIME];
export const ALL_FILE_MIMES: readonly FileMime[] = Object.values(FILE_MIME);

export type BucketKind = 'documents' | 'media';

export interface PurposeRule {
  readonly mimes: readonly FileMime[];
  /** app_config key holding the size limit in MB (docs/03 §9). None for
   * the purposes of upload-limits.ts (their MB come from there). */
  readonly sizeSetting?:
    | 'files.max_size_mb'
    | 'files.sticker_max_size_mb'
    | 'files.document_template_max_size_mb';
  /** Verification files live in the documents bucket (docs/02 §1.6),
   * avatars and post photos in the media bucket (docs/06 §6). */
  readonly bucket: BucketKind;
}

const IMAGES: readonly FileMime[] = [
  FILE_MIME.jpeg,
  FILE_MIME.png,
  FILE_MIME.heic,
  // Owner 2026-10-07 (bug 17): may be turned on in «Загрузки и файлы».
  FILE_MIME.webp,
];

/** Every document format (the admin picks which are on, bug 17). */
const DOCS: readonly FileMime[] = [
  FILE_MIME.pdf,
  FILE_MIME.doc,
  FILE_MIME.docx,
  FILE_MIME.xls,
  FILE_MIME.xlsx,
  FILE_MIME.ppt,
  FILE_MIME.pptx,
  FILE_MIME.odt,
  FILE_MIME.ods,
  FILE_MIME.odp,
  FILE_MIME.rtf,
  FILE_MIME.txt,
  FILE_MIME.csv,
];

/**
 * Per-purpose rules. `mimes` is the widest safe set of a purpose; for the
 * places of upload-limits.ts the admin's format choice narrows it.
 * - avatar: photos (docs/03 §4.1);
 * - post_image: photos (docs/05 §3.2);
 * - verification_document: photos and PDF (PDF for licenses, docs/03 §2.2);
 * - verification_selfie: camera photo.
 */
export const PURPOSE_RULES: Record<FilePurpose, PurposeRule> = {
  avatar: {
    mimes: IMAGES,
    bucket: 'media',
  },
  post_image: {
    mimes: IMAGES,
    bucket: 'media',
  },
  // Owner 2026-10-01: sticker images — PNG/WebP with transparency, kept
  // as uploaded (the app sends ≤512 px), public like post photos.
  sticker: {
    mimes: [FILE_MIME.png, FILE_MIME.webp, FILE_MIME.jpeg, FILE_MIME.gif],
    sizeSetting: 'files.sticker_max_size_mb',
    bucket: 'media',
  },
  // Owner 2026-10-01: photos in reviews — public like post photos.
  review_photo: {
    mimes: IMAGES,
    bucket: 'media',
  },
  // OQ-031: private (documents bucket, short signed links, never the CDN).
  case_photo: {
    mimes: IMAGES,
    bucket: 'documents',
  },
  // OQ-034: case documents — photos, PDF, Word; private like case photos
  // (only the owner and the attorney whose bid was accepted open them).
  case_attachment: {
    mimes: [...IMAGES, ...DOCS],
    bucket: 'documents',
  },
  // OQ-047: photos and documents in a chat once the bid is accepted;
  // private.
  chat_attachment: {
    mimes: [...IMAGES, FILE_MIME.gif, ...DOCS],
    bucket: 'documents',
  },
  // OQ-048: documents an assistant attaches to a task (same formats).
  task_attachment: {
    mimes: [...IMAGES, FILE_MIME.gif, ...DOCS],
    bucket: 'documents',
  },
  // Owner 2026-10-05: documents in a post or a reel's inner page — PDF,
  // Word and plain text. Private bucket with short signed links (the
  // post's viewers get one).
  post_attachment: {
    mimes: DOCS,
    bucket: 'documents',
  },
  // Owner 2026-10-05: a document template (PDF, Word) the admin
  // publishes; private bucket, short signed links on download.
  document_template: {
    mimes: [FILE_MIME.pdf, FILE_MIME.docx, FILE_MIME.doc],
    sizeSetting: 'files.document_template_max_size_mb',
    bucket: 'documents',
  },
  // OQ-040: voice messages; private (only the two chat members get a
  // short signed link). AAC/MPEG-4 from the app (and Safari), Opus/WebM
  // from Chrome/Firefox. Stored as uploaded — there is no server-side
  // transcoding, so iOS (AVPlayer) cannot play a WebM note.
  chat_voice: {
    mimes: [FILE_MIME.m4a, FILE_MIME.webm],
    sizeSetting: 'files.max_size_mb',
    bucket: 'documents',
  },
  verification_document: {
    mimes: [...IMAGES, FILE_MIME.pdf],
    bucket: 'documents',
  },
  verification_selfie: {
    mimes: IMAGES,
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
  return IMAGE_MIMES.has(mime);
}

/** Images among the allowed types (previews are made for these). */
export const IMAGE_MIMES: ReadonlySet<string> = new Set([
  FILE_MIME.jpeg,
  FILE_MIME.png,
  FILE_MIME.heic,
  FILE_MIME.webp,
  FILE_MIME.gif,
]);

/** Every variant size the scan worker ever stores next to an object —
 * removing a file removes these too (`<key>_w256`, `_w320`, `_w1080`). */
export const ALL_VARIANT_PX: readonly number[] = [
  ...new Set([...AVATAR_VARIANT_PX, ...POST_IMAGE_VARIANT_PX]),
];

/**
 * Owner 2026-10-05 (storage like Telegram): files that end up as the same
 * stored object for the same bytes. An identical upload of a purpose in
 * the same group and bucket reuses the stored object instead of keeping a
 * second copy (FileScanProcessor). Identity documents, data exports and
 * video are never shared.
 * - avatar: square 1024 px + 256 px;
 * - fitted: photos shrunk to 2048 px with 320 / 1080 px previews
 *   (documents in these purposes pass through unchanged);
 * - raw: stored as uploaded.
 */
export type DedupProfile = 'avatar' | 'fitted' | 'raw';
export const DEDUP_PROFILE: Partial<Record<FilePurpose, DedupProfile>> = {
  avatar: 'avatar',
  post_image: 'fitted',
  review_photo: 'fitted',
  case_photo: 'fitted',
  case_attachment: 'fitted',
  chat_attachment: 'fitted',
  sticker: 'raw',
  post_attachment: 'raw',
  document_template: 'raw',
  chat_voice: 'raw',
  task_attachment: 'raw',
};

/** Purposes sharing [profile] (the dedup lookup searches all of them). */
export function purposesOfProfile(profile: DedupProfile): FilePurpose[] {
  return (Object.keys(DEDUP_PROFILE) as FilePurpose[]).filter(
    (p) => DEDUP_PROFILE[p] === profile,
  );
}

/** Purposes the orphan cleanup never touches: identity documents (kept
 * for the verification history), data exports (their own expiry job) and
 * video (Bunny's own sweep). */
export const CLEANUP_EXEMPT_PURPOSES: readonly FilePurpose[] = [
  'verification_document',
  'verification_selfie',
  'data_export',
  'post_video',
];
