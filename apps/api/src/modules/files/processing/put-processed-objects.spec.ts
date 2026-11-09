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

  /** Owner 2026-11-09 («фото обрабатываются долго»): a file of the scan job
   * is still `pending` — nobody is handed any of its keys — so the main goes
   * up WITH its variants: one round trip to R2 instead of two. */
  const processed = () =>
    ({
      main: img('image/webp'),
      variants: new Map([
        [320, img('image/webp')],
        [1080, img('image/webp')],
      ]),
      width: 1,
      height: 1,
    }) as unknown as ProcessedFile;
  const file = {
    id: 'f',
    s3_bucket: 'lawbid-media',
    s3_key: 'post_image/s1/k',
  };

  it('a pending file: the main goes up together with its variants', async () => {
    const started: string[] = [];
    const storage = {
      put: jest.fn(
        (_bucket: string, key: string) =>
          new Promise<void>((resolve) => {
            started.push(key);
            setImmediate(resolve);
          }),
      ),
    };
    const done = putProcessedObjects(
      storage,
      { warn: jest.fn() },
      file,
      processed(),
      { original: { data: Buffer.from('orig'), mime: 'image/jpeg' } },
    );
    await Promise.resolve();
    expect([...started].sort()).toEqual(
      [
        'post_image/s1/k',
        'post_image/s1/k_w320',
        'post_image/s1/k_w1080',
      ].sort(),
    );
    await done;
  });

  it('a variant that fails puts the original back under the main key', async () => {
    const puts: Array<[string, string]> = [];
    const storage = {
      put: jest.fn((_bucket: string, key: string, body: Buffer) => {
        puts.push([key, body.toString()]);
        return key.endsWith('_w1080')
          ? Promise.reject(new Error('R2 down'))
          : Promise.resolve();
      }),
    };
    await expect(
      putProcessedObjects(storage, { warn: jest.fn() }, file, processed(), {
        original: { data: Buffer.from('orig'), mime: 'image/jpeg' },
      }),
    ).rejects.toThrow('R2 down');
    // The retry of the job reads the upload, never an already processed copy.
    expect(puts.at(-1)).toEqual(['post_image/s1/k', 'orig']);
    expect(storage.put).toHaveBeenLastCalledWith(
      'lawbid-media',
      'post_image/s1/k',
      Buffer.from('orig'),
      'image/jpeg',
    );
  });
});
