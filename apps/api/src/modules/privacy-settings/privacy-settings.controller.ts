import { Body, Controller, Get, Ip, Patch, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
} from 'class-validator';
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
import {
  AUDIENCE_OPTIONS,
  type AudienceOption,
  LEGACY_AUDIENCES as AUDIENCES,
} from './privacy-audience';
import { PrivacySettingsService } from './privacy-settings.service';

type Audience = (typeof AUDIENCES)[number];

const SET_DOC =
  'Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow).';

/** An audience set in a response (absent on servers before 2026-10-28). */
const SetOut = () =>
  ApiPropertyOptional({
    enum: AUDIENCE_OPTIONS,
    enumName: 'PrivacyAudienceOption',
    isArray: true,
    description: SET_DOC,
  });

/** An audience set in a change; wins over the single old value. */
const SetIn = (): PropertyDecorator => (target, key) => {
  ApiPropertyOptional({
    enum: AUDIENCE_OPTIONS,
    enumName: 'PrivacyAudienceOption',
    isArray: true,
    description: `${SET_DOC} Wins over the single old value.`,
  })(target, key);
  IsOptional()(target, key);
  IsArray()(target, key);
  ArrayMinSize(1)(target, key);
  ArrayMaxSize(AUDIENCE_OPTIONS.length)(target, key);
  IsIn(AUDIENCE_OPTIONS, { each: true })(target, key);
};

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

  @SetOut()
  lastSeenAudiences?: AudienceOption[];

  @SetOut()
  messageFromAudiences?: AudienceOption[];

  @SetOut()
  callFromAudiences?: AudienceOption[];

  @SetOut()
  photoFromAudiences?: AudienceOption[];

  @SetOut()
  aboutFromAudiences?: AudienceOption[];

  @SetOut()
  groupAddFromAudiences?: AudienceOption[];

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-22 (CCPA/CPRA): «Do not sell or share my personal information» — true = opted out. Stored as a do_not_sell consent (in the data export), honoured by the analytics gate.',
  })
  doNotSell?: boolean;
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

  @SetIn()
  lastSeenAudiences?: AudienceOption[];

  @SetIn()
  messageFromAudiences?: AudienceOption[];

  @SetIn()
  callFromAudiences?: AudienceOption[];

  @SetIn()
  photoFromAudiences?: AudienceOption[];

  @SetIn()
  aboutFromAudiences?: AudienceOption[];

  @SetIn()
  groupAddFromAudiences?: AudienceOption[];

  @ApiPropertyOptional({
    description:
      'CCPA/CPRA «Do not sell or share my personal information»: true = opt out, false = allow again.',
  })
  @IsOptional()
  @IsBoolean()
  doNotSell?: boolean;
}

/** Owner 2026-10-20: Settings → Privacy (who sees last seen, writes, calls).
 * Owner 2026-10-28: each also as a set incl. followers / following. */
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
    @Ip() ip: string,
  ): Promise<PrivacySettingsDto> {
    return this.privacy.update(user.sub, dto, { ip: ip || undefined });
  }

  /** Owner 2026-10-22: the same partial update under the verb the
   * settings screen uses (CCPA «Do not sell or share» lives here too). */
  @Patch()
  @AssistantSelf()
  @ApiOperation({
    summary:
      'Change my privacy settings (any subset), incl. the CCPA «Do not sell or share» switch',
  })
  @ApiEnvelopeResponse(PrivacySettingsDto)
  patchPrivacySettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdatePrivacySettingsDto,
    @Ip() ip: string,
  ): Promise<PrivacySettingsDto> {
    return this.privacy.update(user.sub, dto, { ip: ip || undefined });
  }
}
