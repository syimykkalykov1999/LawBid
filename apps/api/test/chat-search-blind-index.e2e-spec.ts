// Must stay the first import: sets the keys before AppModule loads.
import { restoreBlindIndexEnv } from './support/blind-index-env';
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MessageBodyCipher } from '../src/common/secrets/message-body-cipher';
import { MessageSearchIndex } from '../src/common/secrets/message-search-index';
import { ChatSearchBackfillJob } from '../src/jobs/handlers/chat-search-backfill.job';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-1 (2026-10-25, package N-12b): with chat texts sealed at rest
 * (MESSAGE_ENC_KEYS) the old LIKE never matched; the blind index
 * (message_search_tokens, SEARCH_INDEX_KEY) finds them again — through the
 * real SQL on PostgreSQL: the backfill job for rows written before the
 * index, the intersection of all typed words, and nothing after delete.
 */
jest.setTimeout(120_000);

describe('Chat search over sealed texts (e2e, BUG-1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
  });

  afterAll(async () => {
    await app?.close();
    restoreBlindIndexEnv();
  });

  it('finds sealed messages by all typed words, via the backfill and the write path', async () => {
    const cipher = app.get(MessageBodyCipher);
    const index = app.get(MessageSearchIndex);
    expect(cipher.enabled).toBe(true);
    expect(index.enabled).toBe(true);
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const cli = await prisma.user.create({
      data: { role: 'client', first_name: 'Zed', last_name: 'Quill' },
    });
    const conv = await prisma.conversation.create({
      data: {
        attorney_id: att.id,
        client_id: cli.id,
        status: 'active',
        contacts_unlocked: true,
        request_status: 'accepted',
        participants: {
          create: [{ user_id: att.id }, { user_id: cli.id }],
        },
      },
    });
    const put = async (i: number, text: string) => {
      const id = randomUUID();
      return prisma.message.create({
        data: {
          id,
          conversation_id: conv.id,
          sender_id: cli.id,
          type: 'text',
          body_original: cipher.seal(text, id),
          body_display: cipher.seal(text, id),
          client_message_id: `bi-${conv.id}-${i}`,
          created_at: new Date(Date.now() - (10 - i) * 1000),
        },
      });
    };
    // Written "before the index": only the backfill gives it tokens.
    const old = await put(1, 'Please send the Ёлка invoice by Friday');
    // Written like a new message: tokens in the same step.
    const fresh = await put(2, 'Second note about the garage');
    await prisma.messageSearchToken.createMany({
      data: index.rowsFor(fresh, 'Second note about the garage', false),
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message_at: fresh.created_at, last_message_id: fresh.id },
    });
    // The stored text is ciphertext: the old LIKE could never match it.
    expect(old.body_display).not.toContain('invoice');

    const job = app.get(ChatSearchBackfillJob);
    await job.restart();
    const night = new Date('2026-10-26T07:00:00Z');
    for (let i = 0; i < 50; i += 1) {
      const r = await job.run(night, async () => {});
      if (!('done' in r) || r.done) break;
    }
    // please, send, елка, invoice, friday — «the» and «by» are stop-words
    // (R-24: SEARCH_STOP_WORDS are neither indexed nor required in a query);
    // 5 rows, well under the per-message cap.
    expect(
      await prisma.messageSearchToken.count({ where: { message_id: old.id } }),
    ).toBe(5);
    expect(index.maxTokens).toBeGreaterThanOrEqual(5);

    const tokens = app.get(TokenService);
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: att.id,
        role: 'attorney',
        sid: `s-${att.id}`,
        verified: true,
        subscriptionStatus: 'none',
      })}`,
    };
    const search = async (q: string) =>
      (
        (
          await request(base)
            .get('/api/v1/conversations')
            .query({ q })
            .set(auth)
            .expect(200)
        ).body as { data: { id: string; matchedMessage?: string | null }[] }
      ).data;

    const hit = await search('елка INVOICE');
    expect(hit.map((x) => x.id)).toEqual([conv.id]);
    expect(hit[0].matchedMessage).toContain('invoice');
    expect((await search('garage')).map((x) => x.id)).toEqual([conv.id]);
    // Stop-words in the query are skipped, like in the message.
    expect((await search('the invoice by Friday')).map((x) => x.id)).toEqual([
      conv.id,
    ]);
    // Every word must be in ONE message.
    expect(await search('invoice garage')).toEqual([]);
    expect(await search('invoice nonexistentword')).toEqual([]);

    // Gone from the index → gone from the search.
    await prisma.messageSearchToken.deleteMany({
      where: { message_id: old.id },
    });
    expect(await search('invoice')).toEqual([]);
  });
});
