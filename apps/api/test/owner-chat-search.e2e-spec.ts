import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-18: GET /conversations?q= — the other person's name in any
 * alphabet («Эмили» = Emily), @username, case title, or message text.
 */
jest.setTimeout(120_000);

describe('Chat list search (e2e, owner 2026-10-18)', () => {
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
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: `s-${id}`,
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function chat(
    attorneyId: string,
    clientId: string,
    caseId: string | null,
    texts: string[],
    unlocked = true,
  ) {
    const conv = await prisma.conversation.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        client_id: clientId,
        status: 'active',
        contacts_unlocked: unlocked,
        request_status: caseId ? 'none' : 'accepted',
        participants: {
          create: [{ user_id: attorneyId }, { user_id: clientId }],
        },
      },
    });
    let last = conv.id;
    let at = new Date();
    for (const [i, t] of texts.entries()) {
      at = new Date(Date.now() - (texts.length - i) * 1000);
      const m = await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: clientId,
          type: 'text',
          body_original: t,
          body_display: t,
          client_message_id: `m-${conv.id}-${i}`,
          created_at: at,
        },
      });
      last = m.id;
    }
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message_at: at, last_message_id: last },
    });
    return conv.id;
  }

  it('finds chats by name across alphabets, @username, case title and message text', async () => {
    const tag = randomUUID().slice(0, 6);
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const emily = await prisma.user.create({
      data: { role: 'client', first_name: 'Emily', last_name: 'Zvorykina' },
    });
    const bob = await prisma.user.create({
      data: { role: 'client', first_name: 'Bob', last_name: 'Stone' },
    });
    const hidden = await prisma.user.create({
      data: { role: 'client', first_name: 'Hidden', last_name: 'Person' },
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    await prisma.clientProfile.create({
      data: {
        user_id: bob.id,
        state_code: 'NJ',
        username: `bobby${tag}`,
        username_lower: `bobby${tag}`,
      },
    });
    const area = await prisma.practiceArea.findFirstOrThrow({
      where: { code: 'family_law' },
    });
    const mkCase = (client: string, title: string) =>
      prisma.case.create({
        data: {
          client_id: client,
          title,
          description: 'Some description',
          practice_area_id: area.id,
          primary_state_code: 'NJ',
          budget_mode: 'clarify_later',
        },
      });
    const cEmily = await chat(att.id, emily.id, null, ['Привет']);
    const cBob = await chat(att.id, bob.id, null, [
      'First',
      'Please send the Ёлка invoice by Friday, thank you so much',
    ]);
    const k = await mkCase(hidden.id, `Garage dispute ${tag}`);
    const cHidden = await chat(att.id, hidden.id, k.id, ['ok'], false);
    const auth = bearer(att.id, 'attorney');
    const search = async (q: string) => {
      const res = await api()
        .get('/api/v1/conversations')
        .query({ q })
        .set(auth)
        .expect(200);
      return (
        res.body as {
          data: { id: string; matchedMessage?: string | null }[];
        }
      ).data;
    };

    // Cyrillic query finds the Latin name; the name hit has no snippet.
    const byName = await search('Эмили');
    expect(byName.map((x) => x.id)).toEqual([cEmily]);
    expect(byName[0].matchedMessage).toBeNull();
    expect((await search('zvorykina emily')).map((x) => x.id)).toEqual([
      cEmily,
    ]);
    // @username (leading @ ignored).
    expect((await search(`@bobby${tag}`)).map((x) => x.id)).toEqual([cBob]);
    // Message text: accents / ё / case-insensitive, with a snippet.
    const byText = await search('елка INVOICE');
    expect(byText.map((x) => x.id)).toEqual([cBob]);
    expect(byText[0].matchedMessage).toContain('invoice');
    expect((byText[0].matchedMessage ?? '').length).toBeLessThanOrEqual(82);
    expect(await search('invoice nonexistentword')).toEqual([]);
    // Case title.
    expect((await search(`garage ${tag}`)).map((x) => x.id)).toEqual([cHidden]);
    // The client behind an unlocked-less case chat cannot be found by name.
    expect(await search('Hidden Person')).toEqual([]);
    // Without q nothing changes and no snippet is returned.
    const all = await api().get('/api/v1/conversations').set(auth).expect(200);
    const rows = (all.body as { data: Record<string, unknown>[] }).data;
    expect(rows).toHaveLength(3);
    expect(rows[0].matchedMessage).toBeUndefined();
    // Validation: blank / too long q.
    await api()
      .get('/api/v1/conversations')
      .query({ q: ' ' })
      .set(auth)
      .expect(400);
    await api()
      .get('/api/v1/conversations')
      .query({ q: 'x'.repeat(101) })
      .set(auth)
      .expect(400);
    // Another attorney's search never sees these chats.
    const other = await prisma.user.create({ data: { role: 'attorney' } });
    const res = await api()
      .get('/api/v1/conversations')
      .query({ q: 'Эмили' })
      .set(bearer(other.id, 'attorney'))
      .expect(200);
    expect((res.body as { data: unknown[] }).data).toEqual([]);
  });
});
