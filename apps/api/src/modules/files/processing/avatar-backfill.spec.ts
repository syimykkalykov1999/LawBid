import sharp from 'sharp';
import { ImageProcessor } from './image-processor';
import {
  parseAvatarBackfillArgs,
  runAvatarBackfill,
  type AvatarBackfillDeps,
} from './avatar-backfill';

jest.mock('./blurhash', () => ({
  computeBlurhash: jest.fn().mockResolvedValue('LKO2?U%2Tw=w'),
}));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

interface RowSpec {
  id: string;
  key?: string;
  width?: number | null;
  mime?: string;
}

function make(rows: RowSpec[], opts: { previewExists?: boolean } = {}) {
  const all = rows.map((r) => ({
    id: r.id,
    s3_bucket: 'media',
    s3_key: r.key ?? `avatar/u/${r.id}`,
    mime: r.mime ?? 'image/jpeg',
    width: r.width === undefined ? null : r.width,
    created_at: new Date('2026-10-01T00:00:00Z'),
  }));
  const findMany = jest.fn(
    (args: { where: { width?: null; id?: { gt: string } }; take: number }) =>
      Promise.resolve(
        all
          .filter((r) => (args.where.width === null ? r.width === null : true))
          .filter((r) => (args.where.id ? r.id > args.where.id.gt : true))
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, args.take),
      ),
  );
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const storage = {
    read: jest.fn().mockResolvedValue(JPEG),
    put: jest.fn().mockResolvedValue(undefined),
    head: jest.fn().mockResolvedValue(opts.previewExists ? { size: 10 } : null),
  };
  const main = {
    data: Buffer.from('main'),
    mime: 'image/webp',
    width: 1024,
    height: 1024,
  };
  const small = {
    data: Buffer.from('small'),
    mime: 'image/webp',
    width: 256,
    height: 256,
  };
  const images = {
    process: jest.fn().mockResolvedValue({
      main,
      variants: new Map([[256, small]]),
      width: 1024,
      height: 1024,
    }),
  };
  const settings = {
    string: jest.fn().mockResolvedValue('webp'),
    number: jest.fn().mockResolvedValue(null),
    boolean: jest.fn().mockResolvedValue(false),
  };
  const deps = {
    prisma: { file: { findMany, updateMany } },
    storage,
    images,
    settings,
  } as unknown as AvatarBackfillDeps;
  const log: string[] = [];
  return { deps, findMany, updateMany, storage, images, log };
}

const base = { apply: false, all: false, force: false, limit: 0, batch: 2 };

describe('avatar variants backfill (R-405)', () => {
  it('dry run by default: counts the never-processed avatars, writes nothing', async () => {
    const t = make([{ id: 'a' }, { id: 'b' }, { id: 'c', width: 1024 }]);
    const sum = await runAvatarBackfill(t.deps, {
      ...base,
      log: (l) => t.log.push(l),
    });
    expect(sum).toEqual({
      candidates: 2,
      objects: 2,
      processed: 0,
      skipped: 0,
      failed: 0,
      rowsUpdated: 0,
    });
    expect(t.storage.read).not.toHaveBeenCalled();
    expect(t.storage.put).not.toHaveBeenCalled();
    expect(t.updateMany).not.toHaveBeenCalled();
    // Pages by id: the first page had 2 rows, so a second (empty) page is asked.
    expect(t.findMany).toHaveBeenCalledTimes(2);
  });

  it('apply: the same pipeline as an upload — variants, then the main object, then the row', async () => {
    const t = make([{ id: 'a' }]);
    const sum = await runAvatarBackfill(t.deps, {
      ...base,
      apply: true,
      log: (l) => t.log.push(l),
    });
    expect(sum.processed).toBe(1);
    expect(sum.rowsUpdated).toBe(1);
    expect(t.images.process).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: true,
        format: 'webp',
        mime: 'image/jpeg',
      }),
    );
    expect(t.storage.put.mock.calls.map((c: unknown[]) => c[1])).toEqual([
      'avatar/u/a_w256',
      'avatar/u/a',
    ]);
    expect(t.updateMany).toHaveBeenCalledWith({
      where: {
        s3_bucket: 'media',
        s3_key: 'avatar/u/a',
        purpose: 'avatar',
        deleted_at: null,
      },
      data: expect.objectContaining({
        width: 1024,
        height: 1024,
        mime: 'image/webp',
        size_bytes: BigInt(4),
        blurhash: 'LKO2?U%2Tw=w',
      }),
    });
    expect(t.log).toEqual(['a: processed']);
  });

  it('rows sharing one stored object are processed once; --limit stops after N objects', async () => {
    const t = make([
      { id: 'a', key: 'avatar/u/shared' },
      { id: 'b', key: 'avatar/u/shared' },
      { id: 'c' },
      { id: 'd' },
    ]);
    const sum = await runAvatarBackfill(t.deps, {
      ...base,
      apply: true,
      limit: 2,
      log: () => undefined,
    });
    expect(sum.objects).toBe(2);
    expect(sum.processed).toBe(2);
    expect(t.storage.read.mock.calls.map((c: unknown[]) => c[1])).toEqual([
      'avatar/u/shared',
      'avatar/u/c',
    ]);
  });

  it('--all skips an avatar whose preview object already exists unless --force', async () => {
    const t = make([{ id: 'a', width: 1024 }], { previewExists: true });
    const skipped = await runAvatarBackfill(t.deps, {
      ...base,
      apply: true,
      all: true,
      log: () => undefined,
    });
    expect(skipped.skipped).toBe(1);
    expect(t.storage.head).toHaveBeenCalledWith('media', 'avatar/u/a_w256');
    expect(t.storage.read).not.toHaveBeenCalled();

    const forced = await runAvatarBackfill(t.deps, {
      ...base,
      apply: true,
      all: true,
      force: true,
      log: () => undefined,
    });
    expect(forced.processed).toBe(1);
  });

  it('a stored object that is not a picture, or one that fails, is counted and never stops the run', async () => {
    const t = make([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    t.storage.read
      .mockResolvedValueOnce(Buffer.from('%PDF-1.4 not a picture'))
      .mockRejectedValueOnce(new Error('NoSuchKey'))
      .mockResolvedValueOnce(JPEG);
    const sum = await runAvatarBackfill(t.deps, {
      ...base,
      apply: true,
      log: (l) => t.log.push(l),
    });
    expect(sum).toMatchObject({ skipped: 1, failed: 1, processed: 1 });
    expect(t.log).toEqual([
      'a: skipped (not an image)',
      'b: failed (NoSuchKey)',
      'c: processed',
    ]);
  });

  it('parses the flags and refuses unknown ones', () => {
    expect(parseAvatarBackfillArgs([])).toEqual({
      apply: false,
      all: false,
      force: false,
      limit: 0,
      batch: 100,
    });
    expect(
      parseAvatarBackfillArgs(['--apply', '--all', '--limit=20', '--batch=5']),
    ).toMatchObject({ apply: true, all: true, limit: 20, batch: 5 });
    expect(() => parseAvatarBackfillArgs(['--delete'])).toThrow(
      'unknown argument: --delete',
    );
  });
});

describe('avatar variants backfill with the real image pipeline (R-405)', () => {
  it('turns a raw 3000×2000 photo into a square 1024 px main and a 256 px preview', async () => {
    const raw = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: '#336699',
      },
    })
      .jpeg()
      .toBuffer();
    const t = make([{ id: 'a' }]);
    t.storage.read.mockResolvedValue(raw);
    const real = new ImageProcessor();
    const sum = await runAvatarBackfill(
      { ...t.deps, images: real },
      { ...base, apply: true, log: () => undefined },
    );
    expect(sum.processed).toBe(1);
    const stored = new Map(
      t.storage.put.mock.calls.map((c: unknown[]) => [
        c[1] as string,
        c[2] as Buffer,
      ]),
    );
    const size = async (key: string) => {
      const m = await sharp(stored.get(key)).metadata();
      return [m.width, m.height, m.format];
    };
    expect(await size('avatar/u/a')).toEqual([1024, 1024, 'webp']);
    expect(await size('avatar/u/a_w256')).toEqual([256, 256, 'webp']);
  });
});
