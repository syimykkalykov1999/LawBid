import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  ApplyReferralDto,
  ApplyReferralResultDto,
  ReferralMeDto,
} from './referrals.dto';
import { ReferralsService } from './referrals.service';

const E = ErrorCode;

/** Owner 2026-10-02: the app's referral screen. */
@ApiTags('referrals')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'My referral code, share link, invite counts and rewards',
  })
  @ApiEnvelopeResponse(ReferralMeDto)
  getMyReferrals(@CurrentUser() user: RequestUser): Promise<ReferralMeDto> {
    return this.referrals.me(user.sub);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      "Enter a friend's code (once, within the sign-up window, not your own)",
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'A retry with the same key and body returns the first result.',
  })
  @ApiEnvelopeResponse(ApplyReferralResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FEATURE_DISABLED],
    404: [E.REFERRAL_CODE_INVALID],
    409: [E.REFERRAL_NOT_ALLOWED, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  applyReferral(
    @CurrentUser() user: RequestUser,
    @Body() dto: ApplyReferralDto,
  ): Promise<ApplyReferralResultDto> {
    return this.referrals.apply(user.sub, dto.code);
  }
}
