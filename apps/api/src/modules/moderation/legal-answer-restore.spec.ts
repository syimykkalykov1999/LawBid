import { MAX_ANSWERS } from '../legal-qa/legal-qa.service';
import { ModerationService } from './moderation.service';

/**
 * Audit 17.11 (batch 6, Q7, pin): as on Stack Overflow, a moderator
 * undelete is not bound by answer limits — «protected» limits only new
 * answers. Restoring a held Q&A answer on a question that already has
 * MAX_ANSWERS live ones counts it (11 > 10): the count stays truthful, and
 * `LegalQaService.answer` keeps refusing new answers while it is at or
 * above the cap (legal-qa.service.spec.ts, Q7).
 */
function build(answerCount: number) {
  const question = { id: 'q1', answer_count: answerCount };
  const tx = {
    legalAnswer: {
      update: jest
        .fn()
        .mockResolvedValue({ question_id: 'q1', is_best: false }),
    },
    legalQuestion: {
      // A tiny in-memory question: applies the increment only when every
      // `where` condition the caller sets holds (as Postgres would).
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; answer_count?: { lt?: number } };
          data: { answer_count?: { increment: number } };
        }) => {
          const lt = where.answer_count?.lt;
          if (where.id !== question.id) return Promise.resolve({ count: 0 });
          if (lt !== undefined && !(question.answer_count < lt)) {
            return Promise.resolve({ count: 0 });
          }
          question.answer_count += data.answer_count?.increment ?? 0;
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  const settings = { boolean: jest.fn().mockResolvedValue(true) };
  const svc = new ModerationService(
    {} as never,
    { bump: jest.fn() } as never,
    settings as never,
    {} as never,
  );
  return { svc, tx, question };
}

describe('ModerationService restore of a Q&A answer past the cap (Q7, pin)', () => {
  it(`a moderator restore counts the answer even when the question already has ${MAX_ANSWERS}`, async () => {
    const { svc, tx, question } = build(MAX_ANSWERS);
    const prev = await svc.setContentStatus(
      tx as never,
      {
        type: 'legal_answer',
        id: 'a1',
        authorId: 'att',
        status: 'hidden',
        authorDeleted: false,
        text: 'held answer',
        context: { questionId: 'q1' },
        createdAt: new Date(),
      } as never,
      'restore',
      [],
    );
    expect(prev).toBe('hidden');
    expect(tx.legalAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
    expect(question.answer_count).toBe(MAX_ANSWERS + 1);
  });
});
