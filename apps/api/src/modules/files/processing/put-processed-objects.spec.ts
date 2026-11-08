import {
  putProcessedObjects,
  type ProcessedFile,
} from './put-processed-objects';

/** Owner 2026-11-08 (R2 speed): the derived objects go up together, the
 * main object only after every one of them is stored. */
describe('putProcessedObjects', () => {
  const img = (mime: string, avif = false) => ({
    data: Buffer.from(mime),
    mime,
    width: 1,
    height: 1,
    ...(avif ? { avif: { data: Buffer.from('a'), mime: 'image/avif' } } : {}),
  });

  it('sends variants and AVIF twins at once, the main last', async () => {
    const started: string[] = [];
    const finish = new Map<string, () => void>();
    const storage = {
      put: jest.fn(
        (_bucket: string, key: string) =>
          new Promise<void>((resolve) => {
            started.push(key);
            finish.set(key, resolve);
          }),
      ),
    };
    const processed = {
      main: img('image/webp', true),
      variants: new Map([
        [320, img('image/webp', true)],
        [1080, img('image/webp')],
      ]),
      width: 1,
      height: 1,
    } as unknown as ProcessedFile;

    const done = putProcessedObjects(
      storage,
      { warn: jest.fn() },
      { id: 'f', s3_bucket: 'lawbid-media', s3_key: 'post_image/s1/k' },
      processed,
    );
    await new Promise((r) => setImmediate(r));
    // Everything but the main is in flight before any of it finished.
    expect([...started].sort()).toEqual(
      [
        'post_image/s1/k_w320',
        'post_image/s1/k_w1080',
        'post_image/s1/k.avif',
        'post_image/s1/k_w320.avif',
      ].sort(),
    );
    for (const key of [...started]) finish.get(key)!();
    await new Promise((r) => setImmediate(r));
    expect(started.at(-1)).toBe('post_image/s1/k');
    finish.get('post_image/s1/k')!();
    await done;
    expect(storage.put).toHaveBeenCalledTimes(5);
  });
});
