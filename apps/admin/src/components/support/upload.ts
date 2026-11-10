import { fileMime, sha256Hex, sleep } from '@/components/media/media-utils';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { sendToStorage } from '@/lib/storage-upload';

type Mime = components['schemas']['AdminSupportUploadDto']['mime'];

const POLL_MS = 1500;
const POLL_TRIES = 40;

/** Safe types the support place accepts (the server checks content and the
 * admin's formats in «Загрузки и файлы»). */
export const SUPPORT_ACCEPT =
  'image/*,.heic,.heif,video/mp4,video/quicktime,video/webm,.mov,.webm,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv';

/**
 * One file for a reply: presign → S3 → confirm → wait for a clean scan
 * (the same pipeline the app uses). Resolves with the file id; throws a
 * readable Russian message otherwise.
 */
export async function uploadSupportFile(file: File, onStep?: (text: string) => void): Promise<string> {
  onStep?.('Считаем контрольную сумму…');
  const sha256 = await sha256Hex(file);
  const mime = fileMime(file) as Mime; // the server refuses types it does not allow
  onStep?.('Готовим загрузку…');
  // A refusal (type, size) throws an ApiError the caller shows as is.
  const presigned = (await api.POST('/admin/support/uploads', { body: { mime, sizeBytes: file.size, sha256 } })).data!.data;
  onStep?.('Загружаем файл…');
  // Progress and the app's retry rule (a lost connection or a busy storage
  // is tried again, a refusal is not); StorageUploadError carries the text.
  await sendToStorage(presigned.upload, file, {
    onProgress: (f) => onStep?.(`Загружаем файл… ${Math.round(f * 100)} %`),
  });
  onStep?.('Проверка на вирусы…');
  for (let i = 0; i < POLL_TRIES; i++) {
    const c = (
      await api.POST('/admin/support/uploads/{fileId}/confirm', { params: { path: { fileId: presigned.fileId } } })
    ).data!.data;
    const status = c.scanStatus;
    if (status === 'clean') return presigned.fileId;
    if (status === 'infected') throw new Error('Файл не прошёл проверку на вирусы.');
    if (status === 'failed') throw new Error('Проверка файла не удалась. Попробуйте другой файл.');
    await sleep(POLL_MS);
  }
  throw new Error('Проверка файла идёт дольше обычного. Попробуйте ещё раз чуть позже.');
}
