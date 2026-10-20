import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import {
  AdminDeadlineRuleDto,
  AdminHolidayDto,
  AdminHolidaysQueryDto,
  CreateDeadlineRuleDto,
  CreateHolidayDto,
  DeadlineCalcQueryDto,
  DeadlineHolidayDto,
  DeadlineHolidaysQueryDto,
  DeadlineIdParamDto,
  DeadlineResultDto,
  DeadlineRuleDto,
  DeadlineRulesQueryDto,
  GenerateFederalHolidaysDto,
  GenerateFederalHolidaysResultDto,
  UpdateDeadlineRuleDto,
} from './deadlines.dto';
import { DeadlinesService } from './deadlines.service';

const E = ErrorCode;

/** Owner 2026-10-20: the deadline calculator (court deadlines, statutes). */
@ApiTags('deadlines')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('deadlines')
export class DeadlinesController {
  constructor(private readonly deadlines: DeadlinesService) {}

  @Get('rules')
  @ApiOperation({ summary: 'Deadline rules: federal plus a state’s' })
  @ApiEnvelopeResponse(DeadlineRuleDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FEATURE_DISABLED] })
  rules(@Query() q: DeadlineRulesQueryDto) {
    return this.deadlines.rules(q);
  }

  @Get('holidays')
  @ApiOperation({ summary: 'Court holidays of a year' })
  @ApiEnvelopeResponse(DeadlineHolidayDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FEATURE_DISABLED] })
  holidays(@Query() q: DeadlineHolidaysQueryDto) {
    return this.deadlines.holidays(q);
  }

  @Get('calculate')
  @ApiOperation({
    summary: 'The last day for a rule counted from an event date',
  })
  @ApiEnvelopeResponse(DeadlineResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FEATURE_DISABLED],
    404: [E.NOT_FOUND],
  })
  calculate(@Query() q: DeadlineCalcQueryDto) {
    return this.deadlines.calculate(q);
  }
}

/** Admin → Сроки: rules and court holidays. */
@ApiTags('admin-deadlines')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/deadlines')
export class AdminDeadlinesController {
  constructor(private readonly deadlines: DeadlinesService) {}

  @Get('rules')
  @ApiOperation({ summary: 'All rules, active or not' })
  @ApiEnvelopeResponse(AdminDeadlineRuleDto, { isArray: true })
  rules() {
    return this.deadlines.adminRules();
  }

  @Post('rules')
  @ApiOperation({ summary: 'Add a rule' })
  @ApiEnvelopeResponse(AdminDeadlineRuleDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 409: [E.VALIDATION_ERROR] })
  createRule(@Body() dto: CreateDeadlineRuleDto) {
    return this.deadlines.createRule(dto);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Edit a rule' })
  @ApiEnvelopeResponse(AdminDeadlineRuleDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateRule(
    @Param() p: DeadlineIdParamDto,
    @Body() dto: UpdateDeadlineRuleDto,
  ) {
    return this.deadlines.updateRule(p.id, dto);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a rule' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteRule(@Param() p: DeadlineIdParamDto) {
    return this.deadlines.deleteRule(p.id);
  }

  @Get('holidays')
  @ApiOperation({ summary: 'Court holidays (filter by jurisdiction, year)' })
  @ApiEnvelopeResponse(AdminHolidayDto, { isArray: true })
  holidays(@Query() q: AdminHolidaysQueryDto) {
    return this.deadlines.adminHolidays(q);
  }

  @Post('holidays')
  @ApiOperation({ summary: 'Add or rename a court holiday' })
  @ApiEnvelopeResponse(AdminHolidayDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.deadlines.createHoliday(dto);
  }

  @Post('holidays/federal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add the federal holidays of a year (open data)' })
  @ApiEnvelopeResponse(GenerateFederalHolidaysResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  generateFederal(@Body() dto: GenerateFederalHolidaysDto) {
    return this.deadlines.generateFederal(dto.year);
  }

  @Delete('holidays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a court holiday' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteHoliday(@Param() p: DeadlineIdParamDto) {
    return this.deadlines.deleteHoliday(p.id);
  }
}
