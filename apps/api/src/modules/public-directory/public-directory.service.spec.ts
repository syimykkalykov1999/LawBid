import {
  decodeDirectoryCursor,
  encodeDirectoryCursor,
  PublicDirectoryService,
} from './public-directory.service';

const row = (avatar: string | null, photoFrom = 'everyone') => ({
  username: 'jane',
  username_lower: 'jane',
  trust_level: 2,
  bio: null,
  firm_names: [],
  languages: [],
  rating_avg: 4.5,
  rating_count: 3,
  trust_badge: null,
  user: {
    first_name: 'Jane',
    last_name: 'Doe',
    avatar_file_id: avatar,
    privacy_settings: { photo_from: photoFrom },
  },
  practice_areas: [],
  licenses: [],
});

function make(opts: {
  cdn?: string;
  r2?: Record<string, string>;
  files?: { id: string; s3_key: string; s3_bucket: string }[];
  rows?: unknown[];
}) {
  const prisma = {
    attorneyProfile: {
      findMany: jest.fn<Promise<unknown>, [unknown?]>(() =>
        Promise.resolve(opts.rows),
      ),
      findUnique: jest.fn<Promise<unknown>, [unknown?]>(() =>
        Promise.resolve({
          trust_level: 1,
          rating_avg: 3.5,
          username_lower: 'old',
        }),
      ),
    },
    file: { findMany: jest.fn(() => Promise.resolve(opts.files ?? [])) },
  };
  const storage = {
    ready: jest.fn(() => Promise.resolve(true)),
    publicObjectUrl: jest.fn((bucket: string, key: string) =>
      opts.r2 && bucket === 'r2-bucket' ? `${opts.r2.base}/${key}` : null,
    ),
  };
  const config = {
    get: (k: string) => (k === 'MEDIA_CDN_BASE_URL' ? opts.cdn : undefined),
  };
  const Ctor = PublicDirectoryService as unknown as new (
    ...a: unknown[]
  ) => PublicDirectoryService;
  return {
    svc: new Ctor(prisma, config, undefined, storage),
    prisma,
    storage,
  };
}

describe('PublicDirectoryService photoUrl (og:image)', () => {
  it('uses the R2 public domain for an R2 avatar, no AWS CDN configured', async () => {
    const { svc } = make({
      r2: { base: 'https://media.lawbid.dev' },
      rows: [row('f1')],
      files: [{ id: 'f1', s3_key: 'avatar/a.webp', s3_bucket: 'r2-bucket' }],
    });
    const page = await svc.attorneys({});
    expect(page.items[0].photoUrl).toBe(
      'https://media.lawbid.dev/avatar/a.webp',
    );
  });

  it('keeps the AWS CDN link for an AWS avatar', async () => {
    const { svc } = make({
      cdn: 'https://cdn.example.com/',
      r2: { base: 'https://media.lawbid.dev' },
      rows: [row('f1')],
      files: [{ id: 'f1', s3_key: 'avatar/a.webp', s3_bucket: 'aws-media' }],
    });
    const page = await svc.attorneys({});
    expect(page.items[0].photoUrl).toBe(
      'https://cdn.example.com/avatar/a.webp',
    );
  });

  it('is null for an AWS avatar without any CDN, and for hidden photos', async () => {
    const { svc, prisma } = make({
      rows: [row('f1'), row('f2', 'contacts')],
      files: [{ id: 'f1', s3_key: 'k', s3_bucket: 'aws-media' }],
    });
    const page = await svc.attorneys({});
    expect(page.items[0].photoUrl).toBeNull();
    expect(page.items[1].photoUrl).toBeNull();
    const where = (
      prisma.file.findMany.mock.calls[0] as unknown as [
        { where: { id: { in: string[] } } },
      ]
    )[0].where;
    expect(where.id.in).toEqual(['f1']);
  });
});

describe('PublicDirectoryService keyset cursor', () => {
  it('round-trips the composite sort key as an opaque string', () => {
    const c = { t: 2, r: '4.50', u: 'jane' };
    expect(decodeDirectoryCursor(encodeDirectoryCursor(c))).toEqual(c);
    expect(decodeDirectoryCursor('jane')).toBeNull();
  });

  it('next page cursor carries trust_level, rating_avg and username', async () => {
    const { svc } = make({ rows: [row(null), row(null)] });
    const page = await svc.attorneys({ limit: 1 });
    expect(decodeDirectoryCursor(page.nextCursor as string)).toEqual({
      t: 2,
      r: '4.5',
      u: 'jane',
    });
  });

  it('filters strictly after the cursor on the whole sort key', async () => {
    const { svc, prisma } = make({ rows: [] });
    await svc.attorneys({
      cursor: encodeDirectoryCursor({ t: 2, r: '4.5', u: 'jane' }),
    });
    const arg = prisma.attorneyProfile.findMany.mock.calls[0][0] as {
      where: { OR: unknown[] };
      cursor?: unknown;
    };
    expect(arg.cursor).toBeUndefined();
    expect(arg.where.OR).toEqual([
      { trust_level: { lt: 2 } },
      { trust_level: 2, rating_avg: { lt: '4.5' } },
      { trust_level: 2, rating_avg: '4.5', username_lower: { gt: 'jane' } },
    ]);
  });

  it('a plain username cursor from an older page still works', async () => {
    const { svc, prisma } = make({ rows: [] });
    await svc.attorneys({ cursor: 'Old' });
    const arg = prisma.attorneyProfile.findMany.mock.calls[0][0] as {
      where: { OR: unknown[] };
    };
    expect(arg.where.OR[0]).toEqual({ trust_level: { lt: 1 } });
  });
});
