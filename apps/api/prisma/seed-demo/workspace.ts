import type { PrismaClient } from '@prisma/client';

/**
 * Owner 2026-10-13: demo data for the case workspace. One accepted case
 * (Amelia's, attorney Sofia) with files that carry notes, tasks of every
 * kind, a task answered by the client and three updates; one more case of
 * Amelia's still waiting for a bid, with documents and photos locked.
 * Idempotent: the rows have fixed ids / are looked up by title.
 */
const AMELIA_PHONE = '+14155552681';
const id = (key: string): string => `md5('ws:${key}')::uuid`;

export async function seedCaseWorkspace(
  prisma: PrismaClient,
): Promise<{ acceptedCaseId: string | null; lockedCaseId: string | null }> {
  const amelia = await prisma.user.findFirst({
    where: { phone_e164: AMELIA_PHONE },
    select: { id: true },
  });
  const sofia = await prisma.user.findFirst({
    where: { attorney_profile: { username: 'sofia.hernandez' } },
    select: { id: true },
  });
  if (!amelia || !sofia) return { acceptedCaseId: null, lockedCaseId: null };

  // An accepted case with photos: made Amelia's / Sofia's if it is not.
  const accepted = await prisma.case.findFirst({
    where: {
      status: 'in_progress',
      accepted_bid_id: { not: null },
      photos: { some: {} },
    },
    orderBy: { id: 'asc' },
    select: { id: true, accepted_bid_id: true },
  });
  if (!accepted) return { acceptedCaseId: null, lockedCaseId: null };
  const caseId = accepted.id;
  const bidId = accepted.accepted_bid_id as string;
  await prisma.case.update({
    where: { id: caseId },
    data: { client_id: amelia.id },
  });
  await prisma.bid.update({
    where: { id: bidId },
    data: { attorney_id: sofia.id },
  });
  await prisma.$executeRaw`INSERT INTO contact_disclosures (id, case_id, bid_id, client_id, attorney_id, fields, disclosed_at)
    SELECT md5('ws:disclosure:' || ${caseId})::uuid, ${caseId}::UUID, ${bidId}::UUID, ${amelia.id}::UUID, ${sofia.id}::UUID, ARRAY['name','phone','email'], now()
    WHERE NOT EXISTS (SELECT 1 FROM contact_disclosures WHERE case_id = ${caseId}::UUID)`;
  await prisma.$executeRaw`UPDATE contact_disclosures SET client_id = ${amelia.id}::UUID, attorney_id = ${sofia.id}::UUID WHERE case_id = ${caseId}::UUID`;
  await prisma.$executeRaw`UPDATE conversations SET client_id = ${amelia.id}::UUID, attorney_id = ${sofia.id}::UUID WHERE case_id = ${caseId}::UUID`;

  // Documents as case_attachment files (shared storage objects).
  await prisma.$executeRawUnsafe(`
    INSERT INTO files (id, owner_user_id, purpose, s3_bucket, s3_key, mime, size_bytes, sha256, source_sha256, scan_status, is_public, updated_at)
    SELECT ${id("'||f.id||'")}, '${amelia.id}'::uuid, 'case_attachment', f.s3_bucket, f.s3_key, f.mime, f.size_bytes, f.sha256, f.source_sha256, 'clean', false, now()
    FROM files f WHERE f.purpose = 'post_attachment' AND f.scan_status = 'clean' AND f.deleted_at IS NULL
    ORDER BY f.id LIMIT 8
    ON CONFLICT (id) DO NOTHING`);
  const docs = await prisma.file.findMany({
    where: { owner_user_id: amelia.id, purpose: 'case_attachment' },
    orderBy: { id: 'asc' },
    take: 8,
    select: { id: true },
  });
  const photos = await prisma.casePhoto.findMany({
    where: { case_id: caseId, source: 'case' },
    orderBy: { position: 'asc' },
  });
  const notes = [
    'The boundary fence as it stood last spring, before the neighbour moved it.',
    'Survey from 2019, the red line is our lot.',
    'Photo from the corner by the gate, taken on 12 March.',
  ];
  for (const [i, p] of photos.entries()) {
    await prisma.casePhoto.update({
      where: { id: p.id },
      data: { description: notes[i] ?? null, added_by: amelia.id },
    });
  }
  const ago = (h: number): Date => new Date(Date.now() - h * 3600_000);

  // Tasks of the two kinds; the private one is the attorney's own.
  await prisma.caseTask.deleteMany({ where: { case_id: caseId } });
  await prisma.caseUpdate.deleteMany({ where: { case_id: caseId } });
  await prisma.casePhoto.deleteMany({
    where: { case_id: caseId, source: { in: ['task', 'update'] } },
  });
  const passport = await prisma.caseTask.create({
    data: {
      case_id: caseId,
      kind: 'for_client',
      title: 'Documents for the application',
      description:
        'Please send, one by one:\n\nA scan of your passport with every stamped page, a certified English translation of the marriage certificate, and two recent utility bills with your address.\n\nIf the translation takes longer, send the rest now and add the translation later in this same task.',
      created_by: sofia.id,
      created_at: ago(72),
      items: {
        create: [
          {
            position: 0,
            title: 'Passport, all pages',
            done_at: ago(31),
            done_by: amelia.id,
          },
          {
            position: 1,
            title: 'Certified translation of the marriage certificate',
          },
          {
            position: 2,
            title: 'Two utility bills',
            done_at: ago(30),
            done_by: amelia.id,
          },
        ],
      },
    },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  await prisma.caseTask.create({
    data: {
      case_id: caseId,
      kind: 'for_client',
      title: 'Write down the dates of the incident',
      description: 'Dates, places and who was there. A short list is fine.',
      created_by: sofia.id,
      created_at: ago(20),
    },
  });
  await prisma.caseTask.create({
    data: {
      case_id: caseId,
      kind: 'shared',
      title: 'Draft the founders agreement',
      description:
        'Vesting, roles and exit terms. I will share the draft here.',
      created_by: sofia.id,
      created_at: ago(60),
      status: 'done',
      done_at: ago(8),
      done_by: sofia.id,
    },
  });
  await prisma.caseTask.create({
    data: {
      case_id: caseId,
      kind: 'shared',
      title: 'File the Certificate of Formation',
      created_by: sofia.id,
      created_at: ago(40),
    },
  });
  await prisma.attorneyTask.deleteMany({
    where: { case_id: caseId, attorney_id: sofia.id },
  });
  await prisma.attorneyTask.create({
    data: {
      attorney_id: sofia.id,
      kind: 'other',
      title: 'Check the registered agent before filing',
      case_id: caseId,
    },
  });
  await prisma.caseTaskEvent.createMany({
    data: [
      {
        task_id: passport.id,
        case_id: caseId,
        actor_id: sofia.id,
        type: 'created',
        created_at: ago(72),
      },
      {
        task_id: passport.id,
        case_id: caseId,
        actor_id: sofia.id,
        type: 'files_added',
        note: 'The form to sign is attached, page 3.',
        file_count: 1,
        created_at: ago(71),
      },
      {
        task_id: passport.id,
        case_id: caseId,
        actor_id: amelia.id,
        type: 'files_added',
        note: 'Passport and two bills attached, the translation is in progress.',
        file_count: 3,
        created_at: ago(31),
      },
    ],
  });
  let pos = 100;
  const forms = [
    {
      i: 0,
      d: 'Passport, all pages',
      who: amelia.id,
      item: passport.items[0].id,
      h: 31,
    },
    {
      i: 1,
      d: 'Utility bill, March',
      who: amelia.id,
      item: passport.items[2].id,
      h: 31,
    },
    {
      i: 2,
      d: 'Utility bill, April',
      who: amelia.id,
      item: passport.items[2].id,
      h: 31,
    },
    {
      i: 4,
      d: 'Authorization form, sign page 3 and send a photo of it',
      who: sofia.id,
      item: null,
      h: 71,
    },
  ];
  for (const f of forms) {
    const file = docs[f.i];
    if (!file) continue;
    await prisma.casePhoto.create({
      data: {
        case_id: caseId,
        file_id: file.id,
        position: pos++,
        description: f.d,
        source: 'task',
        source_id: passport.id,
        source_item_id: f.item,
        added_by: f.who,
        created_at: ago(f.h),
      },
    });
  }
  // Updates: text, a file from the client, a reply from the attorney.
  const u1 = await prisma.caseUpdate.create({
    data: {
      case_id: caseId,
      author_id: amelia.id,
      body: 'The translation is ready, I am sending it with a note on the stamp.',
      created_at: ago(5),
    },
  });
  if (docs[3]) {
    await prisma.casePhoto.create({
      data: {
        case_id: caseId,
        file_id: docs[3].id,
        position: pos++,
        description: 'Certified translation of the marriage certificate',
        source: 'update',
        source_id: u1.id,
        added_by: amelia.id,
        created_at: ago(5),
      },
    });
  }
  await prisma.caseUpdate.create({
    data: {
      case_id: caseId,
      author_id: sofia.id,
      body: 'Received, thank you. I will attach it to the petition this week.\n\nOne more thing: please check that the name on the stamp matches your passport.',
      created_at: ago(4),
    },
  });
  await prisma.caseUpdate.create({
    data: {
      case_id: caseId,
      author_id: sofia.id,
      body: 'Hearing prep is on the calendar for Thursday.',
      created_at: ago(2),
    },
  });

  // A case still waiting for bids: documents and photos behind the lock.
  const locked = await prisma.case.findFirst({
    where: { client_id: amelia.id, status: 'open', id: { not: caseId } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (locked) {
    await prisma.casePhoto.deleteMany({ where: { case_id: locked.id } });
    const lockedFiles = [
      ...docs.slice(4, 7),
      ...(await prisma.file.findMany({
        where: { purpose: 'case_photo', scan_status: 'clean' },
        orderBy: { id: 'desc' },
        take: 2,
        select: { id: true },
      })),
    ];
    for (const [i, f] of lockedFiles.entries()) {
      await prisma.casePhoto.create({
        data: {
          case_id: locked.id,
          file_id: f.id,
          position: i,
          added_by: amelia.id,
        },
      });
    }
  }
  return { acceptedCaseId: caseId, lockedCaseId: locked?.id ?? null };
}
