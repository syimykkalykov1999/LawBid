import type { AddressInfo, Server } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import {
  EICAR_SIGNATURE,
  VIRUS_SCANNER,
  type ScanVerdict,
  type VirusScanner,
} from '../src/modules/files/scanning/virus-scanner';
import { decryptE2eeFile } from '../src/modules/chat/e2ee/e2ee-file';
import {
  encryptE2eeFile,
  MlsDeviceClient,
  type Http,
} from './support/mls-client';

/**
 * Item 25, PR 4 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §4–§6):
 * - an encrypted file: the phone encrypts it (AES-256-GCM segments), the
 *   server stores only ciphertext and hands the chat's members a link, the
 *   key travels inside the MLS message;
 * - a report from an encrypted chat (WhatsApp: the last messages): each is
 *   checked against its franking tag (Messenger), a forged one is marked
 *   unverified, a reported file goes through the antivirus;
 * - the encrypted backup pointer: one per person, a new one replaces the
 *   old file.
 */
jest.setTimeout(180_000);

class EicarScanner implements VirusScanner {
  readonly name = 'e2e-eicar';
  scanned = 0;
  scan(data: Buffer): Promise<ScanVerdict> {
    this.scanned += 1;
    return Promise.resolve(
      data.includes(EICAR_SIGNATURE, 0, 'latin1')
        ? { infected: true, signature: 'Eicar-Test-Signature' }
        : { infected: false },
    );
  }
}

describe('Encrypted files, reports and backups (e2e, item 25 PR 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const scanner = new EicarScanner();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VIRUS_SCANNER)
      .useValue(scanner)
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

  afterAll(async () => {
    await app.close();
  });

  const bearer = (id: string, role: 'client' | 'attorney') =>
    `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`;

  const http = (auth: string): Http => ({
    post: async (path, body) => {
      const r = await request(base)
        .post(path)
        .set('Authorization', auth)
        .send(body as object);
      return { status: r.status, body: r.body as { data?: unknown } };
    },
    get: async (path) => {
      const r = await request(base).get(path).set('Authorization', auth);
      return { status: r.status, body: r.body as { data?: unknown } };
    },
    del: async (path) => {
      const r = await request(base).delete(path).set('Authorization', auth);
      return { status: r.status };
    },
  });

  async function pair() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Bob', last_name: 'Client' },
    });
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Ann', last_name: 'Attorney' },
    });
    await prisma.subscription.create({
      data: { user_id: att.id, status: 'active', price_cents: 39900 },
    });
    const conv = await prisma.conversation.create({
      data: {
        client_id: client.id,
        attorney_id: att.id,
        status: 'active',
        contacts_unlocked: true,
        pair_kind: 'attorney_client',
        participants: {
          create: [{ user_id: client.id }, { user_id: att.id }],
        },
      },
    });
    const auth = {
      alice: bearer(att.id, 'attorney'),
      bob: bearer(client.id, 'client'),
    };
    const alice = new MlsDeviceClient(http(auth.alice), att.id);
    const bob = new MlsDeviceClient(http(auth.bob), client.id);
    await alice.register();
    await bob.register();
    expect((await alice.createGroup(conv.id)).status).toBe(201);
    expect((await alice.commit(conv.id, [bob.deviceId])).status).toBe(201);
    await bob.takeWelcomes();
    return {
      conv: conv.id,
      alice,
      bob,
      auth,
      aliceId: att.id,
      bobId: client.id,
    };
  }

  /** presign → storage → confirm of an encrypted blob. */
  async function upload(
    auth: string,
    purpose: 'chat_e2ee' | 'chat_backup_e2ee',
    blob: Buffer,
  ): Promise<string> {
    const pre = await request(base)
      .post('/api/v1/files/presign')
      .set('Authorization', auth)
      .send({
        purpose,
        mime: 'application/vnd.lawbid.e2ee',
        sizeBytes: blob.length,
        sha256: createHash('sha256').update(blob).digest('hex'),
      })
      .expect(201);
    const p = pre.body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(blob)]));
    const up = await fetch(p.upload.url, { method: 'POST', body: form });
    expect(up.status).toBe(204);
    await request(base)
      .post(`/api/v1/files/${p.fileId}/confirm`)
      .set('Authorization', auth)
      .expect(200);
    return p.fileId;
  }

  it('an encrypted file: ciphertext on the server, the member decrypts it with the key from the message', async () => {
    const { conv, alice, bob, auth } = await pair();
    const secret = Buffer.from(
      `Contract draft ${randomUUID()} `.repeat(5000),
      'utf8',
    ); // > one 64 KiB segment
    const key = randomBytes(32);
    const blob = encryptE2eeFile(secret, key);
    const fileId = await upload(auth.alice, 'chat_e2ee', blob);
    // Never held back for a scan the server cannot do.
    const row = await prisma.file.findUnique({ where: { id: fileId } });
    expect(row?.scan_status).toBe('clean');
    const { res } = await alice.sendFranked(
      conv,
      {
        t: 'file',
        name: 'draft.txt',
        mime: 'text/plain',
        fk: key.toString('base64'),
      },
      { fileId },
    );
    expect(res.status).toBe(201);
    const list = await request(base)
      .get(`/api/v1/conversations/${conv}/messages`)
      .set('Authorization', auth.bob)
      .expect(200);
    const items = (list.body.data.items ?? list.body.data) as {
      id: string;
      blobUrl: string | null;
      ciphertext: string;
    }[];
    const m = items.find((x) => x.blobUrl)!;
    expect(m).toBeDefined();
    const payload = JSON.parse(await bob.decrypt(conv, m.ciphertext)) as {
      fk: string;
      name: string;
    };
    expect(payload.name).toBe('draft.txt');
    const got = Buffer.from(await (await fetch(m.blobUrl!)).arrayBuffer());
    expect(got.includes(secret.subarray(0, 40))).toBe(false);
    expect(
      decryptE2eeFile(got, Buffer.from(payload.fk, 'base64')).equals(secret),
    ).toBe(true);
  });

  it('a report carries the last messages; franking tells real ones from forged ones; a reported file is scanned', async () => {
    const { conv, alice, bob, auth, aliceId } = await pair();
    const one = await alice.sendFranked(conv, {
      t: 'text',
      b: 'pay me off the platform',
    });
    const two = await alice.sendFranked(conv, { t: 'text', b: 'or else' });
    const eicarKey = randomBytes(32);
    const eicarFile = await upload(
      auth.alice,
      'chat_e2ee',
      encryptE2eeFile(Buffer.from(EICAR_SIGNATURE, 'latin1'), eicarKey),
    );
    const three = await alice.sendFranked(
      conv,
      { t: 'file', name: 'x.com', fk: eicarKey.toString('base64') },
      { fileId: eicarFile },
    );
    const ids = [one, two, three].map(
      (s) => (s.res.body.data as { id: string }).id,
    );
    // Bob forges the second one before reporting.
    const forged = two.plaintext.replace('or else', 'I will hurt you');
    const report = await request(base)
      .post(`/api/v1/e2ee/conversations/${conv}/reports`)
      .set('Authorization', auth.bob)
      .send({
        reportedUserId: aliceId,
        reason: 'harassment',
        messages: [
          {
            messageId: ids[0],
            plaintext: Buffer.from(one.plaintext).toString('base64'),
          },
          {
            messageId: ids[1],
            plaintext: Buffer.from(forged).toString('base64'),
          },
          {
            messageId: ids[2],
            plaintext: Buffer.from(three.plaintext).toString('base64'),
          },
        ],
      })
      .expect(201);
    expect(report.body.data).toMatchObject({ verified: 2, total: 3 });
    const r = await prisma.report.findUnique({
      where: { id: report.body.data.reportId },
      include: { e2ee_evidence: true },
    });
    expect(r?.target_type).toBe('user');
    expect(r?.target_id).toBe(aliceId);
    expect(r?.priority_review).toBe(true); // the antivirus found the file
    const verified = new Map(
      r!.e2ee_evidence.map((e) => [e.message_id, e.verified]),
    );
    expect(verified.get(ids[0])).toBe(true);
    expect(verified.get(ids[1])).toBe(false);
    void bob;
    // More than chat.e2ee_report_messages (5) is refused.
    const many = Array.from({ length: 6 }, () => ({
      messageId: ids[0],
      plaintext: Buffer.from(one.plaintext).toString('base64'),
    }));
    await request(base)
      .post(`/api/v1/e2ee/conversations/${conv}/reports`)
      .set('Authorization', auth.bob)
      .send({ reportedUserId: aliceId, reason: 'spam', messages: many })
      .expect(400);
  });

  it('the encrypted backup: one per person, a new one replaces the old file', async () => {
    const { auth } = await pair();
    await request(base)
      .get('/api/v1/e2ee/backup')
      .set('Authorization', auth.bob)
      .expect(404);
    const key = randomBytes(32);
    const first = await upload(
      auth.bob,
      'chat_backup_e2ee',
      encryptE2eeFile(Buffer.from('{"messages":[]}'), key),
    );
    const put = await request(base)
      .post('/api/v1/e2ee/backup')
      .set('Authorization', auth.bob)
      .send({ fileId: first })
      .expect(200);
    expect(put.body.data.fileId).toBe(first);
    const blob = Buffer.from(
      await (await fetch(put.body.data.url as string)).arrayBuffer(),
    );
    expect(decryptE2eeFile(blob, key).toString()).toBe('{"messages":[]}');
    const second = await upload(
      auth.bob,
      'chat_backup_e2ee',
      encryptE2eeFile(Buffer.from('{"messages":[1]}'), key),
    );
    await request(base)
      .post('/api/v1/e2ee/backup')
      .set('Authorization', auth.bob)
      .send({ fileId: second })
      .expect(200);
    const old = await prisma.file.findUnique({ where: { id: first } });
    expect(old?.deleted_at).not.toBeNull();
    // Someone else's backup file cannot be claimed.
    await request(base)
      .post('/api/v1/e2ee/backup')
      .set('Authorization', auth.alice)
      .send({ fileId: second })
      .expect((r) => expect([403, 404, 409]).toContain(r.status));
  });
});
