import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * 2026-10-25 (COPPA / 18+): sent with the FIRST sign-in of a new account
 * (OTP code, e-mail link or Google/Apple). Ignored for an existing
 * account. The app needs a checkbox "I am 18 or older" that sends this;
 * until it does, compliance.age_gate.mode stays `off`.
 */
export class AgeAttestationDto {
  @ApiProperty({ description: 'The person ticked "I am 18 or older".' })
  @IsBoolean()
  confirmed!: boolean;

  @ApiProperty({
    description:
      'Wording version shown next to the checkbox (GET /config/age-gate).',
  })
  @IsString()
  @MaxLength(40)
  textVersion!: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD; optional.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string;
}
