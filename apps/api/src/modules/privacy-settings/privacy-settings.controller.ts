import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
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
import { PrivacySettingsService } from './privacy-settings.service';

const AUDIENCES = ['everyone', 'contacts', 'nobody'] as const;
type Audience = (typeof AUDIENCES)[number];

export class PrivacySettingsDto {
  @ApiProperty({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  lastSeen!: Audience;

  @ApiProperty({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  messageFrom!: Audience;

  @ApiProperty({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  callFrom!: Audience;

  @ApiProperty({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  photoFrom!: Audience;

  @ApiProperty({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  aboutFrom!: Audience;

  @ApiProperty({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  groupAddFrom!: Audience;
}

export class UpdatePrivacySettingsDto {
  @ApiPropertyOptional({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  @IsOptional()
  @IsEnum(AUDIENCES)
  lastSeen?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  @IsOptional()
  @IsEnum(AUDIENCES)
  messageFrom?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  @IsOptional()
  @IsEnum(AUDIENCES)
  callFrom?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  @IsOptional()
  @IsEnum(AUDIENCES)
  photoFrom?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  @IsOptional()
  @IsEnum(AUDIENCES)
  aboutFrom?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES, enumName: 'PrivacyAudience' })
  @IsOptional()
  @IsEnum(AUDIENCES)
  groupAddFrom?: Audience;
}

/** Owner 2026-10-20: Settings → Privacy (who sees last seen, writes, calls). */
@ApiTags('privacy')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('users/me/privacy')
export class PrivacySettingsController {
  constructor(private readonly privacy: PrivacySettingsService) {}

  @Get()
  @AssistantSelf()
  @ApiOperation({ summary: 'My privacy settings' })
  @ApiEnvelopeResponse(PrivacySettingsDto)
  getPrivacySettings(
    @CurrentUser() user: RequestUser,
  ): Promise<PrivacySettingsDto> {
    return this.privacy.get(user.sub);
  }

  @Put()
  @AssistantSelf()
  @ApiOperation({ summary: 'Change my privacy settings (any subset)' })
  @ApiEnvelopeResponse(PrivacySettingsDto)
  updatePrivacySettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettingsDto> {
    return this.privacy.update(user.sub, dto);
  }
}
