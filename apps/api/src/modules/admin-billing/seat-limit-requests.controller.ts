import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { AdminBillingIdParamDto } from './admin-billing.dto';
import type { Page } from './admin-billing.util';
import {
  AdminSeatLimitRequestDto,
  AdminSeatLimitRequestsQueryDto,
  ApproveSeatLimitDto,
  CreateSeatLimitRequestDto,
  RejectSeatLimitDto,
  SeatLimitRequestDto,
  SeatLimitStateDto,
} from './seat-limit-requests.dto';
import { SeatLimitRequestsService } from './seat-limit-requests.service';

const E = ErrorCode;

/** Owner 2026-10-05: the attorney asks for more assistant seats. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AttorneyOnly()
@Controller('billing/seat-limit-requests')
export class SeatLimitRequestsController {
  constructor(private readonly requests: SeatLimitRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Ask the admins for a higher assistant limit' })
  @ApiEnvelopeResponse(SeatLimitRequestDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    409: [E.SEAT_LIMIT_REQUEST_PENDING],
  })
  createSeatLimitRequest(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSeatLimitRequestDto,
  ): Promise<SeatLimitRequestDto> {
    return this.requests.create(user, dto);
  }

  @Get('latest')
  @ApiOperation({ summary: "The attorney's seat limit and latest request" })
  @ApiEnvelopeResponse(SeatLimitStateDto)
  seatLimitState(@CurrentUser() user: RequestUser): Promise<SeatLimitStateDto> {
    return this.requests.state(user.sub);
  }
}

/** Owner 2026-10-05: the admins' queue of seat limit requests. */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin', 'finance', 'support')
@SkipAutoAudit()
@Controller('admin/billing/seat-limit-requests')
export class AdminSeatLimitRequestsController {
  constructor(private readonly requests: SeatLimitRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Requests for more assistant seats, newest first' })
  @ApiEnvelopeResponse(AdminSeatLimitRequestDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listSeatLimitRequests(
    @Query() q: AdminSeatLimitRequestsQueryDto,
  ): Promise<Page<AdminSeatLimitRequestDto>> {
    return this.requests.list(q);
  }

  @Post(':id/approve')
  @Roles('super_admin', 'finance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve: set the attorney's own seat limit" })
  @ApiEnvelopeResponse(SeatLimitRequestDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.SEAT_LIMIT_REQUEST_DECIDED],
  })
  approveSeatLimitRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminBillingIdParamDto,
    @Body() dto: ApproveSeatLimitDto,
  ): Promise<SeatLimitRequestDto> {
    return this.requests.approve(admin, p.id, dto.seats, dto.note);
  }

  @Post(':id/reject')
  @Roles('super_admin', 'finance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a seat limit request' })
  @ApiEnvelopeResponse(SeatLimitRequestDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.SEAT_LIMIT_REQUEST_DECIDED],
  })
  rejectSeatLimitRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminBillingIdParamDto,
    @Body() dto: RejectSeatLimitDto,
  ): Promise<SeatLimitRequestDto> {
    return this.requests.reject(admin, p.id, dto.note);
  }
}
