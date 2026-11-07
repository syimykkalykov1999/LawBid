import type { RequestUser } from '../auth/decorators/current-user.decorator';

/** R-401: the duty an assistant needs to answer in «Вопрос юристу». */
export const QA_ANSWERS_DUTY = 'qa_answers';

export interface QaActor {
  /** Whose answer it is (always the attorney). */
  attorneyId: string;
  /** Who typed it: the assistant's user id, null for the attorney. */
  authoredBy: string | null;
}

/**
 * Who may write answers for this request: the attorney themself, or an
 * assistant inside the attorney's account holding the «qa_answers» duty
 * (JwtAuthGuard already made `sub` the attorney). Null = read-only
 * (clients, assistants without the duty).
 */
export function qaActor(user: RequestUser): QaActor | null {
  if (user.role !== 'attorney') return null;
  if (!user.assistant) return { attorneyId: user.sub, authoredBy: null };
  if (!user.assistant.duties.includes(QA_ANSWERS_DUTY)) return null;
  return { attorneyId: user.sub, authoredBy: user.assistant.userId };
}
