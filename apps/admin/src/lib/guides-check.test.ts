import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error the CI script is plain ESM without types
import { guideRunbooks, ownerMarked, planMap, readGuides, readMap, readRunbooks, serialize } from '../../../../scripts/guides-check.mjs';

type Runbook = { file: string; owner: boolean };
type Guide = { id: string; runbooks: string[] };
type Plan = { map: { runbooks: Record<string, { owner: boolean; guides?: string[]; skip?: string }> }; problems: string[] };
const plan = planMap as (r: Runbook[], g: Guide[], prev: { runbooks: Record<string, unknown> }) => Plan;

describe('guides:check (every owner runbook has a guide)', () => {
  it('recognises the owner markers', () => {
    expect(ownerMarked('owner: yes\n# x')).toBe(true);
    expect(ownerMarked('# Что-то\n\n## Шаги владельца\n')).toBe(true);
    expect(ownerMarked('# Пришло письмо от AWS — что делать (для владельца)\n')).toBe(true);
    expect(ownerMarked('# api-5xx\nSignal → Check')).toBe(false);
  });

  it('reads the runbook list of a guide front-matter', () => {
    expect(guideRunbooks('---\nid: backups\nrunbook: backups.md, backup-failed.md\nverified: 2026-10-27\n---\ntext')).toEqual({ id: 'backups', runbooks: ['backups.md', 'backup-failed.md'] });
    expect(guideRunbooks('---\nid: x\n---\n')).toEqual({ id: 'x', runbooks: [] });
    expect(guideRunbooks('no front matter')).toEqual({ id: '', runbooks: [] });
  });

  it('plans the map: guides from front-matter, skips kept, owner gaps reported', () => {
    const runbooks: Runbook[] = [
      { file: 'A.md', owner: true },
      { file: 'B.md', owner: true },
      { file: 'C.md', owner: false },
      { file: 'D.md', owner: true },
    ];
    const guides: Guide[] = [
      { id: 'a-guide', runbooks: ['A.md'] },
      { id: 'a2', runbooks: ['A.md', 'GONE.md'] },
    ];
    const prev = { runbooks: { 'B.md': { skip: 'для инженера' }, 'OLD.md': { skip: 'x' }, 'C.md': { guides: ['nope'] } } };
    const { map, problems } = plan(runbooks, guides, prev);
    expect(map.runbooks).toEqual({
      'A.md': { owner: true, guides: ['a-guide', 'a2'] },
      'B.md': { owner: true, skip: 'для инженера' },
    });
    expect(problems).toEqual([
      'guide «a2» names a runbook that does not exist: GONE.md',
      expect.stringContaining('owner runbook without a guide: docs/runbooks/D.md'),
      'GUIDES_MAP.json names a runbook that does not exist: OLD.md',
      'GUIDES_MAP.json: guide «nope» (for C.md) does not exist',
    ]);
    expect(serialize(map)).toContain('"A.md": {');
  });

  it('a skip that disappears once a guide covers the runbook', () => {
    const { map } = plan([{ file: 'A.md', owner: true }], [{ id: 'g', runbooks: ['A.md'] }], { runbooks: { 'A.md': { skip: 'old reason' } } });
    expect(map.runbooks['A.md']).toEqual({ owner: true, guides: ['g'] });
  });

  it('the committed map is current for this repository (what CI checks)', () => {
    const { map, problems } = plan(readRunbooks(), readGuides(), readMap());
    expect(problems).toEqual([]);
    const file = path.resolve(__dirname, '../../../../docs/runbooks/GUIDES_MAP.json');
    const committed = readFileSync(file, 'utf8');
    expect(committed).toBe(serialize(map));
    // every guide that names a runbook exists as a file
    const ids = new Set(readdirSync(path.resolve(__dirname, '../../content/guides')).map((f) => f.replace(/\.md$/, '')));
    for (const row of Object.values(map.runbooks)) for (const g of row.guides ?? []) expect(ids.has(g), g).toBe(true);
  });
});
