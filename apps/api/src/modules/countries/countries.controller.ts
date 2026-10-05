import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import {
  CountryDto,
  CountryWaitlistResultDto,
  JoinCountryWaitlistDto,
} from './countries.dto';
import { CountriesService } from './countries.service';

/** Owner 2026-10-05: the countries LawBid works in. Public: the app reads
 * them before sign-up (phone country, states/provinces). */
@ApiTags('countries')
@ApiErrors(COMMON_ERRORS)
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Switched-on countries with their regions (states / provinces), calling code and currency',
  })
  @ApiEnvelopeResponse(CountryDto, { isArray: true })
  listCountries(): Promise<CountryDto[]> {
    return this.countries.enabled();
  }

  @Public()
  @Post('waitlist')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      '"Tell me when LawBid opens in my country": an e-mail goes out by itself when the country is switched on',
  })
  @ApiEnvelopeResponse(CountryWaitlistResultDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 404: [ErrorCode.NOT_FOUND] })
  joinCountryWaitlist(
    @Body() dto: JoinCountryWaitlistDto,
  ): Promise<CountryWaitlistResultDto> {
    return this.countries.joinWaitlist(dto.countryCode, dto.email, dto.locale);
  }
}
