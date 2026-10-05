import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { REGION_CODE_PATTERN } from '../../common/reference-data/countries';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CountryRegionDto {
  @ApiProperty({ example: 'NY', description: 'Region (state) code.' })
  code!: string;
  @ApiProperty({ example: 'New York' }) name!: string;
  @ApiProperty({ type: String, nullable: true, example: 'US-NY' })
  isoCode!: string | null;
}

/** A switched-on country, as the apps list it. */
export class CountryDto {
  @ApiProperty({ example: 'US' }) code!: string;
  @ApiProperty({ example: 'United States' }) name!: string;
  @ApiProperty({ example: '1', description: 'Calling code without "+".' })
  callingCode!: string;
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ example: 'en' }) language!: string;
  @ApiProperty({ enum: ['state', 'province', 'region'] }) regionKind!: string;
  @ApiProperty({ type: String, nullable: true, example: 'America/New_York' })
  timezone!: string | null;
  @ApiProperty({ description: 'In-app payments to attorneys work here.' })
  stripeSupported!: boolean;
  @ApiProperty({ type: [CountryRegionDto] }) regions!: CountryRegionDto[];
}

export class JoinCountryWaitlistDto {
  @ApiProperty({ example: 'CA' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @ApiProperty({ format: 'email' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)
  locale?: string;
}

export class CountryWaitlistResultDto {
  @ApiProperty({ example: 'CA' }) countryCode!: string;
  @ApiProperty({
    description: 'True when the country is already open (nothing to wait for).',
  })
  available!: boolean;
}

// ---- admin ---------------------------------------------------------------

export class CountryAdminDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() callingCode!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() language!: string;
  @ApiProperty() regionKind!: string;
  @ApiProperty({ type: String, nullable: true }) timezone!: string | null;
  @ApiProperty() stripeSupported!: boolean;
  @ApiProperty({ type: 'integer' }) sort!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enabledAt!: string | null;
  @ApiProperty({ type: 'integer', description: 'Active regions.' })
  regions!: number;
  @ApiProperty({ type: 'integer' }) clients!: number;
  @ApiProperty({ type: 'integer' }) attorneys!: number;
  @ApiProperty({
    type: 'integer',
    description: 'People waiting to be told it is open.',
  })
  waiting!: number;
  @ApiProperty({
    description:
      'Can be switched on: it has regions (states/provinces) to pick.',
  })
  ready!: boolean;
}

export class CountriesAdminDto {
  @ApiProperty({ type: [CountryAdminDto] }) countries!: CountryAdminDto[];
  @ApiProperty({
    description:
      'E-mail the waiting list by itself when a country is switched on.',
  })
  notifyWaitlist!: boolean;
  @ApiProperty({
    description: 'The caller may use the master switch (owner only).',
  })
  canBulk!: boolean;
}

export class CountryCodeParamDto {
  @ApiProperty({ example: 'CA' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  code!: string;
}

export class UpdateCountryDto {
  @ApiProperty() @IsBoolean() isEnabled!: boolean;
}

export class BulkCountriesDto {
  @ApiProperty({ description: 'Switch on (true) or off (false).' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Only these countries; omitted = every country.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @Matches(/^[A-Z]{2}$/, { each: true })
  codes?: string[];
}

export class BulkCountriesResultDto {
  @ApiProperty({ type: [String] }) changed!: string[];
  @ApiProperty({
    type: [String],
    description: 'Left off: no regions to pick yet.',
  })
  skipped!: string[];
}

export class UpdateCountrySettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyWaitlist?: boolean;
}

export class CountryRegionAdminDto extends CountryRegionDto {
  @ApiProperty() isActive!: boolean;
}

export class AddCountryRegionDto {
  @ApiProperty({ pattern: REGION_CODE_PATTERN, example: 'ON' })
  @Transform(upper)
  @Matches(new RegExp(REGION_CODE_PATTERN))
  code!: string;

  @ApiProperty({ example: 'Ontario' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'CA-ON' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)
  isoCode?: string;
}

export class CountryRegionParamDto {
  @ApiProperty({ example: 'CA' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  code!: string;

  @ApiProperty({ pattern: REGION_CODE_PATTERN })
  @Transform(upper)
  @Matches(new RegExp(REGION_CODE_PATTERN))
  region!: string;
}

export class UpdateCountryRegionDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
