import { describe, expect, it } from 'vitest';
import { chunk, collectIds, count, dayBounds, pageState, resultText, runInBatches, toggleId, togglePage } from './bulk';
import { searchStates, statesText } from './us-states';

const POSTS = ['публикацию', 'публикации', 'публикаций'] as const;

describe('selection', () => {
  it('toggles one id', () => {
    const a = toggleId(new Set(), 'x');
    expect([...a]).toEqual(['x']);
    expect([...toggleId(a, 'x')]).toEqual([]);
  });

  it('the page checkbox adds the missing ids, then removes them all', () => {
    const some = togglePage(new Set(['a', 'z']), ['a', 'b']);
    expect([...some].sort()).toEqual(['a', 'b', 'z']);
    expect(pageState(some, ['a', 'b'])).toBe('all');
    const none = togglePage(some, ['a', 'b']);
    expect([...none]).toEqual(['z']);
    expect(pageState(none, ['a', 'b'])).toBe('none');
    expect(pageState(new Set(['a']), ['a', 'b'])).toBe('some');
  });
});

describe('batching', () => {
  it('splits ids into API-sized batches and merges the answers', async () => {
    const ids = Array.from({ length: 1201 }, (_, i) => `id${i}`);
    expect(chunk(ids).map((c) => c.length)).toEqual([500, 500, 201]);
    const sent: number[] = [];
    const r = await runInBatches(ids, async (b) => {
      sent.push(b.length);
      return { done: b.slice(1), skipped: [{ id: b[0], reason: 'invalid_state' }] };
    });
    expect(sent).toEqual([500, 500, 201]);
    expect(r.done).toHaveLength(1198);
    expect(r.skipped).toHaveLength(3);
  });

  it('collects ids across pages, with a filter and a cap', async () => {
    const pages: Record<string, { data: { id: string; ok: boolean }[]; nextCursor: string | null }> = {
      start: { data: [{ id: '1', ok: true }, { id: '2', ok: false }], nextCursor: 'p2' },
      p2: { data: [{ id: '3', ok: true }, { id: '4', ok: true }], nextCursor: null },
    };
    const fetchPage = async (c?: string) => pages[c ?? 'start'];
    expect(await collectIds(fetchPage, (r) => r.ok)).toEqual({ ids: ['1', '3', '4'], capped: false });
    expect(await collectIds(fetchPage, undefined, 2)).toEqual({ ids: ['1', '2'], capped: true });
  });
});

describe('texts', () => {
  it('counts in Russian', () => {
    expect(count(1, POSTS)).toBe('1 публикацию');
    expect(count(3, POSTS)).toBe('3 публикации');
    expect(count(11, POSTS)).toBe('11 публикаций');
    expect(count(21, POSTS)).toBe('21 публикацию');
  });

  it('reports done and skipped', () => {
    expect(resultText({ done: ['a', 'b'], skipped: [] }, 'Удалено', POSTS)).toBe('Удалено: 2 публикации');
    expect(resultText({ done: ['a'], skipped: [{ id: 'b', reason: 'not_found' }] }, 'Удалено', POSTS)).toContain('пропущено 1');
  });

  it('turns a date range into an exclusive window', () => {
    const b = dayBounds('2026-10-01', '2026-10-03');
    expect(new Date(b.to!).getTime() - new Date(b.from!).getTime()).toBe(3 * 24 * 3600 * 1000);
    expect(dayBounds('', '')).toEqual({});
  });
});

describe('states', () => {
  it('describes the chosen states', () => {
    expect(statesText([])).toBe('');
    expect(statesText(['IL'])).toBe('из штата IL');
    expect(statesText(['IL', 'NY', 'CA', 'TX', 'FL'])).toBe('в 5 штатах: IL, NY, CA, TX, FL');
    expect(statesText(['AL', 'AK', 'AZ'], 2)).toBe('в 3 штатах: AL, AK и ещё 1');
  });

  it('searches by code and name; 50 states + DC', () => {
    expect(searchStates('')).toHaveLength(51);
    expect(searchStates('il').map((s) => s.code)).toContain('IL');
    expect(searchStates('new').map((s) => s.code)).toEqual(['NH', 'NJ', 'NM', 'NY']);
  });
});
