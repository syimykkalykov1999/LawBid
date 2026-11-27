import type { AddressInfo, Server } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.service';
import {
  EICAR_SIGNATURE,
  VIRUS_SCANNER,
  type ScanVerdict,
  type VirusScanner,
} from '../src/modules/files/scanning/virus-scanner';
import { acceptInvites } from './support/group-invites';

/**
 * M3 (owner 25.11, docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md §6
 * item 1; Slack / Telegram / WhatsApp): a chat message with a file is created
 * and delivered right after the upload's `confirm`, while the antivirus still
 * checks the file. The sender sees their own file at once; everybody else
 * sees a placeholder and NEVER a link until the file is clean, then gets the
 * message again with the file. An infected file turns into «removed» for
 * everyone. 1:1 and case chats (one service) and groups.
 *
 * The scanner is a gate the test opens, so «still being checked» is certain.
 */
jest.setTimeout(120_000);

class GateScanner implements VirusScanner {
  readonly name = 'e2e-gate';
  private open = true;
  private waiting: (() => void)[] = [];

  hold(): void {
    this.open = false;
  }

  release(): void {
    this.open = true;
    for (const go of this.waiting.splice(0)) go();
  }

  async scan(data: Buffer): Promise<ScanVerdict> {
    if (!this.open) await new Promise<void>((r) => this.waiting.push(r));
    return data.includes(EICAR_SIGNATURE, 0, 'latin1')
      ? { infected: true, signature: 'Eicar-Test-Signature' }
      : { infected: false };
  }
}

type Sent = { to: string[]; event: string; payload: Record<string, unknown> };
type Media = {
  url: string | null;
  state?: string;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
};

describe('Chat file goes before its scan ends (e2e, M3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const gate = new GateScanner();
  const events: Sent[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // Every live event of the app (API and the in-process scan worker).
    // Called with the publisher as `this` (apply below).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const real = RealtimePublisher.prototype.toUsers;
    jest
      .spyOn(RealtimePublisher.prototype, 'toUsers')
      .mockImplementation(function (
        this: RealtimePublisher,
        ...args: Parameters<RealtimePublisher['toUsers']>
      ) {
        events.push({
          to: [...args[0]],
          event: args[1],
          payload: JSON.parse(JSON.stringify(args[2] ?? {})) as Record<
            string,
            unknown
          >,
        });
        return real.apply(this, args);
      });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VIRUS_SCANNER)
      .useValue(gate)
      .compile();
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
  });

  afterEach(() => gate.release());

  afterAll(async () => {
    gate.release();
    await app.close();
    jest.restoreAllMocks();
  });

  const api = () => request(base);
  const bearer = (id: string, role: 'client' | 'attorney' = 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  /** A case chat with contacts unlocked (files allowed), as in
   * owner-chat-attachments. */
  async function caseChat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Rita', last_name: 'Recipient' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Sam', last_name: 'Sender' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `scan_${attorney.id.slice(0, 8)}`,
        username_lower: `scan_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: attorney.id, status: 'active', price_cents: 39900 },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'scanlater_e2e' },
      create: {
        code: 'scanlater_e2e',
        name_en: 'Scan later e2e',
        i18n_key: 'practice.scanlater_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'scanlater_e2e.leaf' },
      create: {
        code: 'scanlater_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.e2e_scan_leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Scan case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    return {
      id: conv.id,
      client: { id: client.id, auth: bearer(client.id) },
      attorney: { id: attorney.id, auth: bearer(attorney.id, 'attorney') },
    };
  }

  /** presign → MinIO → confirm; does NOT wait for the scan. */
  async function uploadOnly(
    auth: Record<string, string>,
    bytes: Buffer,
    mime: string,
  ): Promise<string> {
    const pre = await api()
      .post('/api/v1/files/presign')
      .set(auth)
      .send({
        purpose: 'chat_attachment',
        mime,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
      .expect(201);
    const p = pre.body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }));
    const up = await fetch(p.upload.url, { method: 'POST', body: form });
    expect(up.status).toBe(204);
    await api().post(`/api/v1/files/${p.fileId}/confirm`).set(auth).expect(200);
    return p.fileId;
  }

  async function scanEnded(fileId: string): Promise<string> {
    for (let i = 0; i < 150; i += 1) {
      const f = await prisma.file.findUnique({ where: { id: fileId } });
      if (f && f.scan_status !== 'pending') return f.scan_status;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('scan did not finish');
  }

  /** The live events [userId] got for [messageId] so far. */
  const eventsFor = (userId: string, messageId: string, event: string) =>
    events.filter(
      (e) =>
        e.event === event &&
        e.to.includes(userId) &&
        (e.payload.message as { id?: string } | undefined)?.id === messageId,
    );

  async function eventually<T>(read: () => T | undefined): Promise<T> {
    for (let i = 0; i < 100; i += 1) {
      const v = read();
      if (v !== undefined) return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('the event never came');
  }

  /** A document unique to the test (no dedup with another upload). */
  const pdf = (extra = '') =>
    Buffer.from(
      `%PDF-1.7\n% ${randomBytes(8).toString('hex')}\n${extra}1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`,
      'latin1',
    );

  const attachmentOf = (m: unknown) =>
    (m as { attachment: Media | null }).attachment!;

  it('pending → clean: sent at once, the recipient gets the file only once clean', async () => {
    const c = await caseChat();
    gate.hold();
    const fileId = await uploadOnly(c.attorney.auth, pdf(), 'application/pdf');
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: fileId } }))
        .scan_status,
    ).toBe('pending');

    const clientMessageId = randomUUID();
    const sent = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .send({
        clientMessageId,
        type: 'attachment',
        fileId,
        fileName: 'Engagement.pdf',
      });
    // Before M3: 409 FILE_NOT_ATTACHABLE {scanStatus: pending}.
    expect(sent.status).toBe(201);
    const messageId = sent.body.data.id as string;
    // The sender sees their own file at once.
    expect(attachmentOf(sent.body.data)).toMatchObject({
      state: 'processing',
      mime: 'application/pdf',
      url: expect.any(String),
    });

    // The recipient: the message is there, the file is not (yet).
    const page = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .expect(200);
    const seen = (page.body.data as { id: string }[]).find(
      (m) => m.id === messageId,
    );
    expect(attachmentOf(seen)).toMatchObject({
      state: 'processing',
      url: null,
      previewUrl: null,
      mime: 'application/pdf',
    });
    const live = eventsFor(c.client.id, messageId, 'message:new');
    expect(live).toHaveLength(1);
    expect(attachmentOf(live[0].payload.message).url).toBeNull();

    // Idempotency stays: the same send again is the same message; the file
    // in a second message is still refused (pack B lock).
    const again = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .send({ clientMessageId, type: 'attachment', fileId, fileName: 'x.pdf' })
      .expect(201);
    expect(again.body.data.id).toBe(messageId);
    await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'attachment',
        fileId,
        fileName: 'y.pdf',
      })
      .expect(409);
    expect(await prisma.message.count({ where: { file_id: fileId } })).toBe(1);

    // No link reached the recipient while the file was checked.
    const beforeClean = events.filter((e) => e.to.includes(c.client.id));
    for (const e of beforeClean) {
      const m = e.payload.message as { attachment?: Media } | undefined;
      if (m?.attachment) expect(m.attachment.url).toBeNull();
    }

    gate.release();
    expect(await scanEnded(fileId)).toBe('clean');
    const updated = await eventually(() =>
      eventsFor(c.client.id, messageId, 'message:updated').find(
        (e) => attachmentOf(e.payload.message).state === 'ready',
      ),
    );
    expect(attachmentOf(updated.payload.message).url).toEqual(
      expect.any(String),
    );
    // The sender's other devices get it too.
    await eventually(
      () => eventsFor(c.attorney.id, messageId, 'message:updated')[0],
    );
    const after = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .expect(200);
    expect(
      attachmentOf(
        (after.body.data as { id: string }[]).find((m) => m.id === messageId),
      ),
    ).toMatchObject({ state: 'ready', url: expect.any(String) });
  });

  it('owner 27.11: a photo still checked has its shape for everyone (no jump)', async () => {
    const c = await caseChat();
    gate.hold();
    // A portrait photo unique to the test (no dedup with another upload).
    const png = await sharp({
      create: {
        width: 30,
        height: 40,
        channels: 3,
        background: { r: randomBytes(1)[0], g: 10, b: 20 },
      },
    })
      .png()
      .toBuffer();
    const fileId = await uploadOnly(c.attorney.auth, png, 'image/png');
    // Read from the photo's header at confirm, before the check.
    const row = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    expect(row.scan_status).toBe('pending');
    expect({ w: row.width, h: row.height }).toEqual({ w: 30, h: 40 });

    const sent = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.attorney.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'attachment',
        fileId,
        fileName: 'IMG_1.png',
      })
      .expect(201);
    const messageId = sent.body.data.id as string;
    expect(attachmentOf(sent.body.data)).toMatchObject({
      state: 'processing',
      width: 30,
      height: 40,
    });
    // The recipient: no link yet, but the shape is there.
    const page = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .expect(200);
    expect(
      attachmentOf(
        (page.body.data as { id: string }[]).find((m) => m.id === messageId),
      ),
    ).toMatchObject({ state: 'processing', url: null, width: 30, height: 40 });
    const live = eventsFor(c.client.id, messageId, 'message:new');
    expect(attachmentOf(live[0].payload.message)).toMatchObject({
      url: null,
      width: 30,
      height: 40,
    });
    gate.release();
    expect(await scanEnded(fileId)).toBe('clean');
  });

  it('pending → infected: the file is removed from the message for everyone', async () => {
    const c = await caseChat();
    gate.hold();
    const fileId = await uploadOnly(
      c.client.auth,
      pdf(`${EICAR_SIGNATURE}\n`),
      'application/pdf',
    );
    const sent = await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'attachment',
        fileId,
        fileName: 'invoice.pdf',
      })
      .expect(201);
    const messageId = sent.body.data.id as string;
    expect(
      attachmentOf(
        eventsFor(c.attorney.id, messageId, 'message:new')[0].payload.message,
      ).url,
    ).toBeNull();

    gate.release();
    expect(await scanEnded(fileId)).toBe('infected');
    for (const who of [c.attorney.id, c.client.id]) {
      const e = await eventually(() =>
        eventsFor(who, messageId, 'message:updated').find(
          (x) => attachmentOf(x.payload.message).state === 'removed',
        ),
      );
      expect(attachmentOf(e.payload.message).url).toBeNull();
    }
    for (const auth of [c.attorney.auth, c.client.auth]) {
      const page = await api()
        .get(`/api/v1/conversations/${c.id}/messages`)
        .set(auth)
        .expect(200);
      expect(
        attachmentOf(
          (page.body.data as { id: string }[]).find((m) => m.id === messageId),
        ),
      ).toMatchObject({ state: 'removed', url: null });
    }
    // An infected file is never sent again.
    await api()
      .post(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'attachment',
        fileId: await uploadOnly(
          c.client.auth,
          pdf(`${EICAR_SIGNATURE}\n`),
          'application/pdf',
        ),
        fileName: 'again.pdf',
      })
      .then((r) => {
        // Sent while pending (201) or refused once infected (409): either
        // way it is never shown.
        expect([201, 409]).toContain(r.status);
      });
  });

  it('a group: the members get the file only once clean, the sender at once', async () => {
    const owner = await prisma.user.create({
      data: { role: 'client', first_name: 'Gina', last_name: 'Group' },
    });
    const member = await prisma.user.create({
      data: { role: 'client', first_name: 'Max', last_name: 'Member' },
    });
    await prisma.contactMatch.createMany({
      data: [
        { owner_id: owner.id, matched_id: member.id },
        { owner_id: member.id, matched_id: owner.id },
      ],
      skipDuplicates: true,
    });
    const g = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Scan', type: 'closed', memberIds: [member.id] })
      .expect(201);
    const gid = g.body.data.id as string;
    await acceptInvites(api, (id) => bearer(id), gid, [member.id]);

    gate.hold();
    const fileId = await uploadOnly(bearer(owner.id), pdf(), 'application/pdf');
    const sent = await api()
      .post(`/api/v1/groups/${gid}/messages`)
      .set(bearer(owner.id))
      .send({
        clientMessageId: randomUUID(),
        type: 'attachment',
        fileId,
        fileName: 'plan.pdf',
      });
    expect(sent.status).toBe(201);
    const messageId = sent.body.data.id as string;
    expect(attachmentOf(sent.body.data)).toMatchObject({
      state: 'processing',
      url: expect.any(String),
    });
    const first = await eventually(
      () => eventsFor(member.id, messageId, 'group:message')[0],
    );
    expect(attachmentOf(first.payload.message)).toMatchObject({
      state: 'processing',
      url: null,
    });
    // The sender's own devices get their link.
    const own = await eventually(
      () => eventsFor(owner.id, messageId, 'group:message')[0],
    );
    expect(attachmentOf(own.payload.message).url).toEqual(expect.any(String));
    const page = await api()
      .get(`/api/v1/groups/${gid}/messages`)
      .set(bearer(member.id))
      .expect(200);
    const items = (page.body.data.items ?? page.body.data) as {
      id: string;
    }[];
    expect(attachmentOf(items.find((m) => m.id === messageId))).toMatchObject({
      state: 'processing',
      url: null,
    });

    gate.release();
    expect(await scanEnded(fileId)).toBe('clean');
    const ready = await eventually(() =>
      eventsFor(member.id, messageId, 'group:message').find(
        (e) => attachmentOf(e.payload.message).state === 'ready',
      ),
    );
    expect(attachmentOf(ready.payload.message).url).toEqual(expect.any(String));
  });
});
