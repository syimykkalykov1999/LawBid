import type { RestoreJobsListMember } from '@aws-sdk/client-backup';
import { summarize } from './restore-drill.service';

const NOW = new Date('2026-11-05T00:00:00Z');
const job = (o: Partial<RestoreJobsListMember>): RestoreJobsListMember => ({
  ResourceType: 'RDS',
  ...o,
});

describe('restore drill summary', () => {
  it('is unknown off AWS and never before the first test', () => {
    expect(summarize([], NOW, false).state).toBe('unknown');
    expect(summarize([], NOW, true).state).toBe('never');
  });

  it('reads the newest finished job: ok with duration and backup age', () => {
    const r = summarize(
      [
        job({
          Status: 'FAILED',
          CreationDate: new Date('2026-09-01T14:00:00Z'),
        }),
        job({
          Status: 'COMPLETED',
          CreationDate: new Date('2026-11-01T14:00:00Z'),
          CompletionDate: new Date('2026-11-01T14:21:00Z'),
          RecoveryPointCreationDate: new Date('2026-11-01T06:00:00Z'),
        }),
      ],
      NOW,
      true,
    );
    expect(r).toMatchObject({
      state: 'ok',
      durationMinutes: 21,
      backupAt: '2026-11-01T06:00:00.000Z',
      lastOkDaysAgo: 3,
      running: false,
    });
  });

  it('a failed newest job is failed, but remembers the last good one', () => {
    const r = summarize(
      [
        job({
          Status: 'COMPLETED',
          CreationDate: new Date('2026-10-01T14:00:00Z'),
          CompletionDate: new Date('2026-10-01T14:30:00Z'),
        }),
        job({
          Status: 'FAILED',
          StatusMessage: 'No default subnet',
          CreationDate: new Date('2026-11-01T14:00:00Z'),
        }),
      ],
      NOW,
      true,
    );
    expect(r).toMatchObject({
      state: 'failed',
      message: 'No default subnet',
      lastOkDaysAgo: 35,
    });
  });

  it('flags a test in progress', () => {
    const r = summarize(
      [
        job({
          Status: 'RUNNING',
          CreationDate: new Date('2026-11-04T22:00:00Z'),
        }),
      ],
      NOW,
      true,
    );
    expect(r).toMatchObject({ state: 'running', running: true });
  });
});
