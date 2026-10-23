import {
  hasKmsWrappedKeys,
  type KmsDecrypt,
  unwrapKmsWrappedKeys,
} from './kms-env';

const RAW = 'r'.repeat(40);
const NEW = 'n'.repeat(48);
const blob = (s: string) => Buffer.from(s).toString('base64');

describe('kms-env', () => {
  it('leaves raw key lists alone and never calls KMS', async () => {
    const env = {
      MESSAGE_ENC_KEYS: `m1:${RAW}`,
      SECRETS_MASTER_KEYS: `k1:${RAW}`,
    };
    const decrypt = jest.fn();
    expect(hasKmsWrappedKeys(env)).toBe(false);
    const res = await unwrapKmsWrappedKeys(env, decrypt);
    expect(res.unwrapped).toEqual({});
    expect(decrypt).not.toHaveBeenCalled();
    expect(env.MESSAGE_ENC_KEYS).toBe(`m1:${RAW}`);
  });

  it('decrypts kms: entries in place, keeps the raw ones, passes key and context', async () => {
    const env: Record<string, string | undefined> = {
      MESSAGE_ENC_KEYS: `m1:${RAW},m2:kms:${blob('cipher-m2')}`,
      SECRETS_MASTER_KEYS: `k1:kms:${blob('cipher-k1')}`,
      DATA_KEYS_KMS_KEY_ARN: 'arn:aws:kms:us-east-1:1:key/abc',
      DATA_KEYS_KMS_APP: 'lawbid-prod',
    };
    const decrypt = jest.fn<ReturnType<KmsDecrypt>, Parameters<KmsDecrypt>>(
      (ct) => {
        const text = Buffer.from(ct).toString();
        return Promise.resolve(Buffer.from(text === 'cipher-m2' ? NEW : RAW));
      },
    );
    expect(hasKmsWrappedKeys(env)).toBe(true);
    const res = await unwrapKmsWrappedKeys(env, decrypt);
    expect(res.unwrapped).toEqual({
      MESSAGE_ENC_KEYS: 1,
      SECRETS_MASTER_KEYS: 1,
    });
    expect(env.MESSAGE_ENC_KEYS).toBe(`m1:${RAW},m2:${NEW}`);
    expect(env.SECRETS_MASTER_KEYS).toBe(`k1:${RAW}`);
    expect(decrypt).toHaveBeenCalledTimes(2);
    expect(decrypt.mock.calls[0][1]).toEqual({
      keyId: 'arn:aws:kms:us-east-1:1:key/abc',
      encryptionContext: { app: 'lawbid-prod' },
    });
  });

  it('refuses to boot on a failed or too-short decryption', async () => {
    await expect(
      unwrapKmsWrappedKeys({ MESSAGE_ENC_KEYS: `m2:kms:${blob('x')}` }, () =>
        Promise.reject(new Error('AccessDenied')),
      ),
    ).rejects.toThrow(/kms:Decrypt failed for key "m2".*AccessDenied/);
    await expect(
      unwrapKmsWrappedKeys({ MESSAGE_ENC_KEYS: `m2:kms:${blob('x')}` }, () =>
        Promise.resolve(Buffer.from('short')),
      ),
    ).rejects.toThrow(/fewer than 32 chars/);
    await expect(
      unwrapKmsWrappedKeys({ MESSAGE_ENC_KEYS: 'm2:kms:' }, jest.fn()),
    ).rejects.toThrow(/empty kms: ciphertext/);
  });
});
