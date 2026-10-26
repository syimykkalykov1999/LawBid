import { Logger } from '@nestjs/common';
import { diffIds, SwitchingSearchProvider } from './search-switch.provider';
import type { OpenSearchProvider } from './engine/opensearch-search.provider';
import type { PostgresSearchProvider } from './postgres-search.provider';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';

type Mode = 'postgres' | 'shadow' | 'engine' | 'bogus';

function make(mode: Mode, timeout = 50) {
  const pg = {
    searchPosts: jest.fn().mockResolvedValue(['a', 'b', 'c']),
    searchAttorneys: jest.fn().mockResolvedValue(['a']),
    searchPeople: jest
      .fn()
      .mockResolvedValue([{ id: 'p', role: 'attorney', tier: 2 }]),
    searchCasesRanked: jest.fn().mockResolvedValue(['c1']),
    searchQuestions: jest.fn().mockResolvedValue(['q1']),
    searchTags: jest.fn().mockResolvedValue(['t']),
    searchCases: jest.fn().mockResolvedValue([]),
    suggest: jest.fn().mockResolvedValue([]),
    practiceMatches: jest.fn().mockResolvedValue([]),
  };
  const engine = {
    searchPosts: jest.fn().mockResolvedValue(['a', 'b', 'c']),
    searchPeople: jest
      .fn()
      .mockResolvedValue([{ id: 'p', role: 'attorney', tier: 2 }]),
  };
  const settings = {
    string: jest.fn().mockResolvedValue(mode),
    number: jest.fn().mockResolvedValue(timeout),
  };
  const sw = new SwitchingSearchProvider(
    pg as unknown as PostgresSearchProvider,
    engine as unknown as OpenSearchProvider,
    settings as unknown as AppSettingsService,
  );
  return { sw, pg, engine, settings };
}

describe('diffIds', () => {
  it('tells identical, same set in another order, and different lists apart', () => {
    expect(diffIds('x', ['a', 'b'], ['a', 'b'])).toMatchObject({
      identical: true,
      sameSet: true,
      top1Same: true,
    });
    expect(diffIds('x', ['a', 'b'], ['b', 'a'])).toMatchObject({
      identical: false,
      sameSet: true,
      top1Same: false,
    });
    expect(diffIds('x', ['a', 'b'], ['a', 'z'])).toMatchObject({
      sameSet: false,
      onlyPg: 1,
      onlyEngine: 1,
      top1Same: true,
    });
  });
});

describe('SwitchingSearchProvider', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((m: unknown) => void logs.push(String(m)));
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((m: unknown) => void logs.push(String(m)));
  });
  afterEach(() => jest.restoreAllMocks());

  it('postgres (and any unknown value): Postgres only, the engine is never touched', async () => {
    for (const mode of ['postgres', 'bogus'] as const) {
      const { sw, pg, engine } = make(mode);
      expect(await sw.searchPosts('visa', 10)).toEqual(['a', 'b', 'c']);
      expect(pg.searchPosts).toHaveBeenCalledWith('visa', 10, undefined);
      expect(engine.searchPosts).not.toHaveBeenCalled();
    }
  });

  it('postgres mode is the default when the setting cannot be read', async () => {
    const { sw, settings, engine } = make('engine');
    settings.string.mockRejectedValue(new Error('redis down'));
    await sw.searchPosts('visa', 10);
    expect(engine.searchPosts).not.toHaveBeenCalled();
  });

  it('shadow: returns Postgres, asks the engine in the background, logs a difference', async () => {
    const { sw, pg, engine } = make('shadow');
    engine.searchPosts.mockResolvedValue(['a', 'x']);
    const out = await sw.searchPosts('visa', 10);
    expect(out).toEqual(['a', 'b', 'c']);
    await sw.idle();
    expect(pg.searchPosts).toHaveBeenCalledTimes(1);
    expect(engine.searchPosts).toHaveBeenCalledTimes(1);
    const line = logs.find((l) => l.includes('search.shadow'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      op: 'posts',
      pgCount: 3,
      engineCount: 2,
      onlyPg: 2,
      onlyEngine: 1,
      identical: false,
    });
    expect(typeof parsed.pgMs).toBe('number');
    expect(typeof parsed.engineMs).toBe('number');
    expect(sw.stats).toMatchObject({ shadow: 1, shadowDiff: 1 });
  });

  it('shadow: a failing or hanging engine never changes or delays the answer', async () => {
    const a = make('shadow');
    a.engine.searchPosts.mockRejectedValue(new Error('boom'));
    expect(await a.sw.searchPosts('visa', 10)).toEqual(['a', 'b', 'c']);
    await a.sw.idle();
    expect(logs.some((l) => l.includes('search.shadow.error'))).toBe(true);

    const b = make('shadow', 10);
    b.engine.searchPosts.mockReturnValue(new Promise(() => undefined));
    expect(await b.sw.searchPosts('visa', 10)).toEqual(['a', 'b', 'c']);
    await b.sw.idle(); // gives up after 2 x timeout
  });

  it('shadow: compares People by id', async () => {
    const { sw, engine } = make('shadow');
    engine.searchPeople.mockResolvedValue([
      { id: 'other', role: 'client', tier: 2 },
    ]);
    await sw.searchPeople('x', {}, 5);
    await sw.idle();
    expect(sw.stats.shadowDiff).toBe(1);
  });

  it('engine: the engine answers', async () => {
    const { sw, pg, engine } = make('engine');
    engine.searchPosts.mockResolvedValue(['z']);
    expect(await sw.searchPosts('visa', 10)).toEqual(['z']);
    expect(pg.searchPosts).not.toHaveBeenCalled();
  });

  it('engine: an error falls back to Postgres for that request', async () => {
    const { sw, pg, engine } = make('engine');
    engine.searchPosts.mockRejectedValue(new Error('503'));
    expect(await sw.searchPosts('visa', 10)).toEqual(['a', 'b', 'c']);
    expect(pg.searchPosts).toHaveBeenCalledTimes(1);
    expect(sw.stats.fallbacks).toBe(1);
  });

  it('engine: a slow engine times out and Postgres answers', async () => {
    const { sw, pg, engine } = make('engine', 20);
    engine.searchPosts.mockReturnValue(new Promise(() => undefined));
    expect(await sw.searchPosts('visa', 10)).toEqual(['a', 'b', 'c']);
    expect(pg.searchPosts).toHaveBeenCalledTimes(1);
  });

  it('engine: after repeated failures the engine is skipped for a while, then retried', async () => {
    const { sw, pg, engine } = make('engine');
    let t = 1_000;
    sw.now = () => t;
    engine.searchPosts.mockRejectedValue(new Error('down'));
    for (let i = 0; i < 5; i++) await sw.searchPosts('visa', 10);
    expect(engine.searchPosts).toHaveBeenCalledTimes(5);
    await sw.searchPosts('visa', 10); // circuit open: not even tried
    expect(engine.searchPosts).toHaveBeenCalledTimes(5);
    expect(pg.searchPosts).toHaveBeenCalledTimes(6);
    t += 31_000;
    engine.searchPosts.mockResolvedValue(['ok']);
    expect(await sw.searchPosts('visa', 10)).toEqual(['ok']);
  });

  it('cursor browse, type-ahead and the topic picker always stay on Postgres', async () => {
    const { sw, pg } = make('engine');
    await sw.searchCases('', {} as never);
    await sw.suggest('a', 3);
    await sw.practiceMatches('a', 3);
    expect(pg.searchCases).toHaveBeenCalled();
    expect(pg.suggest).toHaveBeenCalled();
    expect(pg.practiceMatches).toHaveBeenCalled();
  });
});

describe('search latency metric line', () => {
  it('logs one {metric: search_latency} line per Postgres-answered search', async () => {
    const lines: unknown[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((m: unknown) => void lines.push(m));
    const { sw } = make('postgres');
    let t = 1000;
    sw.now = () => (t += 40);
    await sw.searchPosts('law', 5, {});
    spy.mockRestore();
    expect(lines).toContainEqual({
      metric: 'search_latency',
      op: 'posts',
      engine: 'postgres',
      ms: 40,
    });
  });
});
