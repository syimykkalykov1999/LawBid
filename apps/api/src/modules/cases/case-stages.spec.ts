import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import {
  CASE_STAGES,
  caseStageOf,
  decodeStageCursor,
  encodeStageCursor,
  pageByStages,
  parseStages,
  stagesWhere,
  type CaseStage,
} from './case-stages';
import { MineFilterFields } from './mine/mine-filters';

// Owner 2026-11-09 («Дела → Активные»): the most advanced case on top,
// the newest activity first inside a stage, page after page.
describe('case stages', () => {
  it('maps a status (and the bids) to the app’s five stages', () => {
    expect(caseStageOf('open', 0)).toBe(0);
    expect(caseStageOf('open', 2)).toBe(1);
    expect(caseStageOf('in_progress', 5)).toBe(2);
    expect(caseStageOf('pending_completion', 1)).toBe(3);
    expect(caseStageOf('disputed', 1)).toBe(3);
    expect(caseStageOf('closed', 1)).toBe(4);
    expect(caseStageOf('archived', 0)).toBe(4);
  });

  it('parses ?stages= as a list or comma text, dropping duplicates', () => {
    expect(parseStages(undefined)).toBeUndefined();
    expect(parseStages('')).toBeUndefined();
    expect(parseStages('0,1,1')).toEqual([0, 1]);
    expect(parseStages(['3', 2])).toEqual([3, 2]);
    const ok = plainToInstance(MineFilterFields, { stages: '0,4' });
    expect(validateSync(ok)).toHaveLength(0);
    expect(ok.stages).toEqual([0, 4]);
    const bad = plainToInstance(MineFilterFields, { stages: '0,5' });
    expect(validateSync(bad).length).toBeGreaterThan(0);
    const text = plainToInstance(MineFilterFields, { stages: 'x' });
    expect(validateSync(text).length).toBeGreaterThan(0);
  });

  it('a stage pick is one where, several are an OR, none is nothing', () => {
    expect(stagesWhere(undefined)).toEqual({});
    expect(stagesWhere([2])).toEqual({ status: 'in_progress' });
    expect(stagesWhere([0, 1])).toEqual({
      OR: [
        { status: 'open', bids_count: 0 },
        { status: 'open', bids_count: { gt: 0 } },
      ],
    });
  });

  it('the stage cursor round-trips and refuses other cursors', () => {
    const key = {
      rank: 3,
      createdAt: new Date('2026-11-09T06:00:00Z'),
      id: 'c1',
    };
    expect(decodeStageCursor(encodeStageCursor(key))).toEqual(key);
    expect(decodeStageCursor('garbage')).toBeUndefined();
    expect(
      decodeStageCursor(encodeStageCursor({ ...key, rank: 9 })),
    ).toBeUndefined();
  });

  describe('pageByStages', () => {
    type Row = { id: string; stage: CaseStage; at: number };
    const rows: Row[] = [
      { id: 'p1', stage: 3, at: 50 },
      { id: 'w1', stage: 2, at: 90 },
      { id: 'w2', stage: 2, at: 80 },
      { id: 'w3', stage: 2, at: 70 },
      { id: 'b1', stage: 1, at: 99 },
      { id: 'n1', stage: 0, at: 100 },
      { id: 'n2', stage: 0, at: 10 },
    ];
    const order = [...CASE_STAGES].reverse();
    const fetch = jest.fn(
      (
        stage: CaseStage,
        after: { createdAt: Date; id: string } | undefined,
        take: number,
      ) =>
        Promise.resolve(
          rows
            .filter((r) => r.stage === stage)
            .filter((r) => !after || r.at < after.createdAt.getTime())
            .sort((a, b) => b.at - a.at)
            .slice(0, take),
        ),
    );
    const hasAny = jest.fn((stages: readonly CaseStage[]) =>
      Promise.resolve(rows.some((r) => stages.includes(r.stage))),
    );
    beforeEach(() => {
      fetch.mockClear();
      hasAny.mockClear();
    });

    it('reads stage by stage: wrapping up, in progress, bids, new', async () => {
      const page = await pageByStages<Row>({
        stages: order,
        cursor: undefined,
        limit: 10,
        fetch,
        hasAny,
      });
      expect(page.items.map((r) => r.id)).toEqual([
        'p1',
        'w1',
        'w2',
        'w3',
        'b1',
        'n1',
        'n2',
      ]);
      expect(page.hasMore).toBe(false);
      // One query per stage (the empty «done» stage included), no count.
      expect(fetch).toHaveBeenCalledTimes(5);
      expect(hasAny).not.toHaveBeenCalled();
    });

    it('a page that ends inside a stage continues from its cursor', async () => {
      const first = await pageByStages<Row>({
        stages: order,
        cursor: undefined,
        limit: 2,
        fetch,
        hasAny,
      });
      expect(first.items.map((r) => r.id)).toEqual(['p1', 'w1']);
      expect(first.hasMore).toBe(true);
      const last = first.items[1];
      const second = await pageByStages<Row>({
        stages: order,
        cursor: { rank: last.stage, createdAt: new Date(last.at), id: last.id },
        limit: 2,
        fetch,
        hasAny,
      });
      expect(second.items.map((r) => r.id)).toEqual(['w2', 'w3']);
      expect(second.hasMore).toBe(true);
      // The stage ended exactly at the page end: one cheap «any left?».
      expect(hasAny).toHaveBeenCalledWith([1, 0]);
    });

    it('a stage pick keeps only those stages, in stage order', async () => {
      const page = await pageByStages<Row>({
        stages: order.filter((s) => s === 0 || s === 2),
        cursor: undefined,
        limit: 10,
        fetch,
        hasAny,
      });
      expect(page.items.map((r) => r.id)).toEqual([
        'w1',
        'w2',
        'w3',
        'n1',
        'n2',
      ]);
    });
  });

  it('owner 2026-11-09: ten pinned messages per chat by default', () => {
    expect(APP_SETTINGS['chat.max_pins']).toBe(10);
  });
});
