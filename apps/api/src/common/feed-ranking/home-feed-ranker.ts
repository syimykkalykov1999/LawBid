/**
 * Owner 25.11 («умную ленту для всех лент», Instagram home feed): what the
 * feed (GET /feed, FeedService) needs from the posts ranking to order its
 * candidate window and log its impressions. RecommendationsService
 * implements it; HomeFeedRankerModule binds it globally, so the feed
 * module does not import the recommendations module (its fan-out stays,
 * src/architecture/module-boundaries.spec.ts).
 */
export const HOME_FEED_RANKER = Symbol('HOME_FEED_RANKER');

/** The viewer's arm of the posts ranker test (null = not in it). */
export type HomeFeedArm = {
  experimentKey: string;
  variant: string;
  weights?: Record<string, number>;
} | null;

export interface HomeFeedRanker {
  /** The viewer's arm of the posts ranker test. */
  homeFeedArm(viewerId: string): Promise<HomeFeedArm>;
  /** True for the arm the model ranks. */
  isHomeModelArm(a: HomeFeedArm | undefined): boolean;
  /** [ids] (the window, in the feed's order) ordered by the model, [lead]
   * on top; null = no model / scoring failed (the feed stays as it is). */
  rankHomeWindow(
    viewerId: string,
    ids: readonly string[],
    lead: ReadonlySet<string>,
    arm: HomeFeedArm,
  ): Promise<{
    ids: string[];
    rows: Map<string, Record<string, number>>;
  } | null>;
  /** One served page, for the training data (never throws). */
  logHomeServed(
    viewerId: string,
    ids: readonly string[],
    offset: number,
    arm: HomeFeedArm,
    rows?: ReadonlyMap<string, Record<string, number>>,
  ): Promise<void>;
}

/** CONTENT M-6 / owner 25.11: a ranked list a viewer started paging is
 * kept this long (Search «Для вас», the home feed's window). */
export const RANKED_PIN_TTL_SEC = 15 * 60;
