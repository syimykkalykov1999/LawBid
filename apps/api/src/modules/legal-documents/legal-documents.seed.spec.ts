import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '../../prisma/prisma.service';
import { LegalDocumentsSeed, seedDir } from './legal-documents.seed';

const SEEDED = [
  'terms',
  'privacy',
  'attorney_agreement',
  'client_agreement',
  'eula',
  'refund',
  'cookies',
  'third_party_services',
  'partner_terms',
  'dmca_policy',
];

describe('default legal texts', () => {
  const dir = seedDir();

  it('ships a draft in English and Russian for every seeded type', () => {
    expect(dir).not.toBeNull();
    for (const type of SEEDED) {
      for (const [locale, note] of [
        ['en', 'licensed US attorney'],
        ['ru', 'лицензированным юристом США'],
      ] as const) {
        const md = readFileSync(join(dir!, `${type}.${locale}.md`), 'utf8');
        expect(md.startsWith('# ')).toBe(true);
        expect(md).toContain(note);
        expect(md.length).toBeGreaterThan(1000);
      }
    }
  });
});

describe('LegalDocumentsSeed', () => {
  function setup(
    rows: Record<string, { content_md: string; status: string }[]>,
  ) {
    const prisma = {
      legalDocument: {
        findMany: jest.fn(
          ({ where }: { where: { doc_type: string; locale: string } }) =>
            Promise.resolve(rows[`${where.doc_type}.${where.locale}`] ?? []),
        ),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return {
      prisma,
      seed: new LegalDocumentsSeed(prisma as unknown as PrismaService),
    };
  }

  it('inserts drafts where nothing but the old placeholder exists, never publishing', async () => {
    const { seed, prisma } = setup({
      'terms.en': [
        {
          content_md: '# Terms of Service\n\nPLACEHOLDER — replace',
          status: 'published',
        },
      ],
      'eula.en': [{ content_md: '# EULA real text', status: 'published' }],
      'refund.ru': [{ content_md: '# Черновик', status: 'draft' }],
    });
    const created = await seed.seed();
    // 10 types x 2 languages, minus the real eula.en and the refund.ru draft.
    expect(created).toBe(18);
    const calls = (
      prisma.legalDocument.create.mock.calls as [
        { data: Record<string, unknown> },
      ][]
    ).map(([a]) => a.data);
    expect(
      calls.every((d) => d.status === 'draft' && d.is_current === false),
    ).toBe(true);
    expect(calls.some((d) => d.doc_type === 'terms' && d.locale === 'en')).toBe(
      true,
    );
    expect(calls.some((d) => d.doc_type === 'eula' && d.locale === 'en')).toBe(
      false,
    );
  });

  it('does nothing the second time', async () => {
    const all: Record<string, { content_md: string; status: string }[]> = {};
    for (const t of SEEDED) {
      for (const l of ['en', 'ru']) {
        all[`${t}.${l}`] = [{ content_md: '# real', status: 'published' }];
      }
    }
    const { seed, prisma } = setup(all);
    expect(await seed.seed()).toBe(0);
    expect(prisma.legalDocument.create).not.toHaveBeenCalled();
  });
});
