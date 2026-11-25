/**
 * Owner row 87 (hotline plan PR 7): what the hotline asks of the cases
 * family — «Предложить дело» (our ordinary case + its invite to the call's
 * attorney) and a person's photo — as a PORT. The cases module provides it
 * (cases/hotline-cases.adapter.ts); the hotline reads it by this token, so
 * neither module imports the other (module-boundaries rule: no new deep
 * import, no fan-out growth).
 */
export const HOTLINE_CASES_PORT = Symbol('HOTLINE_CASES_PORT');

/** «Предложить дело»: the client's case from the call. */
export interface HotlineCaseOffer {
  /** The client as the request carries it (`RequestUser`). */
  client: { sub: string; assistant?: unknown };
  attorneyId: string;
  /** The request's practice code (a category picks its first leaf). */
  practiceArea: string;
  state: string;
  topic: string;
  budgetAmountDollars?: number;
  message?: string;
  clientContactSharingConsent?: boolean;
  meta: { ip?: string; userAgent?: string; deviceId?: string };
}

export interface HotlineCasesPort {
  /** Our ordinary case (the client's checks, limits, contact filter, the
   * current legal documents accepted) + our ordinary invite. */
  offerCase(i: HotlineCaseOffer): Promise<{ caseId: string; inviteId: string }>;
  /** A person's photo for the hotline screens (null: none / hidden). */
  avatarUrl(fileId: string | null | undefined): Promise<string | null>;
}

/** The case title (10–120 chars, cases DTO): the topic, made long enough
 * with the practice's name when it is a word or two («Развод»). */
export function caseTitleOf(topic: string, practice: string): string {
  const t = topic.trim();
  const title = t.length >= 10 ? t : `${t} — ${practice}`.trim();
  return (title.length >= 10 ? title : title.padEnd(10, '.')).slice(0, 120);
}

/** The case description (≥ 20 chars): the topic, the practice and state. */
export function caseDescriptionOf(
  topic: string,
  practice: string,
  state: string,
): string {
  const d = `${topic.trim()}\n\n${practice} · ${state}`;
  return d.length >= 20 ? d : d.padEnd(20, '.');
}
