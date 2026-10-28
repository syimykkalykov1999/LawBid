import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { LOGICAL_SHARDS, hashShard, shardOf } from './shard-id';
import { ShardStore, shardContext } from './shard-context';

/**
 * Shard-ready step 4: opens the shard context of an HTTP request. Cheap by
 * design: it only looks at the route's path parameters (no query, no body),
 * in this order:
 *
 *  1. `:caseId` / `:conversationId` / `:bidId`       -> the shard in that id
 *  2. `:id` under a case-family or content route     -> the shard in that id
 *     (cases, bids, conversations, calls, messages, reviews, client-reviews,
 *      case-comments, payment-requests, posts, comments)
 *  3. `:userId`                                      -> hashShard(user id)
 *  4. the signed-in user (req.user.sub)              -> hashShard(user id),
 *     source `auth`: a WEAK context (right for the user's own data, a guess
 *     for anything else; sharded queries under it are counted separately)
 *  5. nothing                                        -> no context: primary
 *
 * Ids made by `newShardedId` carry their shard; a legacy random v4 id falls
 * back to its last byte (`shardOf`), which is only correct while all shards
 * share one database (documented in docs/architecture/SHARDING_READY.md).
 * Never throws: an unparsable id simply means no context.
 */
const ID_PARAMS = ['caseId', 'conversationId', 'bidId'] as const;

/** Route segments whose `:id` is the id of a case-family / content row. */
const SHARDED_ID_ROUTES = new Set([
  'cases',
  'bids',
  'conversations',
  'calls',
  'messages',
  'reviews',
  'client-reviews',
  'case-comments',
  'payment-requests',
  'posts',
  'comments',
  // Deal record 2026-10-27: ids made with newShardedId(shardOf(caseId)).
  'deal-records',
]);

const ID_ROUTE_RE = /\/([a-z][a-z-]*)\/:id(?:\/|$)/;

function tryShard(f: (id: string) => number, id: unknown): number | null {
  if (typeof id !== 'string') return null;
  try {
    const n = f(id);
    return n >= 0 && n < LOGICAL_SHARDS ? n : null;
  } catch {
    return null;
  }
}

interface RequestLike {
  route?: { path?: unknown };
  params?: Record<string, unknown>;
  user?: { sub?: unknown };
}

/** The context of a request (exported for tests); undefined = none. */
export function shardStoreForRequest(req: RequestLike): ShardStore | undefined {
  const params = req.params ?? {};
  for (const p of ID_PARAMS) {
    const n = tryShard(shardOf, params[p]);
    if (n !== null) return { shard: n, source: `param:${p}` };
  }
  const routePath = typeof req.route?.path === 'string' ? req.route.path : '';
  const seg = ID_ROUTE_RE.exec(routePath)?.[1];
  if (seg && SHARDED_ID_ROUTES.has(seg)) {
    const n = tryShard(shardOf, params.id);
    if (n !== null) return { shard: n, source: `route:${seg}` };
  }
  const byUser = tryShard(hashShard, params.userId);
  if (byUser !== null) return { shard: byUser, source: 'param:userId' };
  const auth = tryShard(hashShard, req.user?.sub);
  if (auth !== null) return { shard: auth, source: 'auth' };
  return undefined;
}

@Injectable()
export class ShardContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const store = shardStoreForRequest(
      ctx.switchToHttp().getRequest<RequestLike>(),
    );
    if (!store || store.shard === undefined) return next.handle();
    const { shard, source } = store;
    return new Observable((subscriber) =>
      shardContext.run(
        shard,
        () => next.handle().subscribe(subscriber),
        source,
      ),
    );
  }
}
