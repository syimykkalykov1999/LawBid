import { Controller, Get, Query } from '@nestjs/common';
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
import { AddressesService } from './addresses.service';

/** Owner 2026-10-28: US address suggestions while typing. */
@ApiTags('addresses')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly service: AddressesService) {}

  @Get('suggest')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Address suggestions for what the person typed (US only). enabled=false: the field stays plain text.',
  })
  @ApiEnvelopeResponse(AddressSuggestionsDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  suggestAddresses(
    @CurrentUser() user: RequestUser,
    @Query() q: AddressSuggestQueryDto,
  ): Promise<AddressSuggestionsDto> {
    return this.service.suggest(
      user.sub,
      q.q,
      q.kind === 'city' ? 'city' : 'address',
      q.session,
    );
  }
}
