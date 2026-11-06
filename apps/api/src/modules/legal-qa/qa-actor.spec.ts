import { ASSISTANT_DUTIES } from '../assistants/assistant-duties';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { QA_ANSWERS_DUTY, qaActor } from './qa-actor';

const base: RequestUser = {
  sub: 'att-1',
  role: 'attorney',
  sid: 's',
  verified: true,
  subscriptionStatus: 'active',
};
const assistant = (duties: string[]): RequestUser => ({
  ...base,
  assistant: { userId: 'asst-1', membershipId: 'm1', name: 'Ann', duties },
});

/** R-401: assistants answer only with the «qa_answers» duty, in the
 * attorney's name. */
describe('qaActor', () => {
  it('the duty is in the catalog the attorney switches on', () => {
    expect(ASSISTANT_DUTIES).toContain(QA_ANSWERS_DUTY);
  });

  it('the attorney answers as themself', () => {
    expect(qaActor(base)).toEqual({ attorneyId: 'att-1', authoredBy: null });
  });

  it('an assistant without the duty is read-only', () => {
    expect(qaActor(assistant(['chats', 'bids']))).toBeNull();
  });

  it('an assistant with the duty answers for the attorney, and is remembered', () => {
    expect(qaActor(assistant(['chats', QA_ANSWERS_DUTY]))).toEqual({
      attorneyId: 'att-1',
      authoredBy: 'asst-1',
    });
  });

  it('clients never answer', () => {
    expect(qaActor({ ...base, role: 'client' })).toBeNull();
  });
});
