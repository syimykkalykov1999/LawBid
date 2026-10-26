import { ForbiddenException, Injectable } from '@nestjs/common';
import { demoContext } from '../../../common/demo/demo-context';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AUTH_EVENT_TYPES, AuthEventService } from './auth-event.service';
import { TokenService } from './token.service';

/**
 * Owner 2026-10-08: in a DEMO session the re-auth one-time code can never
 * arrive (the demo world's SMS/e-mail providers are no-ops and demo users
 * have no real contacts), so store reviewers got stuck before case history
 * export, «Скачать мои данные» and account deletion. A demo session may
 * therefore get its reauth token without the code (POST /auth/reauth/demo).
 *
 * "Is demo" is decided on the server only: `demoContext.isDemo()` is true
 * for this request AND the access token itself carries the signed `demo`
 * claim (JwtAuthGuard already refuses any mismatch between the two, so a
 * client header alone can never get here). Everything else is unchanged:
 * the token is the ordinary single-use, 5-minute, session-bound reauth
 * token, checked by ReauthVerifier/ReauthGuard exactly as for real users,
 * and every write it unlocks goes to the demo database (PrismaService
 * follows the demo context). Real sessions get 403 FORBIDDEN and keep the
 * code step (POST /auth/reauth).
 */
@Injectable()
export class DemoReauthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly authEvents: AuthEventService,
  ) {}

  async issue(user: RequestUser): Promise<{ reauthToken: string }> {
    if (!demoContext.isDemo() || user.demo !== true) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only a demo session can skip the reauth code.',
      });
    }
    const reauthToken = this.tokens.signReauthToken({
      sub: user.sub,
      sid: user.sid,
    });
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.REAUTH_SUCCESS,
      success: true,
      meta: { demo: true },
    });
    return { reauthToken };
  }
}
