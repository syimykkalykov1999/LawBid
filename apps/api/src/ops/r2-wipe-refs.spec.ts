import { r2WipeTargets } from './prelaunch-wipe.plan';
import { r2WipeRefs } from './r2-wipe-refs';

const FULL = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucket: 'lawbid-media',
};
const ENV = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET',
  'SECRETS_MASTER_KEYS',
  'SECRETS_ACTIVE_KID',
];

describe('the wipes empty the R2 bucket too (owner 2026-11-04)', () => {
  const saved = ENV.map((k) => [k, process.env[k]] as const);
  beforeEach(() => ENV.forEach((k) => delete process.env[k]));
  afterAll(() =>
    saved.forEach(([k, v]) =>
      v === undefined ? delete process.env[k] : (process.env[k] = v),
    ),
  );

  it('needs the keys and the bucket, otherwise there is nothing to empty', () => {
    expect(r2WipeTargets(FULL)?.bucket).toBe('lawbid-media');
    expect(r2WipeTargets({ ...FULL, bucket: ' ' })).toBeNull();
    expect(r2WipeTargets({ ...FULL, secretAccessKey: undefined })).toBeNull();
  });

  it('nothing configured: no bucket, the database is not even asked', async () => {
    const db = { integrationCredential: { findMany: jest.fn() } };
    expect(await r2WipeRefs(db as never)).toEqual([]);
    expect(db.integrationCredential.findMany).not.toHaveBeenCalled();
  });

  it('keys in env: the bucket, marked as having no versions', async () => {
    process.env.CLOUDFLARE_R2_ACCOUNT_ID = FULL.accountId;
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = FULL.accessKeyId;
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = FULL.secretAccessKey;
    process.env.CLOUDFLARE_R2_BUCKET = FULL.bucket;
    const refs = await r2WipeRefs({} as never);
    expect(refs.map((r) => r.name)).toEqual(['lawbid-media']);
    expect(refs[0]).toMatchObject({ versionsOnly: false, noVersions: true });
    expect(await refs[0].client.config.region()).toBe('auto');
  });
});
