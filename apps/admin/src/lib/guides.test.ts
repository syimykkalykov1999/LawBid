import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canOpen } from './rbac';
import { groupGuides, guideForStep, latestVerified, guideProblems, isStale, parseGuide, searchGuides, verifiedWord } from './guides';
import { parseMarkdown, safeHref } from './markdown';

const DIR = path.join(__dirname, '../../content/guides');
const API_FILE = path.join(__dirname, '../../../api/src/common/ops/launch/launch-checks.service.ts');
const guides = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ file: f, g: parseGuide(readFileSync(path.join(DIR, f), 'utf8')) }));

/** Every «Запуск» step id the server can draw (read from its source, so a new step fails this test until it has a guide). */
function serverStepIds(): string[] {
  const src = readFileSync(API_FILE, 'utf8');
  const ids = new Set<string>();
  for (const m of src.matchAll(/\[\s*'([a-z0-9_]+)',\s*\(\)\s*=>/g)) ids.add(m[1]);
  for (const m of src.matchAll(/^\s+id: '([a-z0-9_]+)',$/gm)) ids.add(m[1]);
  return [...ids].sort();
}

describe('guides: front-matter parser', () => {
  const raw = `---
id: demo
title: Демо: с двоеточием
category: keys
cost: Бесплатно (не удалось проверить: цена)
time: 5 минут
launch: a_b, c_d
verified: 2026-10-25
sources:
  - Doc: page | https://example.com/a
---

## Шаги

1. Нажмите **Save**.`;

  it('splits on the first colon, reads sources and launch ids', () => {
    const g = parseGuide(raw);
    expect(g.title).toBe('Демо: с двоеточием');
    expect(g.cost).toContain('не удалось проверить: цена');
    expect(g.launch).toEqual(['a_b', 'c_d']);
    expect(g.sources).toEqual([{ title: 'Doc: page', url: 'https://example.com/a' }]);
    expect(g.body.startsWith('## Шаги')).toBe(true);
  });

  it('rejects a file without front-matter and a source without a link', () => {
    expect(() => parseGuide('## no')).toThrow();
    expect(() => parseGuide(raw.replace(' | https://example.com/a', ''))).toThrow();
  });

  it('flags the missing pieces', () => {
    const g = parseGuide(raw.replace(/sources:[\s\S]*?---\n/, 'sources:\n---\n').replace('2026-10-25', 'вчера'));
    const p = guideProblems(g);
    expect(p).toContain('нет sources');
    expect(p).toContain('verified: нужна дата ГГГГ-ММ-ДД');
  });
});

describe('guides: search, groups, helpers', () => {
  const list = guides.map((x) => x.g);
  it('finds by any word, all words must match', () => {
    expect(searchGuides(list, 'pagerduty').map((g) => g.id)).toContain('pagerduty');
    expect(searchGuides(list, 'pagerduty nonexistentword')).toHaveLength(0);
    expect(searchGuides(list, '')).toHaveLength(list.length);
  });
  it('groups in the owner order and skips empty categories', () => {
    const groups = groupGuides(list);
    expect(groups.map((g) => g.title)[0]).toBe('Запуск');
    expect(groups.every((g) => g.guides.length > 0)).toBe(true);
  });
  it('says the date in words and notices old guides', () => {
    expect(verifiedWord('2026-10-25')).toBe('проверено 25 октября 2026 г.');
    expect(isStale('2026-01-01', new Date('2026-10-25'))).toBe(true);
    expect(isStale('2026-10-01', new Date('2026-10-25'))).toBe(false);
  });
  it('names the newest check date', () => {
    expect(latestVerified([{ verified: '2026-01-02' }, { verified: '2026-10-25' }, { verified: 'bad' }])).toBe('2026-10-25');
    expect(latestVerified([])).toBe('');
  });
  it('the menu item is owner only', () => {
    expect(canOpen({ role: 'super_admin' }, '/guides')).toBe(true);
    expect(canOpen({ role: 'moderator', permissions: { settings: 'manage' } }, '/guides')).toBe(false);
  });
});

describe('guides: content rules (keep it maintainable)', () => {
  it('there are guides', () => {
    expect(guides.length).toBeGreaterThanOrEqual(42);
  });

  it('every file is valid: id = file name, sources, verified date, https links', () => {
    for (const { file, g } of guides) {
      expect(g.id, file).toBe(file.replace(/\.md$/, ''));
      expect(guideProblems(g), file).toEqual([]);
    }
  });

  it('all six categories have guides, and the owner-requested explainers exist', () => {
    const cats = new Set(guides.map((x) => x.g.category));
    for (const c of ['launch', 'money', 'people', 'content', 'legal', 'system']) expect(cats.has(c as never), c).toBe(true);
    for (const id of ['what-we-pay', 'auto-switches', 'big-bill', 'check-after-deploy']) expect(guides.some((x) => x.g.id === id), id).toBe(true);
  });

  it('ids are unique', () => {
    const ids = guides.map((x) => x.g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every «Запуск» step has a guide, and every guide points at a real step', () => {
    expect(existsSync(API_FILE)).toBe(true);
    const steps = serverStepIds();
    expect(steps.length).toBeGreaterThanOrEqual(17);
    const list = guides.map((x) => x.g);
    for (const s of steps) expect(guideForStep(list, s), `нет инструкции для шага «${s}»`).not.toBeNull();
    for (const { g } of guides) for (const l of g.launch) expect(steps, `${g.id}: шага «${l}» нет в «Запуске»`).toContain(l);
  });

  it('every guide has the standard sections', () => {
    for (const { g } of guides) {
      for (const h of ['## Что это и зачем', '## Шаги', '## Как проверить']) expect(g.body, `${g.id}: нет «${h}»`).toContain(h);
    }
  });

  it('the text only uses safe markdown: every link is https, no raw html', () => {
    for (const { g } of guides) {
      expect(g.body, g.id).not.toMatch(/<\/?[a-z][^>]*>/i);
      for (const m of g.body.matchAll(/\]\(([^)]*)\)/g)) expect(safeHref(m[1]), `${g.id}: ${m[1]}`).not.toBeNull();
      expect(parseMarkdown(g.body).length, g.id).toBeGreaterThan(5);
    }
  });

  it('«см. инструкцию «…»» cross-links name an existing guide', () => {
    const titles = new Set(guides.map((x) => x.g.title));
    for (const { g } of guides) {
      for (const m of g.body.matchAll(/см\. инструкцию «([^»]+)»/g)) expect(titles.has(m[1]), `${g.id}: «${m[1]}»`).toBe(true);
    }
  });

  it('no secrets in the public repo: no live keys, no private-key blocks', () => {
    for (const { file } of guides) {
      const t = readFileSync(path.join(DIR, file), 'utf8');
      expect(t, file).not.toMatch(/sk_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY/);
    }
  });
});
