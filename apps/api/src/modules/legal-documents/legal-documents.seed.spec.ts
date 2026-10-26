import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  LegalDocumentsSeed,
  REVISION_TAG,
  seedDir,
} from './legal-documents.seed';

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
  'accessibility',
  'community_guidelines',
  'advertising_disclosure',
  'sms_terms',
];

/** Types shipped in English only (new in 2026-10): no Russian text yet. */
const EN_ONLY = ['community_guidelines', 'advertising_disclosure', 'sms_terms'];
const hasRu = (t: string) => !EN_ONLY.includes(t);

describe('default legal texts', () => {
  const dir = seedDir();

  it('ships a draft in English (and Russian where written) for every seeded type', () => {
    expect(dir).not.toBeNull();
    for (const type of SEEDED) {
      for (const [locale, note] of [
        ['en', 'licensed'],
        ['ru', 'лицензированным юристом США'],
      ] as const) {
        if (locale === 'ru' && !hasRu(type)) continue;
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
    rows: Record<
      string,
      {
        content_md: string;
        status: string;
        id?: string;
        version?: string;
        change_note?: string;
      }[]
    >,
  ) {
    const prisma = {
      legalDocument: {
        findMany: jest.fn(
          ({ where }: { where: { doc_type: string; locale: string } }) =>
            Promise.resolve(rows[`${where.doc_type}.${where.locale}`] ?? []),
        ),
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: { doc_type: string; locale: string; is_current?: boolean };
          }) => {
            const list = rows[`${where.doc_type}.${where.locale}`] ?? [];
            return Promise.resolve(
              where.is_current
                ? (list.find((r) => r.status === 'published') ?? null)
                : (list.find((r) => r.status === 'draft') ?? null),
            );
          },
        ),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
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
          id: 't1',
          version: '1.0',
        },
      ],
      'eula.en': [{ content_md: '# EULA real text', status: 'published' }],
      'refund.ru': [{ content_md: '# Черновик', status: 'draft' }],
    });
    const created = await seed.seed();
    // 11 types x 2 languages + disclaimer.en, minus the real eula.en and the
    // refund.ru draft (owner 2026-10-22: + accessibility), plus the three
    // English-only types of 2026-10 (community guidelines, advertising
    // disclosure, SMS terms).
    expect(created).toBe(24);
    const calls = (
      prisma.legalDocument.create.mock.calls as [
        { data: Record<string, unknown> },
      ][]
    )
      .map(([a]) => a.data)
      // The placeholder of a consent document is published over (below).
      .filter((d) => d.status !== 'published');
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

  it('publishes real text over a placeholder of a consent document, and over nothing else', async () => {
    const { seed, prisma } = setup({
      'terms.en': [
        {
          content_md: '# Terms\n\nPLACEHOLDER — replace',
          status: 'published',
          id: 't1',
          version: '1.0',
        },
      ],
      'privacy.en': [
        { content_md: '# Privacy (owner text)', status: 'published', id: 'p1' },
      ],
    });
    expect(await seed.publishOverPlaceholders()).toBe(1);
    const created = (
      prisma.legalDocument.create.mock.calls as [
        { data: Record<string, unknown> },
      ][]
    ).map(([a]) => a.data);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      doc_type: 'terms',
      locale: 'en',
      status: 'published',
      is_current: true,
    });
    expect(String(created[0].content_md)).toContain('Terms of Service');
    expect(prisma.legalDocument.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { is_current: false, status: 'archived' },
    });
  });

  it('does nothing the second time', async () => {
    const all: Record<
      string,
      { content_md: string; status: string; change_note?: string }[]
    > = {};
    for (const t of SEEDED) {
      for (const l of hasRu(t) ? ['en', 'ru'] : ['en']) {
        all[`${t}.${l}`] = [
          {
            content_md: '# real',
            status: 'published',
            change_note: REVISION_TAG,
          },
        ];
      }
    }
    all['disclaimer.en'] = [{ content_md: '# real', status: 'published' }];
    const { seed, prisma } = setup(all);
    expect(await seed.seed()).toBe(0);
    expect(prisma.legalDocument.create).not.toHaveBeenCalled();
  });

  it('puts the improved English text in as a new draft where the owner published an older one, once', async () => {
    const { seed, prisma } = setup({
      'privacy.en': [{ content_md: '# Old owner text', status: 'published' }],
      // The owner already has a draft: left alone.
      'terms.en': [
        { content_md: '# Old', status: 'published' },
        { content_md: '# Owner draft', status: 'draft' },
      ],
      // Seen before (published after being a draft): not created again.
      'sms_terms.en': [
        {
          content_md: '# Edited',
          status: 'published',
          change_note: `${REVISION_TAG} x`,
        },
      ],
    });
    expect(await seed.seedRevisions()).toBe(1);
    const data = (
      prisma.legalDocument.create.mock.calls as [
        { data: Record<string, unknown> },
      ][]
    )[0][0].data;
    expect(data).toMatchObject({
      doc_type: 'privacy',
      locale: 'en',
      status: 'draft',
      is_current: false,
    });
    expect(String(data.change_note)).toContain(REVISION_TAG);
  });
});
