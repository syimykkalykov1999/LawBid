import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { PostPage } from '../posts/dto/posts.dto';

/** docs/05 §2.2: single entry of the feed. Profile promotion
 * (`profile_promotion` flag, off) plugs in behind this later. */
export interface FeedProvider {
  page(
    viewer: RequestUser,
    cursor: string | undefined,
    limit: number,
  ): Promise<PostPage>;
}

export const FEED_PROVIDER = Symbol('FEED_PROVIDER');
