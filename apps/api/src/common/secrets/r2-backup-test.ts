import { HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createR2Client } from './r2-client';

const STEP_TIMEOUT_MS = 8_000;

/**
 * 26.11 (owner: «вставить ключ R2 для копии в админке, и всё»): «Проверить»
 * of the read-only R2 token the nightly media copy uses
 * (.github/workflows/media-backup.yml). Reads only: the bucket answers and
 * one object can be listed. Nothing is written, so a token with write rights
 * is not detected here; the guide asks for «Object Read only».
 */
export async function r2BackupTest(f: Record<string, string>): Promise<void> {
  const client = createR2Client({
    accountId: f.accountId,
    accessKeyId: f.accessKeyId,
    secretAccessKey: f.secretAccessKey,
  });
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: f.bucket }), {
        abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(
        `R2 не принял ключ или нет такой корзины (${e instanceof Error ? e.message : String(e)})`,
        { cause: e },
      );
    }
    try {
      await client.send(
        new ListObjectsV2Command({ Bucket: f.bucket, MaxKeys: 1 }),
        { abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS) },
      );
    } catch (e) {
      throw new Error(
        `Ключ не может читать список файлов: нужен токен R2 с правом Object Read (${e instanceof Error ? e.message : String(e)})`,
        { cause: e },
      );
    }
  } finally {
    client.destroy();
  }
}
