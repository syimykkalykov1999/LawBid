import {
  canRollback,
  canStart,
  canSwapRead,
  canSwapWrite,
  countsAgree,
  dualWriteTargets,
  nextGeneration,
  sameDoc,
  sampleAgrees,
  type AliasReindexState,
} from './search-alias';
import type { EntityLayout } from './opensearch.client';
import {
  generationOf,
  physicalIndex,
  readAlias,
  templateBody,
  writeAlias,
} from './search-engine.mappings';

const base = (phase: AliasReindexState['phase']): AliasReindexState => ({
  id: 'x',
  phase,
  source: 'postgres',
  startedAt: '',
  updatedAt: '',
  entities: ['case', 'tag'],
  targets: {
    case: { index: 'lb-case-v2', prev: 'lb-case-v1' },
    tag: { index: 'lb-tag-v2', prev: 'lb-tag-v1' },
  },
  progress: {
    entity: null,
    after: null,
    indexed: 0,
    task: null,
    taskTotal: 0,
    taskDone: 0,
  },
  verify: null,
  discard: [],
  error: null,
});

describe('alias names', () => {
  it('builds read, write and physical names and parses generations', () => {
    expect(readAlias('lb', 'case')).toBe('lb-case');
    expect(writeAlias('lb', 'case')).toBe('lb-case-write');
    expect(physicalIndex('lb', 'case', 3)).toBe('lb-case-v3');
    expect(generationOf('lb', 'case', 'lb-case-v12')).toBe(12);
    expect(generationOf('lb', 'case', 'lb-case-write')).toBeNull();
    expect(generationOf('lb', 'case', 'lb-case-v0')).toBeNull();
    expect(generationOf('lb', 'case', 'lb-post-v1')).toBeNull();
  });

  it('the index template covers every generation and carries the mapping revision', () => {
    const t = templateBody('lb', 'post') as {
      index_patterns: string[];
      template: { mappings: { _meta: { mapping_version: number } } };
    };
    expect(t.index_patterns).toEqual(['lb-post-v*']);
    expect(t.template.mappings._meta.mapping_version).toBeGreaterThan(0);
  });
});

describe('nextGeneration', () => {
  const l = (gens: number[]): EntityLayout => ({
    entity: 'case',
    indexes: gens.map((g) => ({
      name: `lb-case-v${g}`,
      generation: g,
      docs: 0,
      sizeBytes: 0,
    })),
    readTarget: null,
    writeTarget: null,
  });
  it('is one above the highest, also with gaps', () => {
    expect(nextGeneration(l([]))).toBe(1);
    expect(nextGeneration(l([1]))).toBe(2);
    expect(nextGeneration(l([1, 4]))).toBe(5);
  });
});

describe('phase guards', () => {
  it('allows a start only when nothing is in flight', () => {
    expect(canStart(null)).toBe(true);
    for (const p of ['building', 'built', 'read_swapped'] as const) {
      expect(canStart(base(p))).toBe(false);
    }
    for (const p of [
      'write_swapped',
      'completed',
      'rolled_back',
      'cancelled',
    ] as const) {
      expect(canStart(base(p))).toBe(true);
    }
  });
  it('swaps read only after built, write only after the read swap', () => {
    expect(canSwapRead(base('built'))).toBe(true);
    expect(canSwapRead(base('building'))).toBe(false);
    expect(canSwapWrite(base('read_swapped'))).toBe(true);
    expect(canSwapWrite(base('built'))).toBe(false);
  });
  it('rolls back from any live phase, not from a finished one', () => {
    for (const p of [
      'building',
      'built',
      'read_swapped',
      'write_swapped',
    ] as const) {
      expect(canRollback(base(p))).toBe(true);
    }
    expect(canRollback(base('completed'))).toBe(false);
    expect(canRollback(null)).toBe(false);
  });
});

describe('dualWriteTargets', () => {
  it('writes to the new generation while building, built and read-swapped', () => {
    for (const p of ['building', 'built', 'read_swapped'] as const) {
      expect(dualWriteTargets(base(p))).toEqual({
        case: ['lb-case-v2'],
        tag: ['lb-tag-v2'],
      });
    }
  });
  it('keeps the old generation warm after the write swap, then stops', () => {
    expect(dualWriteTargets(base('write_swapped'))).toEqual({
      case: ['lb-case-v1'],
      tag: ['lb-tag-v1'],
    });
    expect(dualWriteTargets(base('completed'))).toEqual({});
    expect(dualWriteTargets(base('rolled_back'))).toEqual({});
    expect(dualWriteTargets(null)).toEqual({});
  });
});

describe('verification rules', () => {
  it('counts may differ by max(5, 1 %)', () => {
    expect(countsAgree(100, 104)).toBe(true);
    expect(countsAgree(100, 110)).toBe(false);
    expect(countsAgree(10_000, 10_090)).toBe(true);
    expect(countsAgree(10_000, 10_200)).toBe(false);
  });
  it('compares documents ignoring key order and scalar array order', () => {
    expect(
      sameDoc(
        { a: 1, tags: ['x', 'y'], d: new Date('2026-01-01T00:00:00Z') },
        { tags: ['y', 'x'], d: '2026-01-01T00:00:00.000Z', a: 1 },
      ),
    ).toBe(true);
    expect(sameDoc({ a: 1 }, { a: 2 })).toBe(false);
  });
  it('tolerates at most 2 % wrong samples', () => {
    expect(sampleAgrees(100, 2)).toBe(true);
    expect(sampleAgrees(100, 3)).toBe(false);
    expect(sampleAgrees(10, 0)).toBe(true);
    expect(sampleAgrees(10, 1)).toBe(false);
  });
});
