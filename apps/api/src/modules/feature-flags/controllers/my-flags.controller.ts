import { Controller, Get, Header } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { FeatureFlagsService } from '../services/feature-flags.service';

export class MyFlagsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description:
      'Every flag as THIS user sees it: a flag rolled out to part of the users is resolved by a stable hash of (flag, user).',
  })
  flags!: Record<string, boolean>;
}

/**
 * `GET /config/flags` (owner 2026-10-25): the signed-in user's flags with
 * percentage rollouts applied. `GET /config/bootstrap` stays public and
 * cached, so it shows a partly rolled-out flag as off; the app can read
 * this after sign-in to get its own answer.
 */
@ApiTags('config')
@Controller('config')
export class MyFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get('flags')
  @Header('Cache-Control', 'private, no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Feature flags for the signed-in user (rollout applied)',
  })
  @ApiEnvelopeResponse(MyFlagsDto)
  @ApiErrors({ 401: [ErrorCode.UNAUTHORIZED, ErrorCode.TOKEN_EXPIRED] })
  async myFeatureFlags(@CurrentUser() user: RequestUser): Promise<MyFlagsDto> {
    return { flags: await this.flags.getFlagsFor(user.sub) };
  }
}
