import {
  finalKeyOf,
  isStagingKey,
  newFileKey,
  stagingKey,
  storedKey,
  variantKey,
} from './files.policy';
import { newShardedId } from '../../sharding/shard-id';

describe('newFileKey (owner-independent object keys)', () => {
  const now = new Date('2026-10-24T10:00:00Z');
  const fileId = '5c0f7a5e-0000-4000-8000-000000000001';

  it('is purpose/shard/year/month/fileId and never contains the owner id', () => {
    const owner = newShardedId(37);
    const key = newFileKey({ purpose: 'avatar', ownerId: owner, fileId, now });
    expect(key).toBe(`avatar/s37/2026/10/${fileId}`);
    expect(key).not.toContain(owner);
  });

  it('uses the legacy-uuid hash shard for a v4 owner and 0 for a non-uuid', () => {
    const v4 = '11111111-1111-4111-8111-1111111111ab';
    expect(newFileKey({ purpose: 'chat', ownerId: v4, fileId, now })).toMatch(
      /^chat\/s\d+\/2026\/10\//,
    );
    expect(newFileKey({ purpose: 'chat', ownerId: 'u1', fileId, now })).toBe(
      `chat/s0/2026/10/${fileId}`,
    );
  });

  it('pads the month and uses UTC', () => {
    const jan = new Date('2027-01-01T00:30:00Z');
    expect(newFileKey({ purpose: 'p', ownerId: 'u1', fileId, now: jan })).toBe(
      `p/s0/2027/01/${fileId}`,
    );
  });

  it('variants still hang off the stored key (old and new layout alike)', () => {
    const newKey = newFileKey({
      purpose: 'avatar',
      ownerId: 'u1',
      fileId,
      now,
    });
    expect(variantKey(newKey, 256)).toBe(`${newKey}_w256`);
    // a pre-change row keeps working: nothing parses the key
    expect(variantKey('avatar/old-user/old-file', 320)).toBe(
      'avatar/old-user/old-file_w320',
    );
  });
});

/**
 * D-c1 (2026-11-09, OWASP «upload to a separate location»): a presigned
 * link writes only under `staging/`; the stored copy never carries it.
 */
describe('staging keys (D-c1)', () => {
  const final = 'post_image/s3/2026/11/5c0f7a5e-0000-4000-8000-000000000001';

  it('the upload key is the final key under staging/', () => {
    expect(stagingKey(final)).toBe(`staging/${final}`);
    expect(isStagingKey(stagingKey(final))).toBe(true);
    expect(isStagingKey(final)).toBe(false);
  });

  it('the stored copy leaves staging/ and gets the random tail', () => {
    expect(storedKey(stagingKey(final), 'abcd1234')).toBe(`${final}_sabcd1234`);
    expect(finalKeyOf(stagingKey(final))).toBe(final);
  });

  it('an upload key from before the prefix is kept as it was', () => {
    expect(storedKey(final, 'abcd1234')).toBe(`${final}_sabcd1234`);
    expect(finalKeyOf(final)).toBe(final);
  });

  it('a demo upload keeps its demo/ prefix inside staging/', () => {
    expect(storedKey(stagingKey(`demo/${final}`), 'ab')).toBe(
      `demo/${final}_sab`,
    );
  });
});
