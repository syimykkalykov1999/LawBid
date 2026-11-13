/**
 * Owner 2026-11-12 (owner list rows 48, 49): screenshots and photos the owner
 * gives the AI technician («ИИ-техник», GitHub workflow) and the AI employee
 * («ИИ-сотрудник», Anthropic Messages / Batches). Pure rules, no I/O.
 *
 * Privacy (the repository is PUBLIC, admin screenshots can show users' data):
 * the bytes stay in our private bucket (files purpose ai_attachment); GitHub
 * only ever sees the opaque ids of `ai_attachments` rows, and the workflow
 * fetches the pictures through the OIDC-checked API (never a URL in an issue,
 * PR, comment or commit).
 */

/** Claude reads these four (docs.claude.com «Vision»: JPEG, PNG, GIF, WebP). */
export const AI_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
export type AiImageMime = (typeof AI_IMAGE_MIMES)[number];

export function isAiImageMime(m: string): m is AiImageMime {
  return (AI_IMAGE_MIMES as readonly string[]).includes(m);
}

/*
 * Owner 2026-11-12: NO cap of ours on how many pictures or how big (the
 * upload size is the files pipeline's own chat-photo limit). Only the real
 * limits of the Claude API stay, from docs.claude.com «Vision» and «Batch
 * processing» (read 2026-11-12):
 *  - up to 600 images per request on models with a 1M-token context (all of
 *    ours: Opus / Sonnet / Haiku 5.5), 100 on 200k-context models;
 *  - 10 MB per image (base64), 128 MB per Messages request, 256 MB per batch;
 *  - Claude 4.7 and later read up to 2,576 px on the long edge (larger is
 *    downscaled by the API anyway); with more than 20 images in one request
 *    every image must stay under 3,000 px, which 2,576 does.
 */
export const AI_IMAGES_PER_REQUEST = 600;
/** Base64 bytes of one image the API accepts. */
export const AI_IMAGE_B64_MAX = 10 * 1024 * 1024;
/** The pictures' share of one request (128 MB limit, room for the text). */
export const AI_REQUEST_IMAGE_BYTES = 100 * 1024 * 1024;
export const AI_IMAGE_LONG_EDGE = 2576;
/** Ids per workflow fetch (keeps each answer small; all pages are read). */
export const AI_FETCH_PAGE = 20;

/** Where an image belongs. */
export type AiAttachmentKind = 'task' | 'role' | 'note';

/** Retention settings (app_config, owner-editable with 2FA). */
export const AI_RETENTION_RECORDS_KEY = 'ai.retention_records_days';
export const AI_RETENTION_IMAGES_KEY = 'ai.retention_images_days';
export const AI_RETENTION_DEFAULT_DAYS = 15;
export const AI_RETENTION_MAX_DAYS = 36500;

/**
 * The owner's newest decided items per role that always stay (the AI
 * employee reads this many as its learning examples).
 */
export const AI_FEEDBACK_KEEP = 40;

/** An upload never attached to anything is removed after a day. */
export const UNATTACHED_GRACE_HOURS = 24;
/**
 * A technician task whose issue the API never saw closed (no page open, no
 * merge / reject through the admin) counts as closed after this many days.
 */
export const TASK_OPEN_MAX_DAYS = 30;

/** The issue line that carries the ids (and nothing else) to the workflow. */
export const ISSUE_ATTACHMENTS_PREFIX = 'AI attachments:';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Distinct, valid ids in their order; throws on bad input (no count cap). */
export function cleanIds(ids: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (!UUID.test(id)) throw new AiAttachmentError('Неверный id картинки.');
    const low = id.toLowerCase();
    if (!out.includes(low)) out.push(low);
  }
  return out;
}

/**
 * The line added to a task issue: opaque ids only (never a URL, a file name
 * or bytes). Empty when there are no images.
 */
export function issueAttachmentsLine(attachmentIds: readonly string[]): string {
  if (attachmentIds.length === 0) return '';
  return `${ISSUE_ATTACHMENTS_PREFIX} ${attachmentIds.join(' ')}`;
}

/** The ids of that line in an issue body (the workflow's side, mirrored). */
export function parseIssueAttachments(body: string): string[] {
  const line = body
    .split('\n')
    .find((l) => l.startsWith(ISSUE_ATTACHMENTS_PREFIX));
  if (!line) return [];
  return line
    .slice(ISSUE_ATTACHMENTS_PREFIX.length)
    .trim()
    .split(/\s+/)
    .filter((x) => UUID.test(x));
}

/**
 * What one Claude request can carry, in order: at most AI_IMAGES_PER_REQUEST
 * pictures and AI_REQUEST_IMAGE_BYTES of base64. The rest is counted, so the
 * owner is told honestly that those pictures did not reach the AI.
 */
export function fitRequest<T extends { data: string }>(
  images: readonly T[],
): { sent: T[]; skipped: number } {
  const sent: T[] = [];
  let bytes = 0;
  for (const img of images) {
    if (sent.length >= AI_IMAGES_PER_REQUEST) break;
    if (bytes + img.data.length > AI_REQUEST_IMAGE_BYTES) break;
    sent.push(img);
    bytes += img.data.length;
  }
  return { sent, skipped: images.length - sent.length };
}

/** The setting's days as the cleanup uses them: 0 = keep forever. */
export function retentionDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(AI_RETENTION_MAX_DAYS, Math.floor(n));
}

/** File extension of a picture the workflow writes to the runner. */
export function extensionOf(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export class AiAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiAttachmentError';
  }
}
