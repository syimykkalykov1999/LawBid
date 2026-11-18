import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { TasksService } from './tasks.service';

/**
 * Verify 17.11, batch 6 (A3): a status change with If-Match compared the
 * version it had read, then wrote `where: { id }` only — two devices that
 * both read version 3 both "won". The write is now conditional on the
 * version, like update(), and the loser gets 409 STALE_VERSION.
 */
describe('TasksService.setStatus with If-Match', () => {
  const user = { sub: 'atty-1', role: 'attorney' } as RequestUser;

  function setup() {
    const stored = {
      id: 't1',
      attorney_id: 'atty-1',
      version: 3,
      status: 'open',
      repeat: 'none',
      consultation_id: null,
      outcome_note: null,
      archived_at: null,
      remind_before_min: null,
      assignee_membership_id: null,
      created_by_membership_id: null,
      title: 'Call the court',
      steps: [],
      places: [],
      people: [],
    };
    const update = jest.fn(
      (args: { where: { id: string; version?: number } }) => {
        if (
          args.where.version !== undefined &&
          args.where.version !== stored.version
        ) {
          return Promise.reject(
            Object.assign(new Error('Record not found'), { code: 'P2025' }),
          );
        }
        stored.version += 1;
        return Promise.resolve({ ...stored });
      },
    );
    const prisma = {
      attorneyTask: {
        findFirst: jest.fn(() => Promise.resolve({ ...stored })),
        update,
      },
    };
    const assistants = { tellAssistant: jest.fn(), log: jest.fn() };
    const service = new TasksService(
      prisma as never,
      {} as never,
      {} as never,
      assistants as never,
      {} as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({ id: 't1' } as never);
    return { service, stored, update };
  }

  it('two saves of the same version: one wins, the other is 409 STALE_VERSION', async () => {
    const { service, stored } = setup();
    const results = await Promise.allSettled([
      service.setStatus(user, 't1', { status: 'done' } as never, 3),
      service.setStatus(user, 't1', { status: 'cancelled' } as never, 3),
    ]);
    expect(stored.version).toBe(4);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      status: 409,
      response: { code: 'STALE_VERSION' },
    });
  });

  it('without If-Match the write stays last-write-wins (older apps)', async () => {
    const { service, update } = setup();
    await service.setStatus(user, 't1', { status: 'done' } as never);
    expect(update.mock.calls[0][0].where).toEqual({ id: 't1' });
  });
});
