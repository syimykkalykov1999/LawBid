import { ConflictException } from '@nestjs/common';
import type { FilePurpose } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { FILE_MIME, type FileMime } from './files.policy';

/**
 * Owner 2026-10-07 (bug 17): every upload limit is set in the admin panel
 * (Система → «Загрузки и файлы»), per place: how many photos and
 * documents, MB per file, MB together, and which file formats. Stored as
 * one app_config value (`uploads.limits`), always read through
 * [sanitizeUploadLimits]: an admin moves the numbers only inside the hard
 * ceilings below and picks formats only from the SAFE list of each place.
 * Programs, scripts, archives and macro documents are in no list, so no
 * setting can ever let them in.
 */
export const UPLOAD_LIMITS_KEY = 'uploads.limits';

export const UPLOAD_PLACES = [
  'post',
  'reel',
  'case',
  'chat',
  'task',
  'review',
  'avatar',
  'verification',
  'client_badge',
] as const;
export type UploadPlace = (typeof UPLOAD_PLACES)[number];

/** Photo formats (shown and resized as pictures). */
export const PHOTO_FORMATS = ['jpeg', 'png', 'heic', 'webp', 'gif'] as const;
/** Document formats. Office files carrying macros are refused at upload
 * by the content check (docm / xlsm are not formats here at all). */
export const DOC_FORMATS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'txt',
  'csv',
] as const;
export type UploadFormat =
  (typeof PHOTO_FORMATS)[number] | (typeof DOC_FORMATS)[number];
export const ALL_UPLOAD_FORMATS: readonly UploadFormat[] = [
  ...PHOTO_FORMATS,
  ...DOC_FORMATS,
];

export const FORMAT_MIME: Record<UploadFormat, FileMime> = {
  jpeg: FILE_MIME.jpeg,
  png: FILE_MIME.png,
  heic: FILE_MIME.heic,
  webp: FILE_MIME.webp,
  gif: FILE_MIME.gif,
  pdf: FILE_MIME.pdf,
  doc: FILE_MIME.doc,
  docx: FILE_MIME.docx,
  xls: FILE_MIME.xls,
  xlsx: FILE_MIME.xlsx,
  ppt: FILE_MIME.ppt,
  pptx: FILE_MIME.pptx,
  odt: FILE_MIME.odt,
  ods: FILE_MIME.ods,
  odp: FILE_MIME.odp,
  rtf: FILE_MIME.rtf,
  txt: FILE_MIME.txt,
  csv: FILE_MIME.csv,
};

/** How a place counts files:
 * - split: photos and documents separately (posts, reels);
 * - combined: photos and documents together in one number;
 * - photos: photos only;
 * - none: one file at a time (chat message, profile photo). */
export type CountMode = 'split' | 'combined' | 'photos' | 'none';

export interface PlaceLimits {
  /** split / photos: photos per item (0 = not used here). */
  maxPhotos: number;
  /** split: documents per item; combined: photos and documents together. */
  maxFiles: number;
  /** MB per file (0 = set in another place). */
  fileMb: number;
  /** MB of all documents of one post / reel (split places only). */
  totalMb: number;
  formats: UploadFormat[];
}

export interface PlaceSpec {
  count: CountMode;
  /** Formats an admin may turn on here (the safe list of this place). */
  safeFormats: readonly UploadFormat[];
  /** Hard ceilings no setting can pass (0 = field not used here). */
  ceiling: { count: number; fileMb: number; totalMb: number };
  defaults: PlaceLimits;
}

const PHOTOS: readonly UploadFormat[] = ['jpeg', 'png', 'heic', 'webp'];
const POST_DEFAULT: UploadFormat[] = [
  'jpeg',
  'png',
  'heic',
  'pdf',
  'doc',
  'docx',
  'txt',
  'rtf',
  'odt',
];

/** Defaults = what the app allowed before bug 17. */
export const PLACE_SPECS: Record<UploadPlace, PlaceSpec> = {
  post: {
    count: 'split',
    safeFormats: [...PHOTOS, ...DOC_FORMATS],
    ceiling: { count: 20, fileMb: 50, totalMb: 200 },
    defaults: {
      maxPhotos: 9,
      maxFiles: 9,
      fileMb: 10,
      totalMb: 30,
      formats: POST_DEFAULT,
    },
  },
  reel: {
    count: 'split',
    safeFormats: [...PHOTOS, ...DOC_FORMATS],
    ceiling: { count: 20, fileMb: 50, totalMb: 200 },
    defaults: {
      maxPhotos: 9,
      maxFiles: 9,
      fileMb: 10,
      totalMb: 30,
      formats: POST_DEFAULT,
    },
  },
  case: {
    count: 'combined',
    safeFormats: [...PHOTOS, ...DOC_FORMATS],
    ceiling: { count: 20, fileMb: 50, totalMb: 0 },
    defaults: {
      maxPhotos: 0,
      maxFiles: 9,
      fileMb: 10,
      totalMb: 0,
      formats: ['jpeg', 'png', 'heic', 'pdf', 'docx'],
    },
  },
  chat: {
    count: 'none',
    safeFormats: ALL_UPLOAD_FORMATS,
    ceiling: { count: 0, fileMb: 100, totalMb: 0 },
    defaults: {
      maxPhotos: 0,
      maxFiles: 0,
      fileMb: 25,
      totalMb: 0,
      formats: [...ALL_UPLOAD_FORMATS],
    },
  },
  task: {
    count: 'combined',
    safeFormats: ALL_UPLOAD_FORMATS,
    ceiling: { count: 30, fileMb: 100, totalMb: 0 },
    defaults: {
      maxPhotos: 0,
      maxFiles: 10,
      fileMb: 25,
      totalMb: 0,
      formats: [...ALL_UPLOAD_FORMATS],
    },
  },
  review: {
    count: 'photos',
    safeFormats: PHOTOS,
    ceiling: { count: 20, fileMb: 50, totalMb: 0 },
    defaults: {
      maxPhotos: 10,
      maxFiles: 0,
      fileMb: 10,
      totalMb: 0,
      formats: ['jpeg', 'png', 'heic'],
    },
  },
  avatar: {
    count: 'none',
    safeFormats: PHOTOS,
    ceiling: { count: 0, fileMb: 20, totalMb: 0 },
    defaults: {
      maxPhotos: 0,
      maxFiles: 0,
      fileMb: 5,
      totalMb: 0,
      formats: ['jpeg', 'png', 'heic'],
    },
  },
  verification: {
    count: 'combined',
    safeFormats: [...PHOTOS, 'pdf'],
    ceiling: { count: 10, fileMb: 50, totalMb: 0 },
    defaults: {
      maxPhotos: 0,
      maxFiles: 3,
      fileMb: 10,
      totalMb: 0,
      formats: ['jpeg', 'png', 'heic', 'pdf'],
    },
  },
  // Uses the verification files (their size and formats); only the count.
  client_badge: {
    count: 'combined',
    safeFormats: [],
    ceiling: { count: 10, fileMb: 0, totalMb: 0 },
    defaults: {
      maxPhotos: 0,
      maxFiles: 5,
      fileMb: 0,
      totalMb: 0,
      formats: [],
    },
  },
};

export type UploadLimits = Record<UploadPlace, PlaceLimits>;

function clampInt(v: unknown, min: number, max: number, def: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

/** The stored value (anything) → limits inside the ceilings and the safe
 * lists. Unknown places, fields and formats are dropped. */
export function sanitizeUploadLimits(raw: unknown): UploadLimits {
  const src =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as UploadLimits;
  for (const place of UPLOAD_PLACES) {
    const spec = PLACE_SPECS[place];
    const d = spec.defaults;
    const v = src[place];
    const p = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    const picked = Array.isArray(p.formats) ? (p.formats as unknown[]) : null;
    out[place] = {
      maxPhotos:
        spec.count === 'split' || spec.count === 'photos'
          ? clampInt(p.maxPhotos, 0, spec.ceiling.count, d.maxPhotos)
          : 0,
      maxFiles:
        spec.count === 'split' || spec.count === 'combined'
          ? clampInt(p.maxFiles, 0, spec.ceiling.count, d.maxFiles)
          : 0,
      fileMb:
        spec.ceiling.fileMb > 0
          ? clampInt(p.fileMb, 1, spec.ceiling.fileMb, d.fileMb)
          : 0,
      totalMb:
        spec.ceiling.totalMb > 0
          ? clampInt(p.totalMb, 1, spec.ceiling.totalMb, d.totalMb)
          : 0,
      formats: picked
        ? spec.safeFormats.filter((f) => picked.includes(f))
        : [...d.formats],
    };
  }
  return out;
}

/** Places that decide a purpose's formats and MB per file. A post photo
 * may end up in a post or a reel: the wider of the two applies at upload,
 * the exact place when the file is attached. */
export const PURPOSE_PLACES: Partial<Record<FilePurpose, UploadPlace[]>> = {
  avatar: ['avatar'],
  post_image: ['post', 'reel'],
  post_attachment: ['post', 'reel'],
  review_photo: ['review'],
  case_photo: ['case'],
  case_attachment: ['case'],
  chat_attachment: ['chat'],
  task_attachment: ['task'],
  verification_document: ['verification'],
  verification_selfie: ['verification'],
};

export function placeMimes(limits: PlaceLimits): FileMime[] {
  return limits.formats.map((f) => FORMAT_MIME[f]);
}

/** The limits in force (for services that only hold the settings). */
export async function readUploadLimits(settings: {
  raw(key: string): Promise<unknown>;
}): Promise<UploadLimits> {
  return sanitizeUploadLimits(await settings.raw(UPLOAD_LIMITS_KEY));
}

/**
 * More photos / files than [place] allows → 409 FILES_COUNT_LIMIT with
 * the max. An item already over a lowered limit ([had] files) may keep or
 * drop files, not add. Places that do not count ('none') never refuse.
 */
export function assertUploadCount(
  limits: UploadLimits,
  place: UploadPlace,
  kind: 'photos' | 'files',
  count: number,
  had = 0,
): void {
  const spec = PLACE_SPECS[place];
  if (spec.count === 'none') return;
  const max =
    kind === 'photos' ? limits[place].maxPhotos : limits[place].maxFiles;
  if (count > max && count > had) {
    throw new ConflictException({
      code: ErrorCode.FILES_COUNT_LIMIT,
      message: `Up to ${max} ${kind} here.`,
      details: { place, kind, max },
    });
  }
}
