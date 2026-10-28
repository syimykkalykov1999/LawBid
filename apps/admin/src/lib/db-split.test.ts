import { describe, expect, it } from 'vitest';
import { allStepsDone, dbSplitSteps, splitCommands, type ShardsOverview, type SplitPlan } from './db-split';

const overview = (databases: string[]) => ({ databases, distribution: [], moves: [], leaseHeld: false, orphans: null }) as unknown as ShardsOverview;
const plan = (readiness: Record<string, unknown>, rows = 1000, shards = [200, 201], estimatedSeconds = 300): SplitPlan =>
  ({ fromDb: 'db0', toDb: 'db1', shards, rows, estimatedSeconds, readiness }) as unknown as SplitPlan;

describe('db split steps («Разделить базу» on «Масштаб»)', () => {
  it('before «Проверить»: only the secret step is known', () => {
    const steps = dbSplitSteps(overview(['db0']), undefined);
    expect(steps.map((s) => [s.id, s.state])).toEqual([
      ['configured', false],
      ['reachable', null],
      ['migrations', null],
      ['plan', null],
    ]);
    expect(steps[0].note).toContain('Создайте вторую базу');
    expect(allStepsDone(steps)).toBe(false);
  });

  it('after a clean plan every step is done and the plan is worded', () => {
    const steps = dbSplitSteps(
      overview(['db0', 'db1']),
      plan({ configured: true, reachable: true, migrationsApplied: true, missingMigrations: 0, crossFamilyFksLeft: 0, ok: true, problems: [] }),
    );
    expect(steps.every((s) => s.state === true)).toBe(true);
    expect(steps[3].note).toBe(`Переедет частей: 2, строк: ${(1000).toLocaleString('ru-RU')}, время около 5 мин.`);
    expect(allStepsDone(steps)).toBe(true);
  });

  it('missing migrations and problems are shown on their steps', () => {
    const steps = dbSplitSteps(
      overview(['db0', 'db1']),
      plan({ configured: true, reachable: true, migrationsApplied: false, missingMigrations: 2, crossFamilyFksLeft: 3, ok: false, problems: ['db1 lacks 2 migration(s)'] }),
    );
    expect(steps[2]).toMatchObject({ state: false, note: 'Не хватает 2 миграций: выполните prisma migrate deploy на второй базе.' });
    expect(steps[3]).toMatchObject({ state: false, note: 'db1 lacks 2 migration(s)' });
    expect(allStepsDone(steps)).toBe(false);
  });

  it('without the overview the secret step comes from the plan readiness', () => {
    expect(dbSplitSteps(undefined, plan({ configured: false, reachable: false, ok: false, problems: ['no db1'] }))[0].state).toBe(false);
    expect(dbSplitSteps(undefined, undefined)[0].state).toBeNull();
  });

  it('names the exact read-only commands of the runbook', () => {
    expect(splitCommands('db1')).toEqual([
      'npm run shard:move --workspace apps/api -- readiness db1',
      'npm run shard:move --workspace apps/api -- split-plan db1',
      'npm run shard:move --workspace apps/api -- plan 200 db1',
    ]);
  });
});
