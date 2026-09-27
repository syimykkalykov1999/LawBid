import {
  Controller,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
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
@ApiTags('cases')
@ApiBearerAuth()
@Controller('cases')
export class CasesController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  @ApiOperation({
    summary: 'Stub until docs/04_CASES_BIDS.md §3 (stage 4.2)',
    description:
      'Only enforces the §11 step 3A contact gate: never succeeds yet. A client with both contacts verified gets 501 NOT_IMPLEMENTED.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'Not returned yet: the response body is defined with case creation (docs/04 §3, stage 4.2).',
  })
  @ApiErrors({
    ...AUTHENTICATED_ERRORS,
    403: [ErrorCode.FORBIDDEN, ErrorCode.CLIENT_CONTACTS_INCOMPLETE],
    404: [ErrorCode.NOT_FOUND],
    501: [ErrorCode.NOT_IMPLEMENTED],
  })
  async createCase(@CurrentUser() user: RequestUser): Promise<never> {
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
