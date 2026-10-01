import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { AssistantSelf } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { PresenceService } from './presence.service';

export class ActivityStatusDto {
  @ApiProperty({
    description:
      "Others see when I am online / last seen; off = I see nobody's either.",
  })
  @IsBoolean()
  showActivityStatus!: boolean;
}

/** Owner 2026-10-01: the activity-status switch (Settings → Privacy). */
@ApiTags('presence')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('users/me/activity-status')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get()
  @AssistantSelf()
  @ApiOperation({ summary: 'My activity-status setting' })
  @ApiEnvelopeResponse(ActivityStatusDto)
  async getActivityStatus(
    @CurrentUser() user: RequestUser,
  ): Promise<ActivityStatusDto> {
    return { showActivityStatus: await this.presence.visible(user.sub) };
  }

  @Put()
  @AssistantSelf()
  @ApiOperation({ summary: 'Show / hide my activity status' })
  @ApiEnvelopeResponse(ActivityStatusDto)
  async setActivityStatus(
    @CurrentUser() user: RequestUser,
    @Body() dto: ActivityStatusDto,
  ): Promise<ActivityStatusDto> {
    return {
      showActivityStatus: await this.presence.setVisible(
        user.sub,
        dto.showActivityStatus,
      ),
    };
  }
}
