import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21 (Telegram / WhatsApp «Переслать»): POST /messages/forward
 * — any message (chat, group, channel post) into any chats at once, through
 * each target's own send path; disappearing messages never; a group or
 * channel that restricts saving content shares only its link.
 */
jest.setTimeout(180_000);

type Who = { id: string; auth: Record<string, string> };
type Result = {
  target: { kind: string; id: string };
  sourceId: string;
  status: 'sent' | 'failed';
  code: string | null;
  messageId: string | null;
};

describe('Forward messages (e2e, owner 2026-10-21)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function client(first: string): Promise<Who> {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Fwd' },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  async function attorney(first: string): Promise<Who> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Law' },
    });
    const username = `fw${u.id.replace(/-/g, '').slice(0, 12)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: bearer(u.id, 'attorney') };
  }

  async function area() {
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'fwd_e2e' },
      create: {
        code: 'fwd_e2e',
        name_en: 'Fwd e2e',
        i18n_key: 'practice.fwd_e2e',
        sort: 0,
      },
      update: {},
    });
    return prisma.practiceArea.upsert({
      where: { code: 'fwd_e2e.leaf' },
      create: {
        code: 'fwd_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.fwd_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
  }

  /** A case chat of [c] and [a], contacts open. */
  async function conversation(c: Who, a: Who) {
    const kase = await prisma.case.create({
      data: {
        client_id: c.id,
        title: 'Forward case',
        description: 'Details',
        practice_area_id: (await area()).id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: c.id,
        attorney_id: a.id,
        status: 'active',
        contacts_unlocked: true,
        participants: { create: [{ user_id: c.id }, { user_id: a.id }] },
      },
    });
    return conv.id;
  }

  async function acceptInvite(who: Who, groupId: string) {
    const list = await api()
      .get('/api/v1/groups/invites')
      .set(who.auth)
      .expect(200);
    const invite = (list.body.data as { id: string; groupId: string }[]).find(
      (i) => i.groupId === groupId,
    );
    expect(invite).toBeDefined();
    await api()
      .post(`/api/v1/groups/invites/${invite!.id}/accept`)
      .set(who.auth)
      .expect(200);
  }

  async function group(owner: Who, members: Who[]) {
    const res = await api()
      .post('/api/v1/groups')
      .set(owner.auth)
      .send({
        title: 'Fwd team',
        type: 'closed',
        memberIds: members.map((m) => m.id),
      })
      .expect(201);
    const id = res.body.data.id as string;
    for (const m of members) await acceptInvite(m, id);
    return id;
  }

  async function channel(owner: Who) {
    const res = await api()
      .post('/api/v1/channels')
      .set(owner.auth)
      .send({
        title: 'Fwd news',
        username: `f${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      })
      .expect(201);
    return res.body.data as { id: string; username: string };
  }

  const say = async (conv: string, who: Who, body: object) =>
    (
      await api()
        .post(`/api/v1/conversations/${conv}/messages`)
        .set(who.auth)
        .send({ clientMessageId: randomUUID(), ...body })
        .expect(201)
    ).body.data as { id: string; type: string };

  const groupSay = async (groupId: string, who: Who, body: string) =>
    (
      await api()
        .post(`/api/v1/groups/${groupId}/messages`)
        .set(who.auth)
        .send({ clientMessageId: randomUUID(), type: 'text', body })
        .expect(201)
    ).body.data as { id: string };

  const forward = (who: Who, body: object) =>
    api().post('/api/v1/messages/forward').set(who.auth).send(body);

  const groupMessages = async (groupId: string, who: Who) =>
    (
      await api()
        .get(`/api/v1/groups/${groupId}/messages`)
        .set(who.auth)
        .expect(200)
    ).body.data as {
      id: string;
      type: string;
      body: string;
      forwarded: boolean;
      forwardedFrom: string | null;
      systemKind: string | null;
      systemText: string | null;
      attachment: { fileId: string } | null;
    }[];

  async function file(
    owner: Who,
    purpose: 'chat_attachment' | 'chat_voice',
    mime: string,
    put = false,
  ) {
    const s3 = app.get(S3StorageService);
    const bucket = s3.bucket('documents');
    const key = `e2e/${randomUUID()}`;
    if (put) await s3.put(bucket, key, Buffer.from('fake-image'), mime);
    return prisma.file.create({
      data: {
        owner_user_id: owner.id,
        purpose,
        s3_bucket: bucket,
        s3_key: key,
        mime,
        size_bytes: 10n,
        sha256: 'b'.repeat(64),
        scan_status: 'clean',
      },
    });
  }

  it('direct → group and channel, group → direct; idempotent; the file row shares the stored object', async () => {
    const c = await client('Vera');
    const a = await attorney('Otto');
    const conv = await conversation(c, a);
    const g = await group(c, [a]);
    const ch = await channel(a);
    const text = await say(conv, c, { body: 'hello from the case' });
    const photo = await file(c, 'chat_attachment', 'image/png', true);
    const pic = await say(conv, c, {
      type: 'attachment',
      fileId: photo.id,
      fileName: 'scan.png',
    });

    const requestId = randomUUID();
    const body = {
      requestId,
      sources: [
        { kind: 'message', id: text.id },
        { kind: 'message', id: pic.id },
      ],
      targets: [
        { kind: 'group', id: g },
        { kind: 'channel', id: ch.id },
      ],
    };
    const res = await forward(a, body).expect(200);
    const results = res.body.data.results as Result[];
    expect(results.map((r) => [r.target.kind, r.status])).toEqual([
      ['group', 'sent'],
      ['group', 'sent'],
      ['channel', 'sent'],
      ['channel', 'sent'],
    ]);

    // Group: «Forwarded from Vera Fwd», the file a new row over the same
    // stored object.
    const inGroup = (await groupMessages(g, c)).filter((m) => m.forwarded);
    expect(inGroup).toHaveLength(2);
    expect(inGroup.every((m) => m.forwardedFrom === 'Vera Fwd')).toBe(true);
    const fwdFile = inGroup.find((m) => m.type === 'attachment')!.attachment!;
    expect(fwdFile.fileId).not.toBe(photo.id);
    const row = await prisma.file.findUniqueOrThrow({
      where: { id: fwdFile.fileId },
    });
    expect(row.s3_key).toBe(photo.s3_key);
    expect(row.owner_user_id).toBe(a.id);

    // Channel: a text post and a photo post, both «Forwarded from».
    const posts = await prisma.channelPost.findMany({
      where: { channel_id: ch.id },
      orderBy: { created_at: 'asc' },
    });
    expect(posts.map((p) => p.body)).toEqual(['hello from the case', '']);
    expect(posts[1].media_file_ids).toHaveLength(1);
    expect(posts.every((p) => p.forwarded_from_name === 'Vera Fwd')).toBe(true);

    // A retry of the same forward sends nothing new.
    const files = await prisma.file.count();
    const again = await forward(a, body).expect(200);
    expect(
      (again.body.data.results as Result[]).map((r) => r.messageId),
    ).toEqual(results.map((r) => r.messageId));
    expect(await prisma.file.count()).toBe(files);
    expect(
      await prisma.channelPost.count({ where: { channel_id: ch.id } }),
    ).toBe(2);

    // Group → direct: the group author's name goes along.
    const gm = await groupSay(g, c, 'from the group');
    const back = await forward(a, {
      requestId: randomUUID(),
      sources: [{ kind: 'group_message', id: gm.id }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(200);
    const sent = (back.body.data.results as Result[])[0];
    expect(sent.status).toBe('sent');
    const msg = await prisma.message.findFirstOrThrow({
      where: { id: sent.messageId! },
    });
    expect(msg.forwarded).toBe(true);
    expect(msg.forwarded_from_name).toBe('Vera Fwd');
    expect(msg.sender_id).toBe(a.id);
  });

  it('a disappearing message is never forwarded (new and old path)', async () => {
    const c = await client('Dina');
    const a = await attorney('Abe');
    const conv = await conversation(c, a);
    const other = await conversation(c, await attorney('Bo'));
    const m = await say(conv, c, { body: 'gone soon' });
    await prisma.message.updateMany({
      where: { id: m.id },
      data: { expires_at: new Date(Date.now() + 3600_000) },
    });
    const res = await forward(c, {
      requestId: randomUUID(),
      sources: [{ kind: 'message', id: m.id }],
      targets: [{ kind: 'conversation', id: other }],
    }).expect(403);
    expect(res.body.error.code).toBe('FORWARD_NOT_ALLOWED');
    const old = await api()
      .post(`/api/v1/conversations/${other}/messages`)
      .set(c.auth)
      .send({ clientMessageId: randomUUID(), forwardFromId: m.id })
      .expect(403);
    expect(old.body.error.code).toBe('FORWARD_NOT_ALLOWED');
  });

  it("the target's own rules: closed chat, admins-only group, a voice note in a group", async () => {
    const c = await client('Rita');
    const a = await attorney('Ivan');
    const conv = await conversation(c, a);
    const closed = await conversation(c, await attorney('Cy'));
    await prisma.conversation.update({
      where: { id: closed },
      data: { status: 'closed' },
    });
    const g = await group(a, [c]);
    await api()
      .patch(`/api/v1/groups/${g}`)
      .set(a.auth)
      .send({ whoCanPost: 'admins' })
      .expect(200);
    const open = await group(c, [a]);
    const text = await say(conv, c, { body: 'pass it on' });
    const voiceFile = await file(c, 'chat_voice', 'audio/mp4');
    const voice = await say(conv, c, {
      type: 'voice',
      fileId: voiceFile.id,
      durationMs: 3000,
    });
    const res = await forward(c, {
      requestId: randomUUID(),
      sources: [
        { kind: 'message', id: text.id },
        { kind: 'message', id: voice.id },
      ],
      targets: [
        { kind: 'conversation', id: closed },
        { kind: 'group', id: g },
        { kind: 'group', id: open },
      ],
    }).expect(200);
    const by = (res.body.data.results as Result[]).map((r) => [
      r.target.id,
      r.sourceId,
      r.status,
      r.code,
    ]);
    expect(by).toEqual([
      [closed, text.id, 'failed', 'CONVERSATION_CLOSED'],
      [closed, voice.id, 'failed', 'CONVERSATION_CLOSED'],
      [g, text.id, 'failed', 'GROUP_FORBIDDEN'],
      [g, voice.id, 'failed', 'UNSUPPORTED_IN_TARGET'],
      [open, text.id, 'sent', null],
      [open, voice.id, 'failed', 'UNSUPPORTED_IN_TARGET'],
    ]);
  });

  it('a stranger cannot forward a group message; a contact card stays a card', async () => {
    const c = await client('Lena');
    const a = await attorney('Mark');
    const stranger = await client('Zed');
    const g = await group(c, [a]);
    const gm = await groupSay(g, c, 'members only');
    const conv = await conversation(stranger, a);
    await forward(stranger, {
      requestId: randomUUID(),
      sources: [{ kind: 'group_message', id: gm.id }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(404);

    const mine = await conversation(c, a);
    const other = await conversation(c, await attorney('Nina'));
    const card = await say(mine, c, { type: 'contact', contactUserId: a.id });
    const res = await forward(c, {
      requestId: randomUUID(),
      sources: [{ kind: 'message', id: card.id }],
      targets: [{ kind: 'conversation', id: other }],
    }).expect(200);
    const sent = (res.body.data.results as Result[])[0];
    expect(sent.status).toBe('sent');
    const msgs = await api()
      .get(`/api/v1/conversations/${other}/messages`)
      .set(c.auth)
      .expect(200);
    const fwd = (
      msgs.body.data as {
        id: string;
        type: string;
        contact: { userId: string } | null;
      }[]
    ).find((m) => m.id === sent.messageId)!;
    expect(fwd.type).toBe('contact');
    expect(fwd.contact?.userId).toBe(a.id);
  });

  it('protect content: admins only, a service line, no forwarding, the link instead', async () => {
    const owner = await client('Olga');
    const member = await attorney('Pete');
    const g = await group(owner, [member]);
    await api()
      .patch(`/api/v1/groups/${g}`)
      .set(member.auth)
      .send({ protectContent: true })
      .expect(403);
    const on = await api()
      .patch(`/api/v1/groups/${g}`)
      .set(owner.auth)
      .send({ protectContent: true, inviteEnabled: true })
      .expect(200);
    expect(on.body.data.protectContent).toBe(true);
    const lines = await groupMessages(g, member);
    expect(
      lines.find((m) => m.systemKind === 'protect_content')?.systemText,
    ).toBe('1');

    const gm = await groupSay(g, owner, 'secret plan');
    const conv = await conversation(await client('Quinn'), member);
    const blocked = await forward(member, {
      requestId: randomUUID(),
      sources: [{ kind: 'group_message', id: gm.id }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(403);
    expect(blocked.body.error.code).toBe('CONTENT_PROTECTED');

    // «Share» sends the invite link.
    const shared = await forward(member, {
      requestId: randomUUID(),
      sources: [{ kind: 'group_link', id: g }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(200);
    const link = (shared.body.data.results as Result[])[0];
    expect(link.status).toBe('sent');
    const msgs = await api()
      .get(`/api/v1/conversations/${conv}/messages`)
      .set(member.auth)
      .expect(200);
    const sent = (
      msgs.body.data as { id: string; body: string; forwarded: boolean }[]
    ).find((m) => m.id === link.messageId)!;
    expect(sent.body).toContain('Fwd team');
    expect(sent.body).toMatch(/\/g\/[A-Za-z0-9_-]+$/);
    // The link is the member's own message, not «Forwarded».
    expect(sent.forwarded).toBe(false);

    // Off again: a second line, forwarding works.
    await api()
      .patch(`/api/v1/groups/${g}`)
      .set(owner.auth)
      .send({ protectContent: false })
      .expect(200);
    expect(
      (await groupMessages(g, member))
        .filter((m) => m.systemKind === 'protect_content')
        .map((m) => m.systemText),
    ).toEqual(['0', '1']);
    await forward(member, {
      requestId: randomUUID(),
      sources: [{ kind: 'group_message', id: gm.id }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(200);

    // A channel: the same switch (no service post), the channel link.
    const ch = await channel(member);
    const post = await api()
      .post(`/api/v1/channels/${ch.id}/posts`)
      .set(member.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'members news' })
      .expect(201);
    const chOn = await api()
      .patch(`/api/v1/channels/${ch.id}`)
      .set(member.auth)
      .send({ protectContent: true })
      .expect(200);
    expect(chOn.body.data.protectContent).toBe(true);
    const chBlocked = await forward(member, {
      requestId: randomUUID(),
      sources: [{ kind: 'channel_post', id: post.body.data.id }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(403);
    expect(chBlocked.body.error.code).toBe('CONTENT_PROTECTED');
    const chLink = await forward(member, {
      requestId: randomUUID(),
      sources: [{ kind: 'channel_link', id: ch.id }],
      targets: [{ kind: 'conversation', id: conv }],
    }).expect(200);
    const chSent = (chLink.body.data.results as Result[])[0];
    expect(chSent.status).toBe('sent');
    const after = await api()
      .get(`/api/v1/conversations/${conv}/messages`)
      .set(member.auth)
      .expect(200);
    expect(
      (after.body.data as { id: string; body: string }[]).find(
        (m) => m.id === chSent.messageId,
      )?.body,
    ).toContain(`/c/${ch.username}`);
  });
});
