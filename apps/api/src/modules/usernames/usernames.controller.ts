import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { UsernamePolicyService } from './username-policy.service';
import { UsernameCheckDto, UsernameCheckQueryDto } from './usernames.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner 2026-10-20 (Telegram): the live «is this @username free?» of the
 * person, channel and group forms. */
@ApiTags('usernames')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('usernames')
export class UsernamesController {
  constructor(private readonly policy: UsernamePolicyService) {}

  /** Rate-limited: an enumeration aid otherwise. */
  @Get('check')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiEnvelopeResponse(UsernameCheckDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  check(
    @CurrentUser() user: RequestUser,
    @Query() q: UsernameCheckQueryDto,
  ): Promise<UsernameCheckDto> {
    const owner =
      q.kind !== 'user' && q.id && UUID.test(q.id)
        ? { type: q.kind, id: q.id }
        : undefined;
    return this.policy.check(
      q.u,
      q.kind,
      { userId: user.sub, owner },
      { title: q.title },
    );
  }
}
