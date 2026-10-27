import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class MinorUserParamDto {
  @IsUUID()
  id!: string;
}

export class FlagMinorDto {
  @ApiProperty({ description: 'Why the account is believed to be a minor.' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  reason!: string;
}

export class SmsOptOutImportDto {
  @ApiProperty({
    description: 'E.164 numbers from the Twilio opt-out export (up to 1000).',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  phones!: string[];
}

export class MinorRowDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ description: 'attested | flagged | deleted' })
  status!: string;
  @ApiProperty({ nullable: true, type: String }) birthDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) flaggedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) flagReason!: string | null;
  @ApiProperty() attestedAt!: string;
  @ApiProperty() textVersion!: string;
}

export class MinorsListDto {
  @ApiProperty({ type: [MinorRowDto] }) items!: MinorRowDto[];
}

export class MinorActionResultDto {
  @ApiProperty() userId!: string;
  @ApiProperty({
    description: 'flagged | deleted | deletion_deferred | cleared',
  })
  result!: string;
}

export class SmsOptOutImportResultDto {
  @ApiProperty() added!: number;
  @ApiProperty() skipped!: number;
}

export class AgeGateConfigDto {
  @ApiProperty({ description: 'off | record | enforce' }) mode!: string;
  @ApiProperty() minAge!: number;
  @ApiProperty() textVersion!: string;
  @ApiProperty() requireBirthDate!: boolean;
}

export class SmsConsentRequestDto {
  @ApiProperty({ description: 'marketing | notifications' })
  @IsString()
  @MaxLength(16)
  purpose!: string;

  @ApiProperty({ description: 'The disclosure version the app showed.' })
  @IsString()
  @MaxLength(40)
  disclosureVersion!: string;
}

export class SmsDisclosureDto {
  @ApiProperty() version!: string;
  @ApiProperty() text!: string;
}

export class SmsConsentResultDto {
  @ApiProperty() recorded!: boolean;
  @ApiProperty({ description: 'The number sent STOP: it must text START.' })
  blockedUntilStart!: boolean;
}
