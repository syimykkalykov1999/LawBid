// LawBid — data for the on-device performance suite (apps/mobile/integration_test/perf,
// docs/perf/APP_DEVICE_PERF.md), one command, LOCAL / DEV database only:
//
//   npm run seed:perf --workspace apps/api
//
// Creates (or tops up) ONE fake attorney, "perf.attorney", with the password
// Test1234! and the phone +12125550190, then gives it what the suite scrolls
// through: chats with history (one with 400 messages), bids on open cases
// (the attorney's "Mine" list) and reels (>= 14 video posts).
//
// - Idempotent: running it again changes nothing that is already there.
// - Never real user data: the person, the texts and the numbers are made up;
//   the videos are COPIES (symlinks) of the clips the dev fake Bunny already
//   holds (apps/api/tools/fake-bunny.mjs, DEV_FAKE_BUNNY=true), so they play
//   on a phone with `adb reverse tcp:4010 tcp:4010` and the fake Bunny
//   running. Without those clips the reels are skipped (and said so).
// - The account is created through the real API (needs it running and
//   OTP_DEV_FIXED_CODE=true, API_URL overrides http://127.0.0.1:3000/api/v1);
//   the rest of the profile is filled directly in the database.
// - Refuses to run against a production-looking DATABASE_URL.
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

for (const file of ['.env', 'apps/api/.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // no such file: fine, the environment may already be set.
  }
}

const PHONE = '+12125550190';
const PASSWORD = 'Test1234!';
const USERNAME = 'perf.attorney';
const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api/v1';
const TARGET_REELS = 14;
const LONG_CHAT_MESSAGES = 400;
const CHAT_PARTNERS = 10;
const BIDS = 12;

interface ApiJson {
  data?: { accessToken?: string };
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: ApiJson }> {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: ApiJson = {};
  try {
    json = JSON.parse(text) as ApiJson;
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}

/** Signs up through the API (dev fixed OTP code), sets role and password. */
async function signUp(): Promise<void> {
  const dev = { deviceId: 'perf-seed', platform: 'web' };
  await call('POST', '/auth/otp/request', {
    channel: 'phone',
    identifier: PHONE,
  });
  const v = await call('POST', '/auth/otp/verify', {
    channel: 'phone',
    identifier: PHONE,
    code: '000000',
    deviceInfo: dev,
  });
  const token = v.json?.data?.accessToken;
  if (!token) {
    throw new Error(
      `sign-up failed (${v.status}): is the API running with OTP_DEV_FIXED_CODE=true? ${JSON.stringify(v.json)}`,
    );
  }
  const idem = (): Record<string, string> => ({
    'idempotency-key': randomUUID(),
  });
  await call(
    'POST',
    '/users/me/consents',
    {
      consents: [
        'terms',
        'privacy',
        'disclaimer',
        'age_18',
        'attorney_agreement',
        'eula',
      ].map((type) => ({ type, granted: true })),
    },
    token,
    idem(),
  );
  await call('POST', '/users/me/role', { role: 'attorney' }, token, idem());
  await call('POST', '/auth/password', { password: PASSWORD }, token);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (/prod|amazonaws|rds\./i.test(url)) {
    throw new Error(
      'seed:perf refuses to run against a production-looking DATABASE_URL',
    );
  }
  const prisma = new PrismaClient();
  try {
    let user = await prisma.user.findUnique({
      where: { phone_e164: PHONE },
      select: { id: true, password_hash: true },
    });
    if (!user) {
      await signUp();
      user = await prisma.user.findUnique({
        where: { phone_e164: PHONE },
        select: { id: true, password_hash: true },
      });
    }
    if (!user) throw new Error('the perf attorney was not created');
    const uid = user.id;
    console.log('perf attorney:', uid);

    // --- profile: name, e-mail, license, photo, username, onboarding -------
    // A clean avatar of its own (the onboarding check wants one owned by the
    // user): a copy of another dev attorney's avatar row, same stored picture.
    const own = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) n FROM files WHERE owner_user_id = ${uid}::uuid
        AND purpose = 'avatar' AND scan_status = 'clean' AND deleted_at IS NULL`;
    if (Number(own[0].n) === 0) {
      const donor = await prisma.$queryRaw<{ id: string }[]>`
        SELECT f.id FROM files f WHERE f.purpose = 'avatar'
          AND f.scan_status = 'clean' AND f.deleted_at IS NULL
          AND f.owner_user_id <> ${uid}::uuid LIMIT 1`;
      if (donor[0]) {
        const copyId = randomUUID();
        await prisma.$transaction([
          prisma.$executeRawUnsafe(
            `CREATE TEMP TABLE _perf_file ON COMMIT DROP AS SELECT * FROM files WHERE id = '${donor[0].id}'::uuid`,
          ),
          prisma.$executeRawUnsafe(
            `UPDATE _perf_file SET id = '${copyId}'::uuid, owner_user_id = '${uid}'::uuid`,
          ),
          prisma.$executeRawUnsafe(
            `INSERT INTO files SELECT * FROM _perf_file`,
          ),
          prisma.$executeRawUnsafe(
            `UPDATE users SET avatar_file_id = '${copyId}'::uuid WHERE id = '${uid}'::uuid`,
          ),
        ]);
      }
    }
    await prisma.$executeRaw`
      UPDATE users SET first_name = 'Perf', last_name = 'Attorney',
        email = 'perf.attorney@example.test', email_verified_at = now(),
        updated_at = now()
      WHERE id = ${uid}::uuid`;
    await prisma.$executeRaw`
      INSERT INTO attorney_profiles (user_id, username, username_lower, bio,
        firm_name, firm_names, languages, verification_status, verified_at,
        verified_first_name, verified_last_name, updated_at)
      VALUES (${uid}::uuid, ${USERNAME}, ${USERNAME},
        'Made-up attorney for the performance suite.', 'Perf Test Firm',
        ARRAY['Perf Test Firm'], ARRAY['en'], 'verified', now(),
        'Perf', 'Attorney', now())
      ON CONFLICT (user_id) DO NOTHING`;
    await prisma.$executeRaw`
      INSERT INTO attorney_licenses (id, attorney_id, state_code, bar_number,
        license_status, expires_at, verified_at, updated_at)
      SELECT gen_random_uuid(), ${uid}::uuid, 'NY', 'NY-PERF-0001', 'verified',
        '2030-01-01', now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM attorney_licenses
        WHERE attorney_id = ${uid}::uuid AND state_code = 'NY')`;
    await prisma.$executeRaw`
      INSERT INTO onboarding_state (user_id, current_step, completed_at, updated_at)
      VALUES (${uid}::uuid, 'done', now(), now())
      ON CONFLICT (user_id) DO UPDATE SET completed_at =
        COALESCE(onboarding_state.completed_at, now()), current_step = 'done'`;
    // An active subscription so the attorney's bid features are not locked.
    await prisma.$executeRaw`
      INSERT INTO subscriptions (id, user_id, status, price_cents,
        current_period_start, current_period_end, plan, updated_at)
      SELECT gen_random_uuid(), ${uid}::uuid, 'active', 39900, now(),
        now() + interval '1 year', 'monthly', now()
      WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ${uid}::uuid)`;

    // --- chats with history ----------------------------------------------------
    const clients = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE role = 'client' AND status = 'active'
        AND deleted_at IS NULL AND phone_e164 IS NULL
      ORDER BY created_at LIMIT ${CHAT_PARTNERS}`;
    let chats = 0;
    for (const [i, c] of clients.entries()) {
      const want = i === 0 ? LONG_CHAT_MESSAGES : i < 3 ? 80 : 12;
      const existing = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM conversations WHERE attorney_id = ${uid}::uuid
          AND client_id = ${c.id}::uuid AND case_id IS NULL LIMIT 1`;
      const conv =
        existing[0]?.id ??
        (
          await prisma.$queryRaw<{ id: string }[]>`
            INSERT INTO conversations (id, attorney_id, client_id, status,
              contacts_unlocked, request_status, requested_by, updated_at)
            VALUES (gen_random_uuid(), ${uid}::uuid, ${c.id}::uuid, 'active',
              true, 'accepted', ${c.id}::uuid, now())
            RETURNING id`
        )[0].id;
      await prisma.$executeRaw`
        INSERT INTO conversation_participants (conversation_id, user_id, updated_at)
        VALUES (${conv}::uuid, ${uid}::uuid, now()), (${conv}::uuid, ${c.id}::uuid, now())
        ON CONFLICT DO NOTHING`;
      const have = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) n FROM messages WHERE conversation_id = ${conv}::uuid`;
      const missing = want - Number(have[0].n);
      if (missing > 0) {
        // Oldest first, a minute apart, ending a minute ago; both sides talk.
        await prisma.$executeRaw`
          INSERT INTO messages (id, conversation_id, sender_id, type,
            body_original, body_display, client_message_id, created_at, updated_at)
          SELECT gen_random_uuid(), ${conv}::uuid,
            CASE WHEN g % 2 = 0 THEN ${uid}::uuid ELSE ${c.id}::uuid END,
            'text'::message_type, m.t, m.t, gen_random_uuid()::text,
            now() - ((${missing} - g + 1) || ' minutes')::interval,
            now()
          FROM generate_series(1, ${missing}) g,
            LATERAL (SELECT 'Perf message ' || g || ': ' ||
              (ARRAY['Thanks, I have received the documents.',
                'Can we talk about the hearing date tomorrow?',
                'I attached the signed agreement for your review.',
                'The court moved the deadline by two weeks.',
                'Please send me the invoice when it is ready.',
                'That works for me, see you then.'])[1 + g % 6] AS t) m`;
        await prisma.$executeRaw`
          UPDATE conversations SET last_message_at = now() - interval '1 minute',
            last_message_id = (SELECT id FROM messages
              WHERE conversation_id = ${conv}::uuid ORDER BY created_at DESC LIMIT 1),
            updated_at = now()
          WHERE id = ${conv}::uuid`;
      }
      chats++;
    }
    console.log('chats:', chats);

    // --- bids on open cases (the attorney's "Mine") ------------------------
    const bids = await prisma.$executeRaw`
      INSERT INTO bids (id, case_id, attorney_id, status, fee_type,
        amount_cents, message, start_availability, round_count, turn, updated_at)
      SELECT gen_random_uuid(), c.id, ${uid}::uuid, 'active', 'hourly', 25000,
        'Perf bid: I can take this case.', 'immediately', 0, 'client', now()
      FROM cases c
      WHERE c.status = 'open' AND c.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.case_id = c.id
          AND b.attorney_id = ${uid}::uuid)
        AND (SELECT count(*) FROM bids b WHERE b.attorney_id = ${uid}::uuid) < ${BIDS}
      LIMIT ${BIDS}`;
    console.log('bids added:', bids);

    await seedReels(prisma, uid);

    // One device at a time: drop this account's sessions so the phone can
    // sign in (the sign-up above left a web session behind).
    const dropped = await prisma.$executeRaw`
      DELETE FROM sessions WHERE user_id = ${uid}::uuid`;
    console.log('sessions cleared:', dropped);
    console.log('done. Sign in with', PHONE, '/', PASSWORD);
  } finally {
    await prisma.$disconnect();
  }
}

/** Finds the folder that holds the fake Bunny's clips (this checkout's, or the
 * main checkout's when this is a git worktree). */
function fakeBunnyDirs(): { dir: string; source: string | null } {
  const dir = resolve(
    process.env.FAKE_BUNNY_DIR ?? join(__dirname, '..', '.fake-bunny'),
  );
  const candidates = [process.env.FAKE_BUNNY_SOURCE_DIR, dir];
  try {
    const common = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf8',
    }).trim();
    candidates.push(join(resolve(common, '..'), 'apps/api/.fake-bunny'));
  } catch {
    // not a git checkout
  }
  const source =
    candidates.find((c) => c && existsSync(c) && hasClips(c)) ?? null;
  return { dir, source };
}

function hasClips(dir: string): boolean {
  try {
    return (
      execSync(`ls "${dir}"`, { encoding: 'utf8' }).split('\n').filter(Boolean)
        .length > 0
    );
  } catch {
    return false;
  }
}

/** >= TARGET_REELS video posts by the perf attorney, each its own video
 * asset pointing at a (symlinked) copy of one of the fake Bunny's clips. */
async function seedReels(prisma: PrismaClient, uid: string): Promise<void> {
  const { dir, source } = fakeBunnyDirs();
  const have = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) n FROM posts WHERE author_id = ${uid}::uuid
      AND video_asset_id IS NOT NULL`;
  const missing = TARGET_REELS - Number(have[0].n);
  if (missing <= 0) {
    console.log('reels: already', String(have[0].n));
    return;
  }
  // Ready clips that exist as files, portrait first (reels are portrait).
  const clips = (
    await prisma.$queryRaw<
      {
        external_id: string;
        width: number | null;
        height: number | null;
        duration_sec: number | null;
      }[]
    >`
      SELECT external_id, width, height, duration_sec FROM video_assets
      WHERE status = 'ready' AND library_id = 'dev'
        AND owner_user_id <> ${uid}::uuid
      ORDER BY (height > width) DESC NULLS LAST, created_at`
  ).filter(
    (c) =>
      source && existsSync(join(source, c.external_id, 'hls', 'playlist.m3u8')),
  );
  if (clips.length === 0 || !source) {
    console.warn(
      'reels: SKIPPED - no clips in the fake Bunny folder (run tools/fake-bunny.mjs and upload a video once, or set FAKE_BUNNY_SOURCE_DIR)',
    );
    return;
  }
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < missing; i++) {
    const clip = clips[i % clips.length];
    const guid = randomUUID();
    // The clone folder: the clip's HLS + meta, as links (no copying).
    mkdirSync(join(dir, guid), { recursive: true });
    for (const f of ['hls', 'meta.json']) {
      const from = join(source, clip.external_id, f);
      if (existsSync(from)) symlinkSync(from, join(dir, guid, f));
    }
    const asset = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO video_assets (id, owner_user_id, provider, library_id,
        external_id, status, duration_sec, width, height, upload_expires_at,
        ready_at)
      VALUES (gen_random_uuid(), ${uid}::uuid, 'bunny', 'dev', ${guid},
        'ready', ${clip.duration_sec}, ${clip.width}, ${clip.height},
        now() + interval '1 year', now())
      RETURNING id`;
    await prisma.$executeRaw`
      INSERT INTO posts (id, author_id, body, status, video_asset_id,
        created_at, updated_at)
      VALUES (gen_random_uuid(), ${uid}::uuid,
        ${`Perf reel ${Number(have[0].n) + i + 1}`}, 'published',
        ${asset[0].id}::uuid,
        now() - ((${i} * 7) || ' minutes')::interval, now())`;
  }
  console.log('reels added:', missing, '(links in', dir + ')');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
