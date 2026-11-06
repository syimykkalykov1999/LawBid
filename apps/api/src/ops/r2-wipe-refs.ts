import type { S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import { createR2Client } from '../common/secrets/r2-client';
import { SecretEnvelope } from '../common/secrets/secret-envelope';
import { r2WipeTargets } from './prelaunch-wipe.plan';

export interface R2WipeRef {
  name: string;
  client: S3Client;
  versionsOnly: false;
  /** R2 has no object versions: one pass over the live objects is all. */
  noVersions: true;
}

function envFields(): Record<string, string | undefined> {
  return {
    accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
  };
}

/** Owner 2026-11-04: the R2 bucket (public media) of every key set saved in
 * the admin, plus CLOUDFLARE_R2_* env. Nothing configured = []. */
export async function r2WipeRefs(db: PrismaClient): Promise<R2WipeRef[]> {
  const sets = [envFields()];
  const keys = process.env.SECRETS_MASTER_KEYS;
  const kid = process.env.SECRETS_ACTIVE_KID;
  if (keys && kid) {
    const env = new SecretEnvelope(keys, kid);
    const rows = await db.integrationCredential.findMany({
      where: { provider: 'cloudflare_r2', status: 'active' },
    });
    for (const row of rows) {
      sets.push({
        ...(row.public_config as Record<string, string>),
        ...(JSON.parse(
          env.decrypt(row.secret_enc, `${row.provider}:${row.version}`),
        ) as Record<string, string>),
      });
    }
  }
  const refs = new Map<string, R2WipeRef>();
  for (const fields of sets) {
    const target = r2WipeTargets(fields);
    if (!target) continue;
    if (refs.has(target.bucket)) continue;
    refs.set(target.bucket, {
      name: target.bucket,
      client: createR2Client(target.keys),
      versionsOnly: false,
      noVersions: true,
    });
  }
  return [...refs.values()];
}
