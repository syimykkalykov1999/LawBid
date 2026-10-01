import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

/** Route → activity key the attorney's Team feed localizes. */
const ACTIONS: Record<string, string> = {
  'POST /conversations/:id/messages': 'chat.message',
  'POST /conversations/:id/read': 'chat.read',
  'POST /conversations/:id/request/accept': 'chat.request_accept',
  'POST /conversations/:id/request/decline': 'chat.request_decline',
  'POST /conversations/direct': 'chat.open',
  'PATCH /conversations/:id/mute': 'chat.mute',
  'POST /conversations/:id/calls': 'call.start',
  'POST /calls/:id/accept': 'call.accept',
  'POST /calls/:id/decline': 'call.decline',
  'POST /calls/:id/end': 'call.end',
  'POST /files/uploads': 'file.upload',
  'POST /cases/:id/save': 'case.save',
  'DELETE /cases/:id/save': 'case.unsave',
  'POST /cases/:id/hide': 'case.hide',
  'POST /cases/:id/share': 'case.share',
  'PUT /cases/:id/bid-draft': 'bid.draft',
  'DELETE /cases/:id/bid-draft': 'bid.draft_delete',
  'POST /posts/:id/like': 'post.like',
  'DELETE /posts/:id/like': 'post.unlike',
  'POST /posts/:id/save': 'post.save',
  'DELETE /posts/:id/save': 'post.unsave',
  'POST /users/:id/follow': 'user.follow',
  'DELETE /users/:id/follow': 'user.unfollow',
  'POST /reports': 'report.create',
};

/** Routes that write their own, richer entries. */
const SELF_LOGGED = /^\/(team\/requests|tasks)/;

/**
 * Owner 2026-09-30 (OQ-048): "every action of the assistant is recorded"
 * — each successful change an assistant makes inside the attorney's
 * account lands in the Team activity feed (the assistant can't see it).
 */
@Injectable()
export class AssistantActivityInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{
      method: string;
      user?: RequestUser;
      route?: { path?: string };
      params?: Record<string, string>;
    }>();
    const a = req.user?.assistant;
    if (!a || req.method === 'GET') return next.handle();
    const path = (req.route?.path ?? '').replace(/^\/api\/v\d+/, '');
    if (SELF_LOGGED.test(path)) return next.handle();
    const key = `${req.method} ${path}`;
    const attorneyId = req.user!.sub;
    return next.handle().pipe(
      tap(() => {
        void this.prisma.assistantActivity
          .create({
            data: {
              attorney_id: attorneyId,
              membership_id: a.membershipId,
              action: ACTIONS[key] ?? key.slice(0, 120),
              target_type: path.split('/')[1] ?? null,
              target_id: req.params?.id ?? req.params?.caseId ?? null,
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}
