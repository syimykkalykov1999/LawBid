import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { AddressSuggestQueryDto, AddressSuggestionsDto } from './addresses.dto';
import { AddressesService, primaryLanguage } from './addresses.service';
import { AssistantAllowed } from '../auth/assistant/assistant-context';

/** Owner 2026-10-28: US address suggestions while typing; 26.11: any
 * place for the post location (kind=place). */
@ApiTags('addresses')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly service: AddressesService) {}

  @AssistantAllowed()
  @Get('suggest')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Address / place suggestions for what the person typed (address and city: US only; place: anywhere, in the app language). enabled=false: the field stays plain text.',
  })
  @ApiEnvelopeResponse(AddressSuggestionsDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  suggestAddresses(
    @CurrentUser() user: RequestUser,
    @Query() q: AddressSuggestQueryDto,
    @Req() req: Request,
  ): Promise<AddressSuggestionsDto> {
    return this.service.suggest(
      user.sub,
      q.q,
      q.kind === 'city' || q.kind === 'place' ? q.kind : 'address',
      q.session,
      primaryLanguage(req.header('accept-language')),
    );
  }
}
