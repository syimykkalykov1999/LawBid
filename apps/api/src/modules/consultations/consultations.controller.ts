import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  ConsultationDto,
  ConsultationIdParamDto,
  ConsultationReasonDto,
  ConsultationSettingsDto,
  ConsultationSlotsDto,
  ConsultationSlotsQueryDto,
  ConsultationsQueryDto,
  CreateConsultationDto,
  RescheduleConsultationDto,
  UpdateConsultationSettingsDto,
  type ConsultationPage,
} from './consultations.dto';
import { ConsultationsService } from './consultations.service';

const E = ErrorCode;
const IDEMPOTENCY_HEADER = { name: 'Idempotency-Key', required: false };
const ACTION_ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
  409: [E.CONSULTATION_STATE_CONFLICT, E.CONSULTATION_SLOT_TAKEN],
};

/** Owner 2026-10-20: booking a consultation (no payment). */
@ApiTags('consultations')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @AttorneyOnly('tasks')
  @Get('settings')
  @ApiOperation({ summary: "The attorney's booking hours (attorney)" })
  @ApiEnvelopeResponse(ConsultationSettingsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getSettings(@CurrentUser() user: RequestUser) {
    return this.consultations.getSettings(user);
  }

  @AttorneyOnly('tasks')
  @Put('settings')
  @ApiOperation({ summary: 'Replace the booking hours (attorney)' })
  @ApiEnvelopeResponse(ConsultationSettingsDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.ATTORNEY_NOT_VERIFIED],
  })
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateConsultationSettingsDto,
  ) {
    return this.consultations.updateSettings(user, dto);
  }

  @Get('slots')
  @ApiOperation({ summary: 'Free slots of an attorney for the next days' })
  @ApiEnvelopeResponse(ConsultationSlotsDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONSULTATION_NOT_AVAILABLE],
  })
  slots(
    @CurrentUser() user: RequestUser,
    @Query() query: ConsultationSlotsQueryDto,
  ) {
    return this.consultations.slots(user, query);
  }

  @Get()
  @ApiOperation({ summary: 'My consultations (both roles)' })
  @ApiEnvelopeResponse(ConsultationDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ConsultationsQueryDto,
  ): Promise<ConsultationPage> {
    return this.consultations.list(user, query);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Book a slot (client)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(ConsultationDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    ...ACTION_ERRORS,
    429: [E.RATE_LIMITED],
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateConsultationDto) {
    return this.consultations.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One consultation' })
  @ApiEnvelopeResponse(ConsultationDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  get(@CurrentUser() user: RequestUser, @Param() p: ConsultationIdParamDto) {
    return this.consultations.get(user, p.id);
  }

  @AttorneyOnly('tasks')
  @Post(':id/confirm')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Confirm a request (attorney)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(ConsultationDto)
  @ApiErrors(ACTION_ERRORS)
  confirm(@CurrentUser() user: RequestUser, @Param() p: ConsultationIdParamDto) {
    return this.consultations.confirm(user, p.id);
  }

  @AttorneyOnly('tasks')
  @Post(':id/decline')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Decline a request (attorney)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(ConsultationDto)
  @ApiErrors(ACTION_ERRORS)
  decline(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationIdParamDto,
    @Body() dto: ConsultationReasonDto,
  ) {
    return this.consultations.decline(user, p.id, dto.reason);
  }

  @Post(':id/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Cancel (either side)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(ConsultationDto)
  @ApiErrors(ACTION_ERRORS)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationIdParamDto,
    @Body() dto: ConsultationReasonDto,
  ) {
    return this.consultations.cancel(user, p.id, dto.reason);
  }

  @Post(':id/reschedule')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Move to another free slot (either side)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(ConsultationDto)
  @ApiErrors(ACTION_ERRORS)
  reschedule(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationIdParamDto,
    @Body() dto: RescheduleConsultationDto,
  ) {
    return this.consultations.reschedule(user, p.id, dto.startsAt);
  }
}
