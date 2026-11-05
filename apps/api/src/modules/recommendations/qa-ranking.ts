import { clamp01, DAY_MS, logScale, saturate, weighted } from './ranking.math';

/**
 * R-401 (owner 2026-11-04): how answering clients' questions lifts an
 * attorney in the recommendations. Pure maths, computed by the nightly
 * snapshot job (qa-snapshot.service.ts) — never on a page open.
 *
 * Copied public schemes (RULE #1, no own formulas):
 *  - time decay = Hacker News "gravity": score = points / (age + 2)^1.8
 *    (news.arc, `(/ (- p 1) (expt (+ t 2) gravity))`, documented in
 *    "How Hacker News ranking algorithm works", Amir Salihefendic 2010).
 *    Age is counted in weeks here (a 90-day window; HN counts hours).
 *  - helpfulness of the answers = Wilson score lower bound (z = 1.96),
 *    Evan Miller, "How Not To Sort By Average Rating" (2009) — the same
 *    sort Reddit uses for "best" comments. A trial is an answer, a success
 *    is an answer at least one client liked; few answers cannot win on a
 *    lucky 100 %.
 *  - volume on a log scale (Reddit "hot": log10 of the votes).
 */

/** Weights of the attorney's Q&A score (admin: reco.qa.*). */
export const QA_WEIGHTS = {
  /** Answers in the window, decayed. */
  answers: 0.5,
  /** Likes on them: Wilson share of liked answers + log volume. */
  likes: 0.3,
  /** Answers the asker marked best, decayed. */
  best: 0.2,
} as const;

/** HN gravity: 1.8 as on Hacker News (admin: reco.qa.gravity). */
export const QA_GRAVITY = 1.8;
/** Answers older than this do not count. */
export const QA_WINDOW_DAYS = 90;
/** How the Q&A score and topic match enter the people ranking
 * (admin: reco.people.qa, reco.people.qaTopic) — added on top of
 * personScore so the existing weights (sum 1) stay as they are. */
export const QA_PEOPLE_BOOST = { qa: 0.1, qaTopic: 0.08 } as const;
/** The attorney's answered topics vs a case's category
 * (admin: reco.case.qaTopic). */
export const QA_CASE_BOOST = 0.08;

const WEEK_MS = 7 * DAY_MS;

/** HN gravity weight of something [ageMs] old: 1/(weeks + 2)^gravity. */
export function hnWeight(ageMs: number, gravity = QA_GRAVITY): number {
  const weeks = Math.max(0, ageMs) / WEEK_MS;
  return 1 / Math.pow(weeks + 2, gravity);
}

/**
 * Wilson score interval, lower bound (Evan Miller 2009):
 * (p̂ + z²/2n − z·√((p̂(1−p̂) + z²/4n)/n)) / (1 + z²/n). 0 for n = 0.
 */
export function wilsonLower(positive: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = Math.min(1, Math.max(0, positive / n));
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return clamp01((centre - margin) / denominator);
}

/** One published answer of the attorney, as the job reads it. */
export interface QaAnswerFact {
  createdAt: Date;
  likes: number;
  best: boolean;
  /** Practice category id of the question (null = no topic). */
  category: string | null;
}

export interface QaAttorneyEntry {
  /** 0..1 — the weighted Q&A score. */
  score: number;
  /** Practice category id → share 0..1 of the (decayed) answers; the
   * strongest topic = 1 (same shape as the viewer's interests). */
  topics: Record<string, number>;
  counts: { answers: number; likes: number; best: number };
}

export type QaFeatures = Record<keyof typeof QA_WEIGHTS, number>;

/** Features 0..1 of an attorney from their answers of the window. */
export function qaFeatures(
  facts: readonly QaAnswerFact[],
  now: number,
  gravity = QA_GRAVITY,
): { features: QaFeatures; topics: Record<string, number> } {
  const fresh = hnWeight(0, gravity);
  let answers = 0;
  let best = 0;
  let likesDecayed = 0;
  let liked = 0;
  const byTopic = new Map<string, number>();
  for (const f of facts) {
    const w = hnWeight(now - f.createdAt.getTime(), gravity) / fresh;
    answers += w;
    if (f.best) best += w;
    likesDecayed += w * Math.max(0, f.likes);
    if (f.likes > 0) liked++;
    if (f.category) {
      byTopic.set(f.category, (byTopic.get(f.category) ?? 0) + w);
    }
  }
  const max = Math.max(0, ...byTopic.values());
  const topics: Record<string, number> = {};
  if (max > 0) for (const [k, v] of byTopic) topics[k] = v / max;
  return {
    features: {
      // 6 fresh answers ≈ 0.63, 20 ≈ 0.96.
      answers: saturate(answers, 6),
      likes:
        0.5 * wilsonLower(liked, facts.length) +
        0.5 * logScale(likesDecayed, 50),
      best: saturate(best, 3),
    },
    topics,
  };
}

/** The attorney's 0..1 Q&A score from the features and the admin weights. */
export function qaScore(
  features: QaFeatures,
  weights: QaFeatures = QA_WEIGHTS,
): number {
  return clamp01(weighted(weights, features));
}

/** Σ topic share × interest: how much the attorney's answered topics are
 * what the viewer searches for (both 0..1 maps, strongest = 1). */
export function topicMatch(
  topics: Record<string, number> | undefined,
  interests: ReadonlyMap<string, number>,
): number {
  if (!topics) return 0;
  let s = 0;
  for (const [cat, share] of Object.entries(topics)) {
    s += share * (interests.get(cat) ?? 0);
  }
  return clamp01(s);
}

/** Added on top of personScore (0..1 + jitter): the snapshot's Q&A score
 * and the topic match, each with its admin weight. 0 without a snapshot. */
export function qaPeopleBoost(
  entry: QaAttorneyEntry | undefined,
  interests: ReadonlyMap<string, number>,
  w: { qa: number; qaTopic: number } = QA_PEOPLE_BOOST,
): number {
  if (!entry) return 0;
  return (
    w.qa * clamp01(entry.score) +
    w.qaTopic * topicMatch(entry.topics, interests)
  );
}

/** Added on top of caseScore for an attorney: the case's category among
 * the attorney's answered topics (they answer such questions, so they
 * want such cases). */
export function qaCaseBoost(
  entry: QaAttorneyEntry | undefined,
  categoryId: string,
  w = QA_CASE_BOOST,
): number {
  if (!entry) return 0;
  return w * clamp01(entry.topics[categoryId] ?? 0);
}

/**
 * An open question / case for the attorney's «recommended» list: HN gravity
 * on its age × room left (a question with 9 of 10 answers, a case with many
 * offers, is less worth recommending). 0..1.
 */
export function openItemScore(
  createdAt: Date,
  taken: number,
  capacity: number,
  now: number,
  gravity = QA_GRAVITY,
): number {
  const fresh = hnWeight(0, gravity);
  const age = hnWeight(now - createdAt.getTime(), gravity) / fresh;
  const room = capacity > 0 ? clamp01(1 - taken / capacity) : 1;
  return clamp01(age * (0.5 + 0.5 * room));
}
