// Dev-only demo content (owner request 2026-09-30: "сделай пару
// публикаций" for investor demos). Idempotent by phone number.
//
// Creates a few verified demo attorneys and demo clients directly in the
// dev DB, then signs each in through the normal OTP flow (dev fixed code)
// and publishes posts / cases through the real API, so photos go through
// presign -> upload -> confirm -> scan exactly like the app does.
//
// Usage (API running on :3000, dev DB, OTP_DEV_FIXED_CODE=true):
//   node scripts/seed-demo.mjs <dir-with-jpegs> [+1XXXXXXXXXX to follow]
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production') throw new Error('dev only');

const API = process.env.DEMO_API ?? 'http://localhost:3000/api/v1';
const ART = process.argv[2];
const FOLLOWER_PHONE = process.argv[3];
if (!ART) throw new Error('usage: seed-demo.mjs <art-dir> [follower-phone]');
const prisma = new PrismaClient();

const ATTORNEYS = [
  {
    phone: '+13125550101',
    first: 'Maria',
    last: 'Lopez',
    username: 'marialopez_law',
    state: 'TX',
    firms: ['Lopez Family Law, PLLC'],
    languages: ['en', 'es'],
    practices: ['family_law.child_custody', 'family_law.divorce'],
    bio: 'Family law attorney in Houston. Custody, divorce and support — calm, clear, on your side.',
    posts: [
      {
        img: 'family.jpg',
        body: 'Joint custody is not 50/50 by default\n\nMany parents assume "joint custody" means equal time. In Texas, the court looks at the best interest of the child first: school, stability, who handled daily care. Keep a simple calendar of pickups, doctor visits and school events — it is the strongest evidence you can bring. #familylaw #custody #texas',
      },
      {
        img: 'family.jpg',
        body: "Can I move to another state with my child?\n\nIf there is a custody order, usually not without the other parent's consent or a court order. Plan ahead: file a modification before you sign a lease, not after. #familylaw #relocation",
      },
    ],
  },
  {
    phone: '+13125550102',
    first: 'Daniel',
    last: 'Kim',
    username: 'danielkim_immigration',
    state: 'NY',
    firms: ['Kim & Partners Immigration'],
    languages: ['en', 'ko'],
    practices: [
      'immigration.green_card',
      'immigration.citizenship_and_naturalization',
    ],
    bio: 'Immigration attorney in New York. Green cards, naturalization, work visas.',
    posts: [
      {
        img: 'passport.jpg',
        body: 'Green card interview: 5 things to bring\n\n1. Original passport and all prior passports\n2. Your interview notice\n3. Birth and marriage certificates with translations\n4. Recent tax returns and pay stubs\n5. Proof of a real relationship if the case is marriage-based — photos, lease, joint bills. #immigration #greencard #uscis',
      },
      {
        img: 'passport_flag.jpg',
        body: 'Naturalization after 3 years instead of 5\n\nIf you have been married to and living with a U.S. citizen for 3 years, you may apply for citizenship earlier. Travel history matters: long trips abroad can break continuous residence. #immigration #citizenship',
      },
    ],
  },
  {
    phone: '+13125550103',
    first: 'James',
    last: 'Carter',
    username: 'jcarter_defense',
    state: 'CA',
    firms: ['Carter Defense Group'],
    languages: ['en'],
    practices: [
      'criminal_defense.general_criminal_defense',
      'dui_and_dwi.first_offense_dui',
      'traffic_tickets.speeding',
    ],
    bio: 'Criminal defense, DUI and traffic in Los Angeles. Former prosecutor.',
    posts: [
      {
        img: 'gavel.jpg',
        body: "Got a speeding ticket? Don't just pay it\n\nPaying is pleading guilty: points on your license and higher insurance for years. In many California courts a traffic attorney can appear for you, request traffic school or reduce the violation. #trafficticket #speeding #california",
      },
      {
        img: 'gavel.jpg',
        body: 'First DUI: the 10-day rule\n\nAfter a DUI arrest in California you have only 10 days to request a DMV hearing, or your license is suspended automatically. Call a lawyer before the deadline, not after the court date. #dui #criminaldefense',
      },
    ],
  },
  {
    phone: '+13125550104',
    first: 'Sarah',
    last: 'Mitchell',
    username: 'sarahmitchell_injury',
    state: 'FL',
    firms: ['Mitchell Injury Law'],
    languages: ['en'],
    practices: ['personal_injury.car_accident'],
    bio: 'Personal injury attorney in Miami. No fee unless we win.',
    posts: [
      {
        img: 'gavel.jpg',
        body: "After a car accident: what to do in the first 24 hours\n\nCall the police, take photos of both cars and the road, get the other driver's insurance, and see a doctor even if you feel fine. Don't give a recorded statement to the other insurer before talking to a lawyer. #personalinjury #caraccident",
      },
    ],
  },
];

const CLIENTS = [
  {
    phone: '+13125550201',
    first: 'Emily',
    last: 'Johnson',
    username: 'emilyj',
    state: 'NY',
    cases: [
      {
        practice: 'immigration.green_card',
        title: 'Marriage-based green card for my husband',
        description:
          'My husband is from Brazil and entered on a tourist visa; we married in March. We need help preparing the I-130 and I-485 package and getting ready for the interview in New York.',
        budget: 2500,
        photos: ['passport.jpg'],
      },
      {
        practice: 'employment_and_labor.wrongful_termination',
        title: 'Fired two weeks after reporting unpaid overtime',
        description:
          'I reported unpaid overtime to HR and was let go two weeks later with no written reason. I have emails and pay stubs. I want to know if this is retaliation and what my options are.',
        budget: null,
        photos: [],
      },
    ],
  },
  {
    phone: '+13125550202',
    first: 'Michael',
    last: 'Brown',
    username: 'mbrown',
    state: 'CA',
    cases: [
      {
        practice: 'traffic_tickets.speeding',
        title: 'Speeding ticket 84 in a 65 on I-5',
        description:
          'I got a ticket for 84 mph in a 65 zone near Sacramento. It is my first ticket in 10 years and I drive for work, so I want to avoid points on my license. Court date is next month.',
        budget: 450,
        photos: [],
      },
      {
        practice: 'family_law.child_custody',
        title: 'Modify custody schedule after moving closer to school',
        description:
          'My ex and I share custody of our 8-year-old daughter. I moved 5 minutes from her school and want more weekdays. We agree on most things but need a proper modification filed with the court.',
        budget: 3000,
        photos: ['family.jpg'],
      },
      {
        practice: 'dui_and_dwi.first_offense_dui',
        title: 'First DUI arrest, need help with DMV hearing',
        description:
          'I was stopped after a birthday dinner and blew 0.09. It is my first offense. I need help with the DMV hearing and keeping my license for work.',
        budget: null,
        photos: [],
      },
    ],
  },
  {
    phone: '+13125550203',
    first: 'Kevin',
    last: 'Walsh',
    username: 'kwalsh',
    state: 'IL',
    cases: [
      {
        practice: 'traffic_tickets.speeding',
        title: 'Speeding 26 over in a construction zone',
        description:
          'I was ticketed on I-90 near Rosemont for 26 mph over in a work zone. I heard this can mean a suspension in Illinois. I need someone to go to court in Cook County with me and try for supervision.',
        budget: 750,
        photos: [],
      },
      {
        practice: 'traffic_tickets.cdl_violations',
        title: 'CDL driver: lane violation ticket, job at risk',
        description:
          'I drive a truck for a Chicago logistics company. I got an improper lane usage ticket in Will County. My employer says another violation could cost me the job. Looking for a lawyer who handles CDL cases.',
        budget: 1200,
        photos: [],
      },
      {
        practice: 'traffic_tickets.speeding',
        title: 'Two speeding tickets within a year, license warning',
        description:
          'I received a second speeding ticket this year in DuPage County and got a letter from the Secretary of State. I want to avoid a suspension and understand options like traffic school or supervision.',
        budget: null,
        photos: [],
      },
    ],
  },
];

const now = new Date();
const inDays = (d) => new Date(now.getTime() + d * 86400000);

async function upsertUser(p, role) {
  let user = await prisma.user.findUnique({ where: { phone_e164: p.phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        role,
        first_name: p.first,
        last_name: p.last,
        phone_e164: p.phone,
        phone_verified_at: now,
        ...(role === 'client'
          ? { email: `${p.username}@demo.lawbid.test`, email_verified_at: now }
          : {}),
        identifiers: {
          create: {
            provider: 'phone',
            provider_uid: p.phone,
            verified_at: now,
          },
        },
      },
    });
  }
  if (role === 'client' && !user.email_verified_at) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { email: `${p.username}@demo.lawbid.test`, email_verified_at: now },
    });
  }
  await prisma.onboardingState.upsert({
    where: { user_id: user.id },
    create: { user_id: user.id, completed_at: now },
    update: { completed_at: now },
  });
  return user;
}

async function seedAttorney(a) {
  const u = await upsertUser(a, 'attorney');
  await prisma.attorneyProfile.upsert({
    where: { user_id: u.id },
    create: {
      user_id: u.id,
      username: a.username,
      username_lower: a.username.toLowerCase(),
      bio: a.bio,
      firm_name: a.firms[0],
      firm_names: a.firms,
      languages: a.languages,
      verification_status: 'verified',
      verified_at: now,
      verified_first_name: a.first,
      verified_last_name: a.last,
    },
    update: {},
  });
  const license = await prisma.attorneyLicense.findFirst({
    where: { attorney_id: u.id },
  });
  if (!license) {
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: a.state,
        bar_number: `${a.state}-${100000 + Math.floor(Math.random() * 899999)}`,
        license_status: 'verified',
        verified_at: now,
      },
    });
  }
  for (const code of a.practices) {
    const pa = await prisma.practiceArea.findUnique({ where: { code } });
    if (!pa) throw new Error(`practice ${code} missing`);
    const has = await prisma.attorneyPracticeArea.findFirst({
      where: { attorney_id: u.id, practice_area_id: pa.id },
    });
    if (!has) {
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: pa.id },
      });
    }
  }
  await prisma.subscription.upsert({
    where: { user_id: u.id },
    create: {
      user_id: u.id,
      status: 'active',
      price_cents: 39900,
      current_period_start: now,
      current_period_end: inDays(30),
    },
    update: { status: 'active', current_period_end: inDays(30) },
  });
  return u;
}

async function seedClient(c) {
  const u = await upsertUser(c, 'client');
  await prisma.clientProfile.upsert({
    where: { user_id: u.id },
    create: {
      user_id: u.id,
      state_code: c.state,
      preferred_languages: ['en'],
      username: c.username,
      username_lower: c.username.toLowerCase(),
    },
    update: {},
  });
  return u;
}

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${method} ${path} -> ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return json.data;
}

async function login(phone) {
  await call('POST', '/auth/otp/request', null, {
    channel: 'phone',
    identifier: phone,
  });
  const t = await call('POST', '/auth/otp/verify', null, {
    channel: 'phone',
    identifier: phone,
    code: '000000',
  });
  return t.accessToken;
}

async function upload(token, file, purpose) {
  const bytes = readFileSync(join(ART, file));
  const p = await call('POST', '/files/presign', token, {
    purpose,
    mime: 'image/jpeg',
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), file);
  const up = await fetch(p.upload.url, { method: 'POST', body: form });
  if (!up.ok) {
    throw new Error(`upload ${file}: ${up.status} ${await up.text()}`);
  }
  await call('POST', `/files/${p.fileId}/confirm`, token);
  for (let i = 0; i < 60; i++) {
    const f = await call('GET', `/files/${p.fileId}`, token);
    if (f.scanStatus === 'clean') return p.fileId;
    if (f.scanStatus === 'infected' || f.scanStatus === 'failed') {
      throw new Error(`scan ${file}: ${f.scanStatus}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`scan ${file}: timeout`);
}

const attorneyIds = [];
for (const a of ATTORNEYS) {
  const u = await seedAttorney(a);
  attorneyIds.push(u.id);
  const existing = await prisma.post.count({
    where: { author_id: u.id, deleted_at: null },
  });
  if (existing >= a.posts.length) {
    console.log(`@${a.username}: posts already there`);
    continue;
  }
  const token = await login(a.phone);
  for (const post of a.posts.slice(existing)) {
    const media = await upload(token, post.img, 'post_image');
    await call('POST', '/posts', token, {
      body: post.body,
      mediaFileIds: [media],
    });
  }
  console.log(`@${a.username}: posts published`);
}

for (const c of CLIENTS) {
  const u = await seedClient(c);
  const existing = await prisma.case.count({ where: { client_id: u.id } });
  if (existing >= c.cases.length) {
    console.log(`@${c.username}: cases already there`);
    continue;
  }
  const token = await login(c.phone);
  for (const k of c.cases.slice(existing)) {
    const pa = await prisma.practiceArea.findUnique({
      where: { code: k.practice },
    });
    const photoFileIds = [];
    for (const img of k.photos) {
      photoFileIds.push(await upload(token, img, 'case_photo'));
    }
    await call('POST', '/cases', token, {
      practiceAreaId: pa.id,
      title: k.title,
      description: k.description,
      primaryStateCode: c.state,
      budgetMode: k.budget ? 'amount' : 'clarify_later',
      ...(k.budget ? { budgetAmountDollars: k.budget } : {}),
      clientContactSharingConsent: true,
      ...(photoFileIds.length ? { photoFileIds } : {}),
    });
  }
  console.log(`@${c.username}: cases published`);
}

if (FOLLOWER_PHONE) {
  const token = await login(FOLLOWER_PHONE);
  for (const id of attorneyIds) {
    await call('POST', `/attorneys/${id}/follow`, token).catch((e) =>
      console.log(`follow ${id}: ${e.message}`),
    );
  }
  console.log(`${FOLLOWER_PHONE} follows the demo attorneys`);
}

await prisma.$disconnect();
