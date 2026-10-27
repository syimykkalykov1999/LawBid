/**
 * Demo content layer, on top of the existing demo world (`seedDemoWorld`):
 * photos / carousels / documents / (opt-in) reel stubs in posts, comments
 * and replies, likes, saves, reposts, avatars for everyone, review photos,
 * case photos, active promotions and engagement notifications.
 *
 * Idempotent: every row has an id derived from a stable key and is written
 * with `skipDuplicates`; objects in storage are overwritten with the same
 * bytes. Safe to run again at any time.
 */
import { createHash } from 'node:crypto';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DEMO_EMAIL_DOMAIN } from '../../src/modules/demo/demo-seed';
import {
  DEMO_AVATAR_SIZE,
  renderDemoAvatarPng,
} from '../../src/modules/demo/demo-avatar';
import { samplePdf, scenePng } from './media';
import {
  COMMENT_BODIES,
  DEMO_POSTS,
  LONG_COMMENT_EN,
  REPLY_BODIES,
  type DemoPostSpec,
} from './texts';

const DAY = 86_400_000;
const MIN = 60_000;

const SIZES = {
  portrait: [1080, 1350],
  square: [1080, 1080],
  wide: [1080, 608],
} as const;

/** Stable uuid from a key (sha1, version/variant bits set). */
export function det(key: string): string {
  const h = createHash('sha1').update(`lawbid-demo:${key}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function rngOf(seed: string): () => number {
  let s = createHash('sha1').update(seed).digest().readUInt32BE(0);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunks<T>(arr: T[], n = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function hashtagsOf(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Storage (S3 / MinIO), same env as the API
// ---------------------------------------------------------------------------

class Storage {
  private constructor(
    private readonly client: S3Client,
    readonly media: string,
    readonly documents: string,
  ) {}

  static async fromEnv(): Promise<Storage | null> {
    const media = process.env.S3_BUCKET_MEDIA;
    const documents = process.env.S3_BUCKET_DOCUMENTS;
    if (!media || !documents) return null;
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const id = process.env.S3_ACCESS_KEY_ID;
    const secret = process.env.S3_SECRET_ACCESS_KEY;
    const client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint,
      forcePathStyle: endpoint !== undefined,
      credentials:
        id && secret ? { accessKeyId: id, secretAccessKey: secret } : undefined,
    });
    const s = new Storage(client, media, documents);
    // Local MinIO: make sure the buckets exist.
    if (endpoint) {
      for (const bucket of [media, documents]) {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch {
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
        }
      }
    }
    return s;
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface ContentResult {
  posts: number;
  comments: number;
  likes: number;
  saves: number;
  files: number;
  promotions: number;
  mediaSkipped: boolean;
}

interface Person {
  id: string;
  role: string | null;
  username: string | null;
  createdAt: Date;
  hasAvatar: boolean;
}

export async function seedDemoContent(
  prisma: PrismaClient,
  opts: { videoStubs?: boolean; now?: Date } = {},
): Promise<ContentResult> {
  const now = opts.now ?? new Date();
  const storage = await Storage.fromEnv();
  const files: Prisma.FileCreateManyInput[] = [];
  let fileCount = 0;

  // ---- People -------------------------------------------------------------
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    select: {
      id: true,
      role: true,
      created_at: true,
      avatar_file_id: true,
      attorney_profile: { select: { username: true } },
    },
    orderBy: { id: 'asc' },
  });
  if (users.length === 0) {
    throw new Error('demo content: the demo world is empty, seed it first');
  }
  const people: Person[] = users.map((u) => ({
    id: u.id,
    role: u.role,
    username: u.attorney_profile?.username ?? null,
    createdAt: u.created_at,
    hasAvatar: u.avatar_file_id !== null,
  }));
  const byUsername = new Map(
    people.filter((p) => p.username).map((p) => [p.username as string, p]),
  );
  const attorneys = people.filter((p) => p.role === 'attorney');

  /** Registers a file row (and uploads the object when storage is set). */
  async function addFile(f: {
    key: string;
    owner: string;
    purpose: Prisma.FileCreateManyInput['purpose'];
    bucket: 'media' | 'documents';
    s3Key: string;
    mime: string;
    body: Buffer;
    width?: number;
    height?: number;
    variants?: { suffix: string; body: Buffer }[];
    createdAt: Date;
  }): Promise<string> {
    const id = det(`file:${f.key}`);
    if (storage) {
      const bucket = f.bucket === 'media' ? storage.media : storage.documents;
      await storage.put(bucket, f.s3Key, f.body, f.mime);
      for (const v of f.variants ?? []) {
        await storage.put(bucket, f.s3Key + v.suffix, v.body, f.mime);
      }
      files.push({
        id,
        owner_user_id: f.owner,
        purpose: f.purpose,
        s3_bucket: bucket,
        s3_key: f.s3Key,
        mime: f.mime,
        size_bytes: BigInt(f.body.length),
        sha256: createHash('sha256').update(f.body).digest('hex'),
        width: f.width ?? null,
        height: f.height ?? null,
        scan_status: 'clean',
        is_public: f.bucket === 'media',
        created_at: f.createdAt,
      });
      fileCount += 1;
    }
    return id;
  }

  /** A generated picture with its 320 / 1080 px variants. */
  async function addPicture(
    key: string,
    owner: string,
    purpose: 'post_image' | 'review_photo' | 'case_photo',
    seed: number,
    ratio: keyof typeof SIZES,
    createdAt: Date,
  ): Promise<{ id: string; w: number; h: number } | null> {
    if (!storage) return null;
    const [w, h] = SIZES[ratio];
    const main = scenePng(seed, w, h);
    const small = scenePng(seed, 320, Math.round((320 * h) / w));
    const id = await addFile({
      key,
      owner,
      purpose,
      bucket: purpose === 'case_photo' ? 'documents' : 'media',
      s3Key: `demo/${purpose}/${owner}/${det(`file:${key}`)}`,
      mime: 'image/png',
      body: main,
      width: w,
      height: h,
      variants: [
        { suffix: '_w320', body: small },
        { suffix: '_w1080', body: main },
      ],
      createdAt,
    });
    return { id, w, h };
  }

  // ---- Avatars for everyone who has none ----------------------------------
  if (storage) {
    for (const p of people.filter((p) => !p.hasAvatar)) {
      const png = renderDemoAvatarPng(p.id);
      const id = await addFile({
        key: `avatar:${p.id}`,
        owner: p.id,
        purpose: 'avatar',
        bucket: 'media',
        s3Key: `demo/avatar/${p.id}/${det(`file:avatar:${p.id}`)}`,
        mime: 'image/png',
        body: png,
        width: DEMO_AVATAR_SIZE,
        height: DEMO_AVATAR_SIZE,
        // Owner 2026-10-26: the 256 px preview every list links to
        // (`…_w256`) — without it seeded avatars showed only on profiles.
        variants: [{ suffix: '_w256', body: png }],
        createdAt: p.createdAt,
      });
      // The files must exist before the user row points at them.
      await flushFiles(prisma, files);
      await prisma.user.update({
        where: { id: p.id },
        data: { avatar_file_id: id },
      });
    }
  }

  // ---- Posts ---------------------------------------------------------------
  const practiceByCode = new Map(
    (
      await prisma.practiceArea.findMany({ select: { id: true, code: true } })
    ).map((a) => [a.code, a.id]),
  );
  const postRows: Prisma.PostCreateManyInput[] = [];
  const mediaRows: Prisma.PostMediaCreateManyInput[] = [];
  const attachRows: Prisma.PostAttachmentCreateManyInput[] = [];
  const videoRows: Prisma.VideoAssetCreateManyInput[] = [];
  const tagPairs: { postId: string; tag: string }[] = [];
  const newPostIds: string[] = [];
  let seedN = 0;

  for (const [i, spec] of DEMO_POSTS.entries()) {
    const author = byUsername.get(spec.author);
    if (!author) continue;
    if (spec.style === 'video' && !opts.videoStubs) continue;
    const postId = det(`post:${spec.key}`);
    const at = new Date(
      spec.minutesAgo !== undefined
        ? now.getTime() - spec.minutesAgo * MIN
        : now.getTime() - (1 + ((i * 5) % 38)) * DAY - i * 17 * MIN,
    );
    let videoId: string | null = null;
    if (spec.style === 'video') {
      videoId = det(`video:${spec.key}`);
      videoRows.push({
        id: videoId,
        owner_user_id: author.id,
        provider: 'bunny',
        library_id: 'demo',
        external_id: `demo-${spec.key}`,
        status: 'ready',
        duration_sec: 20 + (i % 3) * 15,
        width: 1080,
        height: 1920,
        upload_expires_at: at,
        created_at: at,
        ready_at: at,
      });
    }
    postRows.push(
      postRow(spec, postId, author.id, videoId, at, practiceByCode),
    );
    newPostIds.push(postId);
    for (const tag of hashtagsOf(spec.body)) tagPairs.push({ postId, tag });

    if (spec.photos && storage) {
      for (let n = 0; n < spec.photos; n += 1) {
        const pic = await addPicture(
          `post:${spec.key}:${n}`,
          author.id,
          'post_image',
          seedN + n,
          spec.ratio ?? 'portrait',
          at,
        );
        if (pic) {
          mediaRows.push({
            id: det(`media:${spec.key}:${n}`),
            post_id: postId,
            file_id: pic.id,
            media_type: 'image',
            position: n,
            width: pic.w,
            height: pic.h,
            created_at: at,
          });
        }
      }
      seedN += spec.photos;
    }
    if (spec.pdf && storage) {
      const fileId = await addFile({
        key: `post-doc:${spec.key}`,
        owner: author.id,
        purpose: 'post_attachment',
        bucket: 'documents',
        s3Key: `demo/post_attachment/${author.id}/${det(`file:post-doc:${spec.key}`)}`,
        mime: 'application/pdf',
        body: samplePdf(spec.title ?? 'LawBid demo document'),
        createdAt: at,
      });
      attachRows.push({
        id: det(`attach:${spec.key}`),
        post_id: postId,
        file_id: fileId,
        file_name: `${spec.key}.pdf`,
        position: 0,
        created_at: at,
      });
    }
    for (const [n, name] of (spec.docs ?? []).entries()) {
      if (!storage) break;
      const pdf = name.toLowerCase().endsWith('.pdf');
      const fileId = await addFile({
        key: `post-doc:${spec.key}:${n}`,
        owner: author.id,
        purpose: 'post_attachment',
        bucket: 'documents',
        s3Key: `demo/post_attachment/${author.id}/${det(`file:post-doc:${spec.key}:${n}`)}`,
        mime: pdf
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: samplePdf(name),
        createdAt: at,
      });
      attachRows.push({
        id: det(`attach:${spec.key}:${n}`),
        post_id: postId,
        file_id: fileId,
        file_name: name,
        position: n,
        created_at: at,
      });
    }
  }

  await flushFiles(prisma, files);
  await write(videoRows, (data) =>
    prisma.videoAsset.createMany({ data, skipDuplicates: true }),
  );
  await write(postRows, (data) =>
    prisma.post.createMany({ data, skipDuplicates: true }),
  );
  await write(mediaRows, (data) =>
    prisma.postMedia.createMany({ data, skipDuplicates: true }),
  );
  await write(attachRows, (data) =>
    prisma.postAttachment.createMany({ data, skipDuplicates: true }),
  );
  await writeTags(prisma, tagPairs);

  // ---- Engagement on EVERY post (world's and new) --------------------------
  const allPosts = await prisma.post.findMany({
    where: { status: 'published', deleted_at: null },
    select: { id: true, author_id: true, language: true, created_at: true },
    orderBy: { id: 'asc' },
  });
  const likes: Prisma.PostLikeCreateManyInput[] = [];
  const saves: Prisma.SavedItemCreateManyInput[] = [];
  const reposts: Prisma.PostRepostCreateManyInput[] = [];
  const comments: Prisma.CommentCreateManyInput[] = [];
  const commentLikes: Prisma.CommentLikeCreateManyInput[] = [];
  const notes: Prisma.NotificationCreateManyInput[] = [];

  for (const post of allPosts) {
    const rnd = rngOf(`engage:${post.id}`);
    const others = people.filter((p) => p.id !== post.author_id);
    const shuffled = [...others].sort(() => rnd() - 0.5);
    const lang = post.language === 'ru' ? 'ru' : 'en';
    const t0 = post.created_at.getTime();

    for (const p of shuffled.slice(
      0,
      4 + Math.floor(rnd() * (others.length - 3)),
    )) {
      likes.push({
        post_id: post.id,
        user_id: p.id,
        created_at: new Date(t0 + Math.floor(rnd() * 3 * DAY) + MIN),
      });
    }
    for (const p of shuffled.slice(0, Math.floor(rnd() * 6))) {
      saves.push({
        user_id: p.id,
        item_type: 'post',
        item_id: post.id,
        created_at: new Date(t0 + Math.floor(rnd() * 4 * DAY) + MIN),
      });
    }
    for (const p of shuffled.slice(6, 6 + Math.floor(rnd() * 3))) {
      reposts.push({
        id: det(`repost:${post.id}:${p.id}`),
        post_id: post.id,
        user_id: p.id,
        created_at: new Date(t0 + Math.floor(rnd() * 3 * DAY) + 5 * MIN),
      });
    }

    const nComments = 2 + Math.floor(rnd() * 5);
    for (let c = 0; c < nComments; c += 1) {
      const who = shuffled[c % shuffled.length];
      const pool = COMMENT_BODIES[lang];
      const id = det(`comment:${post.id}:${c}`);
      const at = new Date(t0 + (c + 1) * 37 * MIN + Math.floor(rnd() * DAY));
      const body =
        c === 0 && post.id.endsWith('a')
          ? LONG_COMMENT_EN
          : pool[Math.floor(rnd() * pool.length)];
      comments.push({
        id,
        post_id: post.id,
        author_id: who.id,
        body,
        created_at: at,
        updated_at: at,
      });
      for (const p of shuffled.slice(c, c + Math.floor(rnd() * 4))) {
        commentLikes.push({
          comment_id: id,
          user_id: p.id,
          created_at: new Date(at.getTime() + 3 * MIN),
        });
      }
      // The author answers some comments.
      if (c % 2 === 0) {
        const rp = REPLY_BODIES[lang];
        const rAt = new Date(at.getTime() + 25 * MIN);
        comments.push({
          id: det(`reply:${post.id}:${c}`),
          post_id: post.id,
          author_id: post.author_id,
          parent_comment_id: id,
          body: rp[Math.floor(rnd() * rp.length)],
          created_at: rAt,
          updated_at: rAt,
        });
        notes.push({
          id: det(`note:comment_reply:${post.id}:${c}`),
          user_id: who.id,
          type: 'comment_reply',
          category: 'social',
          payload: { postId: post.id, actorId: post.author_id },
          created_at: rAt,
          read_at: rnd() < 0.5 ? new Date(rAt.getTime() + 30 * MIN) : null,
        });
      }
    }
    // The author's own bell: a like and a comment on recent posts.
    if (now.getTime() - t0 < 10 * DAY) {
      const liker = shuffled[0];
      const commenter = shuffled[1];
      notes.push(
        {
          id: det(`note:post_like:${post.id}`),
          user_id: post.author_id,
          type: 'post_like',
          category: 'social',
          payload: { postId: post.id, actorId: liker.id },
          created_at: new Date(t0 + 2 * 60 * MIN),
          read_at: null,
        },
        {
          id: det(`note:post_comment:${post.id}`),
          user_id: post.author_id,
          type: 'post_comment',
          category: 'social',
          payload: { postId: post.id, actorId: commenter.id },
          created_at: new Date(t0 + 3 * 60 * MIN),
          read_at: rnd() < 0.4 ? new Date(t0 + 4 * 60 * MIN) : null,
        },
      );
    }
  }

  await write(likes, (data) =>
    prisma.postLike.createMany({ data, skipDuplicates: true }),
  );
  await write(saves, (data) =>
    prisma.savedItem.createMany({ data, skipDuplicates: true }),
  );
  await write(reposts, (data) =>
    prisma.postRepost.createMany({ data, skipDuplicates: true }),
  );
  // Parents before replies (the FK).
  await write(
    comments.filter((c) => !c.parent_comment_id),
    (data) => prisma.comment.createMany({ data, skipDuplicates: true }),
  );
  await write(
    comments.filter((c) => c.parent_comment_id),
    (data) => prisma.comment.createMany({ data, skipDuplicates: true }),
  );
  await write(commentLikes, (data) =>
    prisma.commentLike.createMany({ data, skipDuplicates: true }),
  );
  await write(notes, (data) =>
    prisma.notification.createMany({ data, skipDuplicates: true }),
  );

  // ---- Photos on reviews and cases (needs storage) ------------------------
  if (storage) {
    const reviews = await prisma.review.findMany({
      select: { id: true, client_id: true, created_at: true, photo_ids: true },
      orderBy: { id: 'asc' },
      take: 4,
    });
    for (const [i, r] of reviews.entries()) {
      if (r.photo_ids.length > 0) continue;
      const pic = await addPicture(
        `review:${r.id}`,
        r.client_id,
        'review_photo',
        40 + i,
        'square',
        r.created_at,
      );
      if (pic) {
        await flushFiles(prisma, files);
        await prisma.review.update({
          where: { id: r.id },
          data: { photo_ids: [pic.id] },
        });
      }
    }
    const cases = await prisma.case.findMany({
      select: { id: true, client_id: true, created_at: true },
      orderBy: { id: 'asc' },
      take: 6,
    });
    const casePhotos: Prisma.CasePhotoCreateManyInput[] = [];
    for (const [i, c] of cases.entries()) {
      for (let n = 0; n < 1 + (i % 3); n += 1) {
        const pic = await addPicture(
          `case:${c.id}:${n}`,
          c.client_id,
          'case_photo',
          60 + i * 3 + n,
          'portrait',
          c.created_at,
        );
        if (pic) {
          casePhotos.push({
            id: det(`casephoto:${c.id}:${n}`),
            case_id: c.id,
            file_id: pic.id,
            position: n,
            created_at: c.created_at,
          });
        }
      }
    }
    await flushFiles(prisma, files);
    await write(casePhotos, (data) =>
      prisma.casePhoto.createMany({ data, skipDuplicates: true }),
    );
  }
  await flushFiles(prisma, files);

  // ---- Promotions: two promoted posts and two promoted open cases ---------
  const promoRows: Prisma.CasePromotionCreateManyInput[] = [];
  const promoPosts = allPosts.slice(0, 2);
  const promoCases = await prisma.case.findMany({
    where: { status: 'open' },
    select: { id: true, client_id: true },
    orderBy: { id: 'asc' },
    take: 2,
  });
  const startsAt = new Date(now.getTime() - 2 * DAY);
  const endsAt = new Date(now.getTime() + 5 * DAY);
  promoPosts.forEach((p, i) =>
    promoRows.push(
      promotion(`post:${p.id}`, 'post', p.author_id, p.id, i, startsAt, endsAt),
    ),
  );
  promoCases.forEach((c, i) =>
    promoRows.push(
      promotion(
        `case:${c.id}`,
        'case',
        c.client_id,
        c.id,
        i + 2,
        startsAt,
        endsAt,
      ),
    ),
  );
  await write(promoRows, (data) =>
    prisma.casePromotion.createMany({ data, skipDuplicates: true }),
  );

  // ---- Counters: make the numbers match the rows --------------------------
  await prisma.$executeRawUnsafe(`
    UPDATE posts p SET
      comment_count = (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL),
      like_count    = GREATEST(p.like_count, (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id)),
      save_count    = GREATEST(p.save_count, (SELECT count(*) FROM saved_items s WHERE s.item_type = 'post' AND s.item_id = p.id))
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE comments c SET
      reply_count = (SELECT count(*) FROM comments r WHERE r.parent_comment_id = c.id),
      like_count  = (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id)
  `);
  // Owner 2026-10-12: demo view counts on the video posts (reels), 150–9000.
  await prisma.$executeRawUnsafe(`
    UPDATE posts SET view_count = 150 + (abs(hashtext(id::text)) % 8850)
    WHERE video_asset_id IS NOT NULL AND view_count = 0
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE attorney_profiles a SET
      posts_count = (SELECT count(*) FROM posts p WHERE p.author_id = a.user_id AND p.deleted_at IS NULL)
  `);

  void attorneys;
  return {
    posts: newPostIds.length,
    comments: comments.length,
    likes: likes.length,
    saves: saves.length,
    files: fileCount,
    promotions: promoRows.length,
    mediaSkipped: storage === null,
  };
}

// ---------------------------------------------------------------------------

function postRow(
  spec: DemoPostSpec,
  id: string,
  authorId: string,
  videoId: string | null,
  at: Date,
  practiceByCode: Map<string, string>,
): Prisma.PostCreateManyInput {
  return {
    id,
    author_id: authorId,
    title: spec.title ? spec.title.slice(0, 120) : null,
    body: spec.body.slice(0, 5000),
    practice_area_id: spec.practice
      ? (practiceByCode.get(spec.practice) ?? null)
      : null,
    kind: spec.kind ?? 'post',
    video_asset_id: videoId,
    language: spec.lang,
    location_name: spec.location ?? null,
    location_lat: spec.location ? 40.7 : null,
    location_lng: spec.location ? -74 : null,
    comments_enabled: spec.comments ?? true,
    content_class: spec.legal === false ? 'general' : 'legal',
    status: 'published',
    share_count: 3 + (at.getTime() % 11),
    created_at: at,
    updated_at: at,
  };
}

function promotion(
  key: string,
  type: 'post' | 'case',
  userId: string,
  targetId: string,
  n: number,
  startsAt: Date,
  endsAt: Date,
): Prisma.CasePromotionCreateManyInput {
  const perDay = 500;
  return {
    id: det(`promotion:${key}`),
    target_type: type,
    case_id: type === 'case' ? targetId : null,
    post_id: type === 'post' ? targetId : null,
    user_id: userId,
    days: 7,
    price_cents_per_day: perDay,
    total_cents: perDay * 7,
    status: 'active',
    starts_at: startsAt,
    ends_at: endsAt,
    impressions: 1200 + n * 340,
    reach: 800 + n * 210,
    clicks: 40 + n * 13,
    created_at: startsAt,
  };
}

async function write<T>(
  rows: T[],
  fn: (data: T[]) => Promise<unknown>,
): Promise<void> {
  for (const c of chunks(rows)) await fn(c);
}

async function flushFiles(
  prisma: PrismaClient,
  files: Prisma.FileCreateManyInput[],
): Promise<void> {
  if (files.length === 0) return;
  const batch = files.splice(0, files.length);
  await write(batch, (data) =>
    prisma.file.createMany({ data, skipDuplicates: true }),
  );
}

async function writeTags(
  prisma: PrismaClient,
  pairs: { postId: string; tag: string }[],
): Promise<void> {
  const lowers = [...new Set(pairs.map((p) => p.tag))];
  if (lowers.length === 0) return;
  await write(lowers, (data) =>
    prisma.tag.createMany({
      data: data.map((tag_lower) => ({ tag_lower })),
      skipDuplicates: true,
    }),
  );
  const tags = await prisma.tag.findMany({
    where: { tag_lower: { in: lowers } },
    select: { id: true, tag_lower: true },
  });
  const idOf = new Map(tags.map((t) => [t.tag_lower, t.id]));
  const rows: Prisma.PostTagCreateManyInput[] = [];
  for (const p of pairs) {
    const tag_id = idOf.get(p.tag);
    if (tag_id) rows.push({ post_id: p.postId, tag_id });
  }
  await write(rows, (data) =>
    prisma.postTag.createMany({ data, skipDuplicates: true }),
  );
}
