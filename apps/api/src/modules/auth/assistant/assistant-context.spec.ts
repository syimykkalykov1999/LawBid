import { AssistantCodeService } from './assistant-code.service';
import { AssistantContextService } from './assistant-context';

/**
 * Verify 17.11, batch 6 (A1): an assistant works as the attorney only
 * while the attorney's own account is active. A suspended attorney's
 * assistant used to keep acting in the attorney's name (HTTP and
 * realtime both go through resolve()) as long as the subscription ran.
 */
describe('AssistantContextService.resolve', () => {
  function setup(attorneyStatus: string) {
    const membership = {
      id: 'm1',
      attorney_id: 'atty-1',
      display_name: 'Pat',
      duties: ['cases'],
      assistant_user: { first_name: 'Pat', last_name: null },
      attorney: { status: attorneyStatus },
    };
    const findFirst = jest.fn((args: { where: Record<string, unknown> }) => {
      // Honour a filter on the attorney's status, as Postgres would.
      const want = (args.where.attorney as { status?: string } | undefined)
        ?.status;
      return Promise.resolve(
        want && want !== attorneyStatus ? null : membership,
      );
    });
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const access = { isActive: jest.fn().mockResolvedValue(true) };
    const service = new AssistantContextService(
      { assistantMembership: { findFirst } } as never,
      redis as never,
      access as never,
    );
    return { service, redis };
  }

  it('an active attorney with a paid plan: the assistant works as them', async () => {
    const { service } = setup('active');
    await expect(service.resolve('asst-1')).resolves.toMatchObject({
      attorneyId: 'atty-1',
      membershipId: 'm1',
    });
  });

  it('a suspended attorney: no context, and "none" is cached', async () => {
    const { service, redis } = setup('suspended');
    await expect(service.resolve('asst-1')).resolves.toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      'assistant:ctx:asst-1',
      'none',
      'EX',
      30,
    );
  });
});

/**
 * Verify 17.11, batch 6 (A4): the unique index on an active assistant
 * turns a lost race (one assistant claimed into two teams) into the
 * existing ASSISTANT_PHONE_TAKEN answer, not a 500.
 */
describe('AssistantCodeService.claim (one active team)', () => {
  it('a unique violation is ASSISTANT_PHONE_TAKEN', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(p2002),
    };
    const context = { invalidate: jest.fn() };
    const notifications = { emit: jest.fn() };
    const service = new AssistantCodeService(
      prisma as never,
      context as never,
      notifications as never,
    );
    await expect(
      service.claim(
        {
          id: 'm1',
          status: 'invited',
          join_code_hash: 'h',
          joined_at: null,
          attorney_id: 'atty-1',
        } as never,
        'asst-1',
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSISTANT_PHONE_TAKEN' },
    });
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});
