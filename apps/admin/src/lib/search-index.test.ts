import { describe, expect, it } from 'vitest';
import { phaseWord, sizeWord, swapLabel, type SearchIndexStatus } from './search-index';

const base = (o: Partial<SearchIndexStatus>): SearchIndexStatus =>
  ({
    engineConfigured: true,
    mappingVersion: 1,
    phase: null,
    source: null,
    startedAt: null,
    error: null,
    progressEntity: null,
    progressIndexed: 0,
    progressTotal: 0,
    progressDone: 0,
    verifyOk: null,
    verifiedAt: null,
    verify: [],
    retainUntil: null,
    nextSwap: null,
    canStart: true,
    canSwap: false,
    canRollback: false,
    entities: [],
    ...o,
  }) as SearchIndexStatus;

describe('search index card', () => {
  it('says the engine is not connected', () => {
    expect(phaseWord(base({ engineConfigured: false })).label).toBe('Не подключён');
  });
  it('shows progress while building', () => {
    const w = phaseWord(
      base({
        phase: 'building',
        progressEntity: 'case',
        progressIndexed: 1500,
      }),
    );
    expect(w.label).toBe('Строится');
    expect(w.line).toContain('Дела');
    expect(w.line).toContain('1500');
  });
  it('flags an outdated mapping when idle', () => {
    const w = phaseWord(
      base({
        entities: [
          {
            entity: 'case',
            readTarget: 'a',
            writeTarget: 'a',
            mappingOutdated: true,
            indexes: [],
          },
        ],
      }),
    );
    expect(w.label).toBe('Схема устарела');
  });
  it('names the swap button by step', () => {
    expect(swapLabel(base({ nextSwap: 'read' }))).toBe('Переключить чтение');
    expect(swapLabel(base({ nextSwap: 'write' }))).toBe('Переключить запись');
  });
  it('formats sizes', () => {
    expect(sizeWord(500)).toBe('500 Б');
    expect(sizeWord(2_500_000)).toBe('2.5 МБ');
  });
});
