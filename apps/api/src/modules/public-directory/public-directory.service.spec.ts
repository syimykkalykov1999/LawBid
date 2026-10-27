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
  updated_at: new Date('2026-10-20T09:15:00.000Z'),
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

describe('PublicDirectoryService updatedAt (sitemap lastmod)', () => {
  it('hands out the profile change time as ISO 8601 and reads the column once per page', async () => {
    const { svc, prisma } = make({ rows: [row(null)] });
    const page = await svc.attorneys({});
    expect(page.items[0].updatedAt).toBe('2026-10-20T09:15:00.000Z');
    const arg = prisma.attorneyProfile.findMany.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(arg.select.updated_at).toBe(true);
    expect(prisma.attorneyProfile.findMany).toHaveBeenCalledTimes(1);
  });
});

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

describe('PublicDirectoryService.seoPosts / seoQuestions (static pages of posts and legal Q&A)', () => {
  const ID = '0b9c1f4e-7a52-4c8e-9a41-5d2f6a7b8c90';
  const at = new Date('2026-10-20T09:15:00.000Z');
  const PRACTICE_ID = 'p-1';
  function makeSeo(
    o: {
      posts?: unknown[];
      questions?: unknown[];
      usernames?: Record<string, string>;
      licenses?: Array<{ attorney_id: string; state_code: string }>;
    } = {},
  ) {
    const prisma = {
      post: {
        findMany: jest.fn<Promise<unknown>, [unknown?]>(() =>
          Promise.resolve(o.posts ?? []),
        ),
      },
      legalQuestion: {
        findMany: jest.fn<Promise<unknown>, [unknown?]>(() =>
          Promise.resolve(o.questions ?? []),
        ),
      },
      attorneyProfile: {
        findMany: jest.fn<Promise<unknown>, [unknown?]>(() =>
          Promise.resolve(
            Object.entries(o.usernames ?? {}).map(([user_id, username]) => ({
              user_id,
              username,
            })),
          ),
        ),
      },
      attorneyLicense: {
        findMany: jest.fn<Promise<unknown>, [unknown?]>(() =>
          Promise.resolve(o.licenses ?? []),
        ),
      },
      practiceArea: {
        findMany: jest.fn<Promise<unknown>, [unknown?]>(() =>
          Promise.resolve([{ id: PRACTICE_ID, code: 'family_law.divorce' }]),
        ),
      },
    };
    const Ctor = PublicDirectoryService as unknown as new (
      ...a: unknown[]
    ) => PublicDirectoryService;
    return { svc: new Ctor(prisma), prisma };
  }
  const postRow = (id: string, authorId: string) => ({
    id,
    title: 'T',
    body: 'text',
    kind: 'post',
    language: 'en',
    created_at: at,
    updated_at: at,
    edited_at: null,
    author_id: authorId,
    practice_area_id: PRACTICE_ID,
  });

  it('posts: reads only published, live, text-only law posts of listed attorneys, newest first, without joins into other families', async () => {
    const { svc, prisma } = makeSeo({
      posts: [postRow(ID, 'u1')],
      usernames: { u1: 'jane' },
    });
    const page = await svc.seoPosts({});
    const arg = prisma.post.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(arg.where).toMatchObject({
      status: 'published',
      deleted_at: null,
      archived_at: null,
      video_asset_id: null,
      content_class: 'legal',
      media: { none: {} },
      attachments: { none: {} },
      author: {
        status: 'active',
        deleted_at: null,
        attorney_profile: { is: { verification_status: 'verified' } },
      },
    });
    expect(arg.select).not.toHaveProperty('author');
    expect(arg.select).not.toHaveProperty('practice_area');
    expect(arg.orderBy).toEqual([{ created_at: 'desc' }, { id: 'desc' }]);
    expect(arg.take).toBe(101);
    expect(page.items).toEqual([
      {
        id: ID,
        authorUsername: 'jane',
        title: 'T',
        body: 'text',
        kind: 'post',
        practiceCode: 'family_law.divorce',
        language: 'en',
        createdAt: '2026-10-20T09:15:00.000Z',
        updatedAt: '2026-10-20T09:15:00.000Z',
        editedAt: null,
      },
    ]);
    expect(page.nextCursor).toBeNull();
    expect(prisma.attorneyProfile.findMany).toHaveBeenCalledTimes(1);
  });

  it('posts: a row without an attorney profile is dropped, a full page hands out a cursor that continues after it', async () => {
    const second = '1b9c1f4e-7a52-4c8e-9a41-5d2f6a7b8c91';
    const rows = [
      postRow(ID, 'u1'),
      postRow(second, 'u2'),
      postRow('2b9c1f4e-7a52-4c8e-9a41-5d2f6a7b8c92', 'u3'),
    ];
    const { svc, prisma } = makeSeo({ posts: rows, usernames: { u1: 'jane' } });
    const page = await svc.seoPosts({ limit: 2 });
    expect(page.items.map((p) => p.authorUsername)).toEqual(['jane']);
    expect(page.nextCursor).toEqual(expect.any(String));
    await svc.seoPosts({ limit: 2, cursor: page.nextCursor ?? '' });
    const arg = prisma.post.findMany.mock.calls[1][0] as {
      where: { OR: unknown[] };
    };
    expect(arg.where.OR).toEqual([
      { created_at: { lt: at } },
      { created_at: at, id: { lt: second } },
    ]);
    // a garbage cursor starts from the top instead of failing
    await svc.seoPosts({ cursor: 'zzz' });
    expect(
      (
        prisma.post.findMany.mock.calls[2][0] as {
          where: Record<string, unknown>;
        }
      ).where.OR,
    ).toBeUndefined();
  });

  const answerRow = (attorneyId: string) => ({
    id: 'a1',
    body: 'answer',
    attorney_id: attorneyId,
    created_at: at,
    updated_at: at,
  });
  const questionRow = (state: string | null, answers: unknown[]) => ({
    id: ID,
    title: 'Q',
    body: 'question',
    state_code: state,
    practice_area_id: null,
    created_at: at,
    updated_at: at,
    answers,
  });

  it('questions: asks for published, unflagged questions with a best, unflagged answer of a listed attorney; never selects the asker', async () => {
    const { svc, prisma } = makeSeo({
      questions: [questionRow(null, [answerRow('u1')])],
      usernames: { u1: 'jane' },
    });
    const page = await svc.seoQuestions({});
    const arg = prisma.legalQuestion.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    const reviewed = {
      is_best: true,
      status: 'published',
      deleted_at: null,
      safety_flags: { isEmpty: true },
      attorney: {
        status: 'active',
        deleted_at: null,
        attorney_profile: { is: { verification_status: 'verified' } },
      },
    };
    expect(arg.where).toMatchObject({
      status: 'published',
      deleted_at: null,
      safety_flags: { isEmpty: true },
      answers: { some: reviewed },
    });
    expect((arg.select.answers as { where: unknown }).where).toEqual(reviewed);
    for (const k of ['author_id', 'author', 'is_anonymous', 'practice_area']) {
      expect(arg.select).not.toHaveProperty(k);
    }
    expect(page.items).toEqual([
      {
        id: ID,
        title: 'Q',
        body: 'question',
        practiceCode: null,
        stateCode: null,
        createdAt: '2026-10-20T09:15:00.000Z',
        updatedAt: '2026-10-20T09:15:00.000Z',
        answers: [
          {
            id: 'a1',
            attorneyUsername: 'jane',
            body: 'answer',
            reviewed: true,
            createdAt: '2026-10-20T09:15:00.000Z',
            updatedAt: '2026-10-20T09:15:00.000Z',
          },
        ],
      },
    ]);
  });

  it('questions: when the question names a state, the answerer needs a verified license there', async () => {
    const { svc, prisma } = makeSeo({
      questions: [
        questionRow('NY', [answerRow('u1')]), // licensed elsewhere: dropped
        questionRow('NY', [answerRow('u2')]),
        questionRow('NY', [answerRow('u3')]), // no profile: dropped
      ],
      usernames: { u1: 'jane', u2: 'ann' },
      licenses: [
        { attorney_id: 'u1', state_code: 'TX' },
        { attorney_id: 'u2', state_code: 'NY' },
      ],
    });
    const page = await svc.seoQuestions({});
    expect(
      page.items.map((x) => x.answers.map((a) => a.attorneyUsername)),
    ).toEqual([['ann']]);
    expect(prisma.attorneyLicense.findMany).toHaveBeenCalledWith({
      where: {
        attorney_id: { in: ['u1', 'u2', 'u3'] },
        license_status: 'verified',
      },
      select: { attorney_id: true, state_code: true },
    });
  });
});
