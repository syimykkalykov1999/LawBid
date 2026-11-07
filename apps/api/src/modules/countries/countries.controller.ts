import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { ipBucket } from '../../common/net/ip-bucket';
import { RateLimitService } from '../auth/auth.public';
import { Public } from '../auth/decorators/public.decorator';
import {
  CountryDto,
  CountryWaitlistResultDto,
  JoinCountryWaitlistDto,
} from './countries.dto';
import { CountriesService } from './countries.service';

const VOTES_PER_IP_PER_DAY = 30;

/** Owner 2026-10-05: the countries LawBid works in. Public: the app reads
 * them before sign-up (phone country, states/provinces). */
@ApiTags('countries')
@ApiErrors(COMMON_ERRORS)
@Controller('countries')
export class CountriesController {
  constructor(
    private readonly countries: CountriesService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
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
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.NOT_FOUND],
  })
  async joinCountryWaitlist(
    @Body() dto: JoinCountryWaitlistDto,
    @Req() req: Request,
  ): Promise<CountryWaitlistResultDto> {
    const countVote = dto.email ? true : await this.voteAllowed(dto, req.ip);
    return this.countries.joinWaitlist(
      dto.countryCode,
      dto.email,
      dto.locale,
      countVote,
    );
  }

  /** Without an address nothing identifies a person, so one visitor
   * (IPv4 or IPv6 /64) adds one vote a day per country and at most
   * VOTES_PER_IP_PER_DAY a day overall. Over the limit the request is
   * accepted and not recorded (the page behaves the same). Redis down: the
   * vote counts (the route's own 5/min throttle still applies). */
  private async voteAllowed(
    dto: JoinCountryWaitlistDto,
    ip: string | undefined,
  ): Promise<boolean> {
    if (!ip) return true;
    const who = ipBucket(ip);
    try {
      const country = await this.rateLimit.consumeFixedWindow(
        ['waitlist-vote', who, dto.countryCode],
        1,
        86_400,
      );
      if (!country.allowed) return false;
      const all = await this.rateLimit.consumeFixedWindow(
        ['waitlist-vote', who],
        VOTES_PER_IP_PER_DAY,
        86_400,
      );
      return all.allowed;
    } catch {
      return true;
    }
  }
}
