import { sha256Hex, sleep } from '@/components/media/media-utils';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type Mime = components['schemas']['AdminSupportUploadDto']['mime'];

const POLL_MS = 1500;
const POLL_TRIES = 40;

/** Safe types the support place accepts (the server checks content and the
 * admin's formats in «Загрузки и файлы»). */
export const SUPPORT_ACCEPT =
  'image/*,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv';

/**
 * One file for a reply: presign → S3 → confirm → wait for a clean scan
 * (the same pipeline the app uses). Resolves with the file id; throws a
 * readable Russian message otherwise.
 */
export async function uploadSupportFile(file: File, onStep?: (text: string) => void): Promise<string> {
  onStep?.('Считаем контрольную сумму…');
  const sha256 = await sha256Hex(file);
  const mime = (file.type || 'application/octet-stream') as Mime; // the server refuses types it does not allow
  onStep?.('Готовим загрузку…');
  // A refusal (type, size) throws an ApiError the caller shows as is.
  const presigned = (await api.POST('/admin/support/uploads', { body: { mime, sizeBytes: file.size, sha256 } })).data!.data;
  onStep?.('Загружаем файл…');
  const form = new FormData();
  for (const [k, v] of Object.entries(presigned.upload.fields)) form.append(k, v);
  form.append('file', file); // S3 POST policy: the file goes last
  let res: Response;
  try {
    res = await fetch(presigned.upload.url, { method: 'POST', body: form });
  } catch {
    throw new Error('Не удалось отправить файл в хранилище (сеть или CORS).');
  }
  if (!res.ok) throw new Error(`Хранилище отклонило файл (HTTP ${res.status}).`);
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
