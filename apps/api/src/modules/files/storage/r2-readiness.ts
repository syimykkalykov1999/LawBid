import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';

/**
 * Why `media.public_store = r2` stays on AWS for now. The admin's «Здоровье
 * системы» shows the text; nothing here ever blocks an upload.
 */
export const R2_NOT_READY_TEXT = {
  no_keys:
    'В «Ключи и сервисы → Cloudflare R2» заполнены не все поля (или имя бакета совпадает с бакетом AWS).',
  bucket:
    'R2 не принял ключи или бакета нет. Проверьте ключи, имя бакета и права токена.',
  domain:
    'Публичный адрес бакета не отвечает. Подключите свой домен (Custom Domain) к бакету и дождитесь статуса Active.',
  web_csp:
    'Сайт ещё не пускает R2 (политика безопасности). Нужен terraform apply с этой версией кода.',
} as const;
export type R2NotReady = keyof typeof R2_NOT_READY_TEXT;

const TIMEOUT_MS = 4_000;

/**
 * The web app's CSP is a CloudFront header set by Terraform. When it does not
 * allow R2 yet, the browser would refuse the uploads and the pictures. An
 * unreachable site or a missing header proves nothing and does not count.
 */
async function webRefusesR2(webOrigin: string | undefined): Promise<boolean> {
  if (!webOrigin) return false;
  try {
    const res = await fetch(webOrigin, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const csp = res.headers.get('content-security-policy');
    return !!csp && !csp.includes('r2.cloudflarestorage.com');
  } catch {
    return false;
  }
}

/** One live look at R2: null when new public media may go there. */
export async function checkR2(input: {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string;
  webOrigin?: string;
}): Promise<R2NotReady | null> {
  try {
    await input.client.send(new HeadBucketCommand({ Bucket: input.bucket }), {
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return 'bucket';
  }
  // A missing key answers 404: the edge and R2 are both there.
  try {
    const res = await fetch(`${input.publicBaseUrl}/ops/health-probe`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500) return 'domain';
  } catch {
    return 'domain';
  }
  return (await webRefusesR2(input.webOrigin)) ? 'web_csp' : null;
}
