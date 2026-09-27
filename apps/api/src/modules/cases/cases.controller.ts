import {
  Controller,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { OnboardingService } from '../users/services/onboarding.service';

/**
 * Stub of POST /cases (docs/01_FOUNDATION_AUTH.md §15 stage 1.7 acceptance
 * item 9): until file 04 implements case creation, it only enforces the
 * server-side contact gate from §11 step 3A — a client without BOTH a
 * verified phone and email gets CLIENT_CONTACTS_INCOMPLETE.
 * TODO(docs/04_CASES_BIDS.md §3, stage 4.2): real case creation.
 */
@Controller('cases')
export class CasesController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  async create(@CurrentUser() user: RequestUser): Promise<never> {
    const me = await this.onboarding.getMe(user.sub);
    if (me.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only clients can create cases.',
      });
    }
    if (!me.phoneVerified || !me.emailVerified) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_CONTACTS_INCOMPLETE,
        message: 'Verify your phone and email before posting a case.',
        details: {
          missing: [
            ...(me.phoneVerified ? [] : ['phone_verified']),
            ...(me.emailVerified ? [] : ['email_verified']),
          ],
        },
      });
    }
    throw new HttpException(
      {
        code: ErrorCode.NOT_IMPLEMENTED,
        message: 'Case creation arrives with file 04.',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
