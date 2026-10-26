import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-18: templates search takes words, not one literal piece —
 * every word (in any order) is in the title or the description.
 */
jest.setTimeout(60_000);

describe('Document templates: word search (e2e, owner 2026-10-18)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds a template by two words in reverse order, one in the description', async () => {
    const tag = randomUUID().slice(0, 8);
    const owner = await prisma.user.create({ data: { role: 'attorney' } });
    const make = async (title: string, description: string) => {
      const f = await prisma.file.create({
        data: {
          owner_user_id: owner.id,
          purpose: 'document_template',
          s3_bucket: 'test',
          s3_key: `templates/${randomUUID()}.pdf`,
          mime: 'application/pdf',
          size_bytes: 100n,
          sha256: randomUUID().replace(/-/g, ''),
          scan_status: 'clean',
        },
      });
      const t = await prisma.documentTemplate.create({
        data: {
          file_id: f.id,
          file_name: `${title}.pdf`,
          title,
          description,
          is_published: true,
        },
      });
      return t.id;
    };
    const lease = await make(`Residential lease ${tag}`, 'For landlords');
    const retainer = await make(`Retainer ${tag}`, 'Lease deposit terms');
    await make(`Power of attorney ${tag}`, 'General');

    const client = await prisma.user.create({ data: { role: 'client' } });
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: client.id,
        role: 'client',
        sid: randomUUID(),
        verified: true,
        subscriptionStatus: 'none',
      })}`,
    };
    const found = async (q: string) => {
      const r = await request(baseUrl)
        .get('/api/v1/document-templates')
        .query({ q })
        .set(auth)
        .expect(200);
      return (r.body.data as { id: string }[]).map((x) => x.id).sort();
    };
    // Reverse order, both words in the title.
    expect(await found(`${tag} lease residential`)).toEqual([lease]);
    // One word in the title, the other in the description.
    expect(await found(`deposit ${tag}`)).toEqual([retainer]);
    // Case-insensitive; the whole text as one piece is not required.
    expect(await found(`LEASE ${tag}`)).toEqual([lease, retainer].sort());
    // Every word must be present.
    expect(await found(`lease ${tag} nonexistent`)).toEqual([]);
  });
});
