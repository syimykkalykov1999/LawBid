import type { PrismaService } from '../../prisma/prisma.service';
import {
  cleanTerm,
  SearchSynonymsService,
  uniqueTerms,
} from './search-synonyms.service';

const FAMILY = 'pa-family';
const DIVORCE = 'pa-divorce';
const IMMIGRATION = 'pa-immigration';
const LEARNED_TOPIC = 'pa-tax';

function service(): SearchSynonymsService {
  const prisma = {
    searchSynonymGroup: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'g1', key: 'divorce', practice_area_id: DIVORCE },
        { id: 'g2', key: 'family', practice_area_id: FAMILY },
        { id: 'g3', key: 'green-card', practice_area_id: IMMIGRATION },
        { id: 'g4', key: 'no-topic', practice_area_id: null },
      ]),
    },
    searchSynonymTerm: {
      findMany: jest.fn().mockResolvedValue([
        { group_id: 'g1', term: 'divorce' },
        { group_id: 'g1', term: 'расторжение брака' },
        { group_id: 'g1', term: 'развод' },
        { group_id: 'g1', term: 'муж бьёт' },
        { group_id: 'g2', term: 'семейное право' },
        { group_id: 'g3', term: 'green card' },
        { group_id: 'g3', term: 'вид на жительство' },
        { group_id: 'g4', term: 'абракадабра' },
      ]),
    },
    practiceArea: {
      findMany: jest.fn().mockResolvedValue([
        { id: FAMILY, parent_id: null },
        { id: DIVORCE, parent_id: FAMILY },
        { id: IMMIGRATION, parent_id: null },
        { id: LEARNED_TOPIC, parent_id: null },
      ]),
    },
    searchLearnedLink: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ q: 'налог', practice_area_id: LEARNED_TOPIC }]),
    },
  };
  return new SearchSynonymsService(prisma as unknown as PrismaService);
}

const NOTHING = { groupKeys: [], practiceIds: [] };

describe('SearchSynonymsService.resolve', () => {
  it('a phrase in another language names the same topic', async () => {
    const m = await service().resolve('Расторжение брака');
    expect(m.groupKeys).toEqual(['divorce']);
    expect(m.practiceIds).toEqual([DIVORCE]);
  });

  it('finds a term inside a longer sentence', async () => {
    const m = await service().resolve('хочу быстрый развод с мужем');
    expect(m.groupKeys).toContain('divorce');
  });

  it('an everyday phrase finds the topic', async () => {
    const m = await service().resolve('муж бьёт меня');
    expect(m.groupKeys).toEqual(['divorce']);
  });

  it('a group on a category covers its subcategories', async () => {
    const m = await service().resolve('семейное право');
    expect(m.practiceIds.sort()).toEqual([DIVORCE, FAMILY].sort());
  });

  it('a prefix of a term matches while typing (4+ letters)', async () => {
    const m = await service().resolve('расторж');
    expect(m.groupKeys).toEqual(['divorce']);
    await expect(service().resolve('рас')).resolves.toEqual(NOTHING);
  });

  it('a group without a topic names no practice', async () => {
    const m = await service().resolve('абракадабра');
    expect(m).toEqual({ groupKeys: ['no-topic'], practiceIds: [] });
  });

  it('topics learned from clicks join the answer', async () => {
    const m = await service().resolve('налог');
    expect(m.practiceIds).toEqual([LEARNED_TOPIC]);
  });

  it('unknown and too short queries find nothing', async () => {
    const s = service();
    await expect(s.resolve('zzzzzz')).resolves.toEqual(NOTHING);
    await expect(s.resolve('ab')).resolves.toEqual(NOTHING);
  });

  it('a broken dictionary never breaks the search', async () => {
    const prisma = {
      searchSynonymGroup: {
        findMany: jest.fn().mockRejectedValue(new Error('db down')),
      },
      searchSynonymTerm: { findMany: jest.fn().mockResolvedValue([]) },
      practiceArea: { findMany: jest.fn().mockResolvedValue([]) },
      searchLearnedLink: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const s = new SearchSynonymsService(prisma as unknown as PrismaService);
    await expect(s.resolve('divorce')).resolves.toEqual(NOTHING);
  });

  it('an edit is visible at once after invalidate()', async () => {
    const s = service();
    await s.resolve('divorce');
    s.invalidate();
    await expect(s.resolve('divorce')).resolves.toMatchObject({
      groupKeys: ['divorce'],
    });
  });
});

describe('phrases are stored clean', () => {
  it('trims, lowercases and drops duplicates and one-letter junk', () => {
    expect(cleanTerm({ lang: 'RU', term: '  Развод   с  мужем ' })).toEqual({
      lang: 'ru',
      term: 'развод с мужем',
    });
    expect(cleanTerm({ lang: 'en', term: ' a ' })).toBeNull();
    expect(
      uniqueTerms([
        { lang: 'en', term: 'Divorce' },
        { lang: 'en', term: ' divorce ' },
        { lang: 'ru', term: 'divorce' },
      ]),
    ).toHaveLength(2);
  });
});
