import { fileMime, sha256Hex, sleep } from '@/components/media/media-utils';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { sendToStorage } from '@/lib/storage-upload';

type Mime = components['schemas']['AiImageUploadDto']['mime'];

/**
 * Owner 2026-11-12 (row 48): screenshots and photos for «ИИ-техник» and
 * «ИИ-сотрудник». The same pipeline as every admin upload (presign → the
 * private bucket → confirm → antivirus); the server checks the real type by
 * its bytes and re-encodes the picture without EXIF / GPS.
 */
export const AI_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const AI_IMAGE_ACCEPT = AI_IMAGE_TYPES.join(',');
/** docs.claude.com «Vision»: what one Claude request can carry (no cap of ours). */
export const AI_IMAGES_PER_REQUEST = 600;

const POLL_MS = 1500;
const POLL_TRIES = 40;

/** Why a file is refused before any upload, or null when it may go. The
 * size is checked by the server (the chat photo limit of «Загрузки»). */
export function refuseAiImage(file: File): string | null {
  const mime = fileMime(file);
  if (!(AI_IMAGE_TYPES as readonly string[]).includes(mime)) {
    return 'Только картинки JPEG, PNG, GIF или WebP.';
  }
  if (file.size === 0) return 'Пустой файл.';
  return null;
}

/** The image files among a paste / drop (other things are ignored). */
export function imagesOf(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = entry instanceof File ? entry : entry.kind === 'file' ? entry.getAsFile() : null;
    if (file && file.type.startsWith('image/')) out.push(file);
  }
  return out;
}

/** Uploads one picture and waits for a clean check; resolves with its file id. */
export async function uploadAiImage(file: File, onStep?: (text: string) => void): Promise<string> {
  const refused = refuseAiImage(file);
  if (refused) throw new Error(refused);
  onStep?.('Готовим…');
  const sha256 = await sha256Hex(file);
  const mime = fileMime(file) as Mime;
  const presigned = (await api.POST('/admin/ai-attachments/uploads', { body: { mime, sizeBytes: file.size, sha256 } }))
    .data!.data;
  onStep?.('Загружаем…');
  await sendToStorage(presigned.upload, file, {
    onProgress: (f) => onStep?.(`Загружаем… ${Math.round(f * 100)} %`),
  });
  onStep?.('Проверка…');
  for (let i = 0; i < POLL_TRIES; i++) {
    const c = (
      await api.POST('/admin/ai-attachments/uploads/{fileId}/confirm', {
        params: { path: { fileId: presigned.fileId } },
      })
    ).data!.data;
    if (c.scanStatus === 'clean') return presigned.fileId;
    if (c.scanStatus === 'infected') throw new Error('Картинка не прошла проверку на вирусы.');
    if (c.scanStatus === 'failed') throw new Error('Картинку не удалось проверить. Попробуйте другую.');
    await sleep(POLL_MS);
  }
  throw new Error('Проверка идёт дольше обычного. Попробуйте ещё раз чуть позже.');
}
