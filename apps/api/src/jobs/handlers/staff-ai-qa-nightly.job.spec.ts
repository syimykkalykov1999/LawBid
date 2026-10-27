import type { PrismaService } from '../../prisma/prisma.service';
import { StaffAiQaNightlyJob } from './staff-ai-qa-nightly.job';
import { StaffAiBudgetService } from '../../modules/staff-ai/staff-ai-budget.service';
import type { StaffAiQaService } from '../../modules/staff-ai/staff-ai-qa.service';
import type { StaffAiSummaryService } from '../../modules/staff-ai/staff-ai-summary.service';
import {
  AI_ON,
  MemRedis,
  memAppConfig,
  settingsOf,
} from '../../modules/staff-ai/staff-ai.test-support';

function make(stored: Record<string, unknown>) {
  const settings = settingsOf(stored);
  const redis = new MemRedis();
  const budget = new StaffAiBudgetService(
    memAppConfig() as unknown as PrismaService,
    redis as never,
    settings,
  );
  const qa = { runNightly: jest.fn(() => Promise.resolve({ submitted: 3 })) };
  const summary = {
    refreshNightly: jest.fn(() => Promise.resolve({ written: 2 })),
  };
  const job = new StaffAiQaNightlyJob(
    settings,
    qa as unknown as StaffAiQaService,
    summary as unknown as StaffAiSummaryService,
    budget,
  );
  return { job, qa, summary, redis };
}

describe('staff.ai-qa-nightly', () => {
  it('master switch off (the default): returns at once, touches nothing', async () => {
    const t = make({});
    await expect(t.job.run()).resolves.toEqual({ skipped: 'off' });
    expect(t.qa.runNightly).not.toHaveBeenCalled();
    expect(t.summary.refreshNightly).not.toHaveBeenCalled();
    expect(t.redis.kv.size).toBe(0);
  });

  it('a sub-switch alone (master off) does nothing', async () => {
    const t = make({
      'staff.ai_qa_enabled': true,
      'staff.ai_summary_enabled': true,
    });
    await expect(t.job.run()).resolves.toEqual({ skipped: 'off' });
    expect(t.qa.runNightly).not.toHaveBeenCalled();
  });

  it('master on but both job features off: nothing runs', async () => {
    const t = make({ 'staff.ai_enabled': true, 'staff.ai_hint_enabled': true });
    await expect(t.job.run()).resolves.toEqual({ skipped: 'off' });
    expect(t.qa.runNightly).not.toHaveBeenCalled();
  });

  it('runs the QA and summary steps that are on, then snapshots the spend', async () => {
    const t = make(AI_ON);
    const res = await t.job.run();
    expect(t.qa.runNightly).toHaveBeenCalledTimes(1);
    expect(t.summary.refreshNightly).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({
      qa_submitted: 3,
      summary_written: 2,
      spentMillicents: 0,
    });
    const qaOnly = make({
      'staff.ai_enabled': true,
      'staff.ai_qa_enabled': true,
    });
    await qaOnly.job.run();
    expect(qaOnly.summary.refreshNightly).not.toHaveBeenCalled();
  });

  it('one step failing does not stop the other or the snapshot', async () => {
    const t = make(AI_ON);
    t.qa.runNightly.mockRejectedValueOnce(new Error('boom'));
    const res = await t.job.run();
    expect(res).toMatchObject({ qa_error: 'Error', summary_written: 2 });
  });
});
