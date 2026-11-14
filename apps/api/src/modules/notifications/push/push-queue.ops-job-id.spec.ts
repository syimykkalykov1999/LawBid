import { opsAlertJobId, PushQueueService } from './push-queue.service';

// 14.11 prod F1: `search:…:<ISO>` incident ids made BullMQ throw
// "Custom Id cannot contain :" and the owner got no alert. The mocked
// `Queue.add` runs BullMQ's OWN option check (Job.validateOptions) so a
// rejected id fails here exactly as it did in prod.
jest.mock('bullmq', () => {
  const actual = jest.requireActual<typeof import('bullmq')>('bullmq');
  const validate = (
    actual.Job.prototype as unknown as {
      validateOptions: (this: unknown, d: { data: string }) => void;
    }
  ).validateOptions;
  const queue = {
    add: jest.fn((name: string, data: unknown, opts: object) => {
      validate.call({ name, opts }, { data: JSON.stringify(data) });
      return Promise.resolve({});
    }),
    close: jest.fn(() => Promise.resolve()),
  };
  return { ...actual, Queue: jest.fn(() => queue), __queue: queue };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const queue = (require('bullmq') as { __queue: Record<string, jest.Mock> })
  .__queue;

function service(warn = jest.fn()): PushQueueService {
  const s = new PushQueueService(
    { get: () => 'redis://x' } as never,
    { setContext: jest.fn(), warn } as never,
  );
  s.onApplicationBootstrap();
  return s;
}

const ISO = '2026-11-14T01:54:56.191Z';
const UUID = '0b6f1c1e-3f5a-4c8e-9d1a-2f3b4c5d6e7f';

/** Every incident id shape that reaches enqueueOpsAlert today. */
const SHAPES: Array<[string, string, string, number]> = [
  // infra-auto.service.ts tell(): search steps (the prod failures)
  ['search set_mode', `search:search:set_mode:shadow:${ISO}`, 'infra_auto', 0],
  ['search reindex', `search:search:start_reindex:${ISO}`, 'infra_auto', 0],
  ['search swap', `search:search:swap:${ISO}`, 'infra_auto', 0],
  ['search fail', 'search:search:swap:fail:2026-11-14', 'infra_auto', 0],
  // infra-auto.service.ts tellHeld(): held:<id>:<on|off>:<day>
  ['infra held', 'held:aws.pgbouncer:off:2026-11-14', 'infra_auto', 0],
  ['infra auto', `auto:${UUID}:start`, 'infra_auto', 0],
  // status-watchdog: incident row id (uuid)
  ['status incident', UUID, 'opened', 2],
  // legal-reminders: request id (uuid)
  ['legal reminder', UUID, 'legal_overdue', 1],
  // staff-weekly-digest
  ['staff digest', 'staff-digest-2026-W46', 'digest', 1],
];

describe('ops alert job ids pass BullMQ validation (14.11 F1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(SHAPES)('%s is queued', async (_label, incidentId, event, seq) => {
    const warn = jest.fn();
    const s = service(warn);
    await s.enqueueOpsAlert({
      recipientId: UUID,
      title: 't',
      body: 'b',
      incidentId,
      event,
      seq,
    });
    expect(warn).not.toHaveBeenCalled();
    const opts = queue.add.mock.calls[0][2] as { jobId: string };
    expect(opts.jobId).not.toContain(':');
    expect(opts.jobId).toBe(opsAlertJobId(incidentId, event, seq, UUID));
  });

  it('the old id shape is the one BullMQ rejected (proof of cause)', () => {
    const validate = (
      jest.requireActual<typeof import('bullmq')>('bullmq').Job
        .prototype as unknown as {
        validateOptions: (this: unknown, d: { data: string }) => void;
      }
    ).validateOptions;
    const old = `ops-search:search:swap:${ISO}-infra_auto-0-${UUID}`;
    expect(() =>
      validate.call({ name: 'push', opts: { jobId: old } }, { data: '{}' }),
    ).toThrow('Custom Id cannot contain :');
  });

  it('dedupe: same alert -> same id; ids without ":" are unchanged', () => {
    expect(opsAlertJobId(`search:swap:${ISO}`, 'infra_auto', 0, 'u')).toBe(
      opsAlertJobId(`search:swap:${ISO}`, 'infra_auto', 0, 'u'),
    );
    expect(opsAlertJobId(UUID, 'opened', 2, 'u')).toBe(
      `ops-${UUID}-opened-2-u`,
    );
    expect(opsAlertJobId(UUID, 'opened', 2, 'u')).not.toBe(
      opsAlertJobId(UUID, 'opened', 3, 'u'),
    );
  });
});
