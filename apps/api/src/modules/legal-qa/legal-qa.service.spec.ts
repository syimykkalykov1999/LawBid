import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { BlocksService } from '../blocks/blocks.service';
import type { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import type { FilesService } from '../files/files.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SearchProvider } from '../search/search.provider';
import { LegalQaService } from './legal-qa.service';
import type { QaSafetyService } from './qa-safety.service';

/**
 * Audit 17.11 (batch 6, Q1/Q3/Q4/Q5): the author's own delete must not
 * launder a moderated answer, a re-post does not alert the asker twice,
 * «best» is decided inside the transaction, and the «Mine» delta keeps the
 * list's filters.
 */
const Q_ID = '11111111-1111-4111-8111-111111111111';
const A_ID = '22222222-2222-4222-8222-222222222222';
const ATTORNEY: RequestUser = {
  sub: 'att',
  role: 'attorney',
} as unknown as RequestUser;
const CLIENT: RequestUser = {
  sub: 'cli',
  role: 'client',
} as unknown as RequestUser;

function answerRow(over: Record<string, unknown> = {}) {
  return {
    id: A_ID,
    question_id: Q_ID,
    attorney_id: 'att',
    body: 'Old answer',
    status: 'published',
    is_best: false,
    like_count: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

function setup() {
  const prisma = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
    legalAnswer: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(answerRow(data)),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    legalQuestion: {
      findFirst: jest.fn().mockResolvedValue({ best_answer_id: null }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    practiceArea: {
      findMany: jest.fn().mockResolvedValue([{ id: 'area' }, { id: 'kid' }]),
    },
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const notifications = { emit: jest.fn().mockResolvedValue(undefined) };
  const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
  const limits = { consume: jest.fn().mockResolvedValue(undefined) };
  const settings = { boolean: jest.fn(), number: jest.fn() };
  const blocks = {
    hiddenIds: jest.fn().mockResolvedValue(new Set<string>()),
    assertNotBlocked: jest.fn().mockResolvedValue(undefined),
  };
  const safety = {
    screenAnswer: jest.fn().mockResolvedValue({
      texts: ['New answer'],
      flags: [],
      hash: 'h',
      hold: false,
      warnings: [],
    }),
  };
  const svc = new LegalQaService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    flags as unknown as FeatureFlagsService,
    limits as unknown as UsageLimitsService,
    settings as unknown as AppSettingsService,
    blocks as unknown as BlocksService,
    {} as unknown as FilesService,
    { searchQuestions: jest.fn() } as unknown as SearchProvider,
    safety as unknown as QaSafetyService,
  );
  // The parts that are not under test: presentation, the verified check,
  // the visible question.
  const internals = svc as unknown as Record<string, unknown>;
  internals.presentAnswers = jest.fn((rows: unknown[]) =>
    Promise.resolve(rows),
  );
  internals.presentQuestions = jest.fn((rows: unknown[]) =>
    Promise.resolve(rows),
  );
  internals.assertVerifiedAttorney = jest.fn().mockResolvedValue(undefined);
  const question = {
    id: Q_ID,
    author_id: 'cli',
    status: 'published',
    closed_at: null,
    answer_count: 1,
    best_answer_id: null as string | null,
    state_code: null,
  };
  internals.loadVisible = jest.fn().mockResolvedValue(question);
  internals.get = jest.fn().mockResolvedValue({ id: Q_ID });
  return { svc, prisma, notifications, question, internals };
}

describe('LegalQaService.removeAnswer (Q1)', () => {
  it.each([
    ['hidden by a moderator', { status: 'hidden' }],
    ['removed by a moderator', { status: 'removed' }],
  ])(
    'an answer %s cannot be deleted by its author (stays moderated)',
    async (_label, over) => {
      const { svc, prisma } = setup();
      prisma.legalAnswer.findFirst.mockResolvedValue(answerRow(over));
      await expect(svc.removeAnswer(ATTORNEY, Q_ID)).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.legalAnswer.update).not.toHaveBeenCalled();
    },
  );

  it('a published answer is deleted and frees its slot', async () => {
    const { svc, prisma } = setup();
    prisma.legalAnswer.findFirst.mockResolvedValue(answerRow());
    await svc.removeAnswer(ATTORNEY, Q_ID);
    expect(prisma.legalAnswer.update).toHaveBeenCalledWith({
      where: { id: A_ID },
      data: expect.objectContaining({ status: 'removed', is_best: false }),
    });
    expect(prisma.legalQuestion.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: Q_ID }),
      data: { answer_count: { decrement: 1 } },
    });
  });
});

describe('LegalQaService.answer re-post (Q4)', () => {
  it('a re-post after the own deletion is published but does not alert the asker again', async () => {
    const { svc, prisma, notifications } = setup();
    prisma.legalAnswer.findFirst.mockResolvedValue(
      answerRow({ status: 'removed', deleted_at: new Date() }),
    );
    const res = await svc.answer(ATTORNEY, Q_ID, 'New answer');
    expect(res).toMatchObject({ status: 'published', deleted_at: null });
    expect(prisma.legalQuestion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { answer_count: { increment: 1 } } }),
    );
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('the first answer still alerts the asker', async () => {
    const { svc, prisma, notifications } = setup();
    prisma.legalAnswer.findFirst.mockResolvedValue(null);
    prisma.legalAnswer.create.mockResolvedValue(answerRow());
    await svc.answer(ATTORNEY, Q_ID, 'New answer');
    expect(notifications.emit).toHaveBeenCalledTimes(1);
  });
});

describe('LegalQaService.markBest (Q5)', () => {
  it('a second tap (best already set inside the tx) does not notify again', async () => {
    const { svc, prisma, notifications, internals } = setup();
    internals.publishedAnswer = jest.fn().mockResolvedValue(answerRow());
    // The question read before the tx is stale: the first tap already
    // committed best_answer_id.
    prisma.legalQuestion.findFirst.mockResolvedValue({ best_answer_id: A_ID });
    await svc.markBest(CLIENT, Q_ID, A_ID);
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('an answer hidden after it was read cannot become best', async () => {
    const { svc, prisma, notifications, internals } = setup();
    internals.publishedAnswer = jest.fn().mockResolvedValue(answerRow());
    // Inside the tx the answer is no longer published.
    prisma.legalAnswer.updateMany.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve({ count: where.status === 'published' ? 0 : 1 }),
    );
    await expect(svc.markBest(CLIENT, Q_ID, A_ID)).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.legalQuestion.update).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('the first mark notifies the attorney once', async () => {
    const { svc, notifications, internals } = setup();
    internals.publishedAnswer = jest.fn().mockResolvedValue(answerRow());
    await svc.markBest(CLIENT, Q_ID, A_ID);
    expect(notifications.emit).toHaveBeenCalledTimes(1);
  });
});

describe('LegalQaService.list «Mine» delta (Q3)', () => {
  it('a client delta keeps the area and state filters of the list', async () => {
    const { svc, prisma } = setup();
    await svc.list(CLIENT, {
      filter: 'mine',
      practiceAreaId: 'area',
      stateCode: 'NY',
      updatedSince: new Date(Date.now() - 60_000).toISOString(),
    } as never);
    const where = (
      prisma.legalQuestion.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ]
    )[0].where;
    expect(where).toMatchObject({
      author_id: 'cli',
      state_code: 'NY',
      practice_area_id: { in: ['area', 'kid'] },
    });
  });
});
