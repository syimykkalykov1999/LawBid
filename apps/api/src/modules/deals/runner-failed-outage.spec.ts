import { CaseHistoryExportRunner } from '../case-history/case-history-export.runner';
import { DealRecordRunner } from './deal-record.runner';

/**
 * Verify batch 13 (Q6): a job's final failure, seen while the database is
 * down, is logged — not an unhandled rejection — and the other writes of
 * the handler still run.
 */
const down = () => Promise.reject(new Error('database down'));
const logger = () => ({ error: jest.fn(), warn: jest.fn() });
const lastAttempt = (data: object) =>
  ({ data, attemptsMade: 3, opts: { attempts: 3 } }) as never;

describe('final-failure handlers in a database outage (verify batch 13, Q6)', () => {
  it('deal record: logged, resolves', async () => {
    const log = logger();
    const runner = Object.create(
      DealRecordRunner.prototype,
    ) as DealRecordRunner;
    Object.assign(runner, {
      logger: log,
      prisma: { dealRecord: { updateMany: jest.fn(down) } },
    });
    await expect(
      runner.onFailed(
        lastAttempt({ recordId: 'r1', caseId: 'c1', stage: 'unsigned' }),
        new Error('render failed'),
      ),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('case history export: logged, resolves, the active slot is still freed', async () => {
    const log = logger();
    const del = jest.fn(() => Promise.resolve(1));
    const runner = Object.create(
      CaseHistoryExportRunner.prototype,
    ) as CaseHistoryExportRunner;
    Object.assign(runner, {
      logger: log,
      redis: { set: jest.fn(down), del },
      prisma: { dataExportJob: { updateMany: jest.fn(down) } },
    });
    await expect(
      runner.onFailed(
        lastAttempt({ exportId: 'e1', userId: 'u1' }),
        new Error('export failed'),
      ),
    ).resolves.toBeUndefined();
    expect(del).toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
