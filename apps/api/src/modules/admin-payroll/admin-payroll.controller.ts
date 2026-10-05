import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminIdParamDto } from '../admin-cases/admin-cases.dto';
import {
  CreatePayrollEmployeeDto,
  PayrollBulkPayDto,
  PayrollBulkResultDto,
  PayrollCancelDto,
  PayrollEmployeeDto,
  PayrollEmployeesQueryDto,
  PayrollPayoutDto,
  PayrollPayoutsQueryDto,
  PayrollStripeLinkDto,
  PayrollSummaryDto,
  PayrollSummaryQueryDto,
  UpdatePayrollEmployeeDto,
} from './admin-payroll.dto';
import { AdminPayrollService } from './admin-payroll.service';

const E = ErrorCode;

/**
 * Owner 2026-10-05 — Деньги → Зарплаты. Area `payroll`: the super admin,
 * the deputy (the admin who manages admins) and admins given the area
 * (a finance admin gets it by default). Writes are audited here.
 */
@ApiTags('admin-payroll')
@AdminEndpoint('super_admin', 'finance', 'moderator', 'support', 'verifier')
@SkipAutoAudit()
@Controller('admin/payroll')
export class AdminPayrollController {
  constructor(private readonly payroll: AdminPayrollService) {}

  @Get('employees')
  @ApiOperation({ summary: 'People on payroll with their fixed amount' })
  @ApiEnvelopeResponse(PayrollEmployeeDto, { isArray: true })
  listPayrollEmployees(
    @Query() q: PayrollEmployeesQueryDto,
  ): Promise<PayrollEmployeeDto[]> {
    return this.payroll.employees(q.includeInactive ?? false);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Add a person to payroll' })
  @ApiEnvelopeResponse(PayrollEmployeeDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  createPayrollEmployee(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreatePayrollEmployeeDto,
  ): Promise<PayrollEmployeeDto> {
    return this.payroll.create(admin, dto);
  }

  @Patch('employees/:id')
  @ApiOperation({ summary: 'Change amount, details or take off payroll' })
  @ApiEnvelopeResponse(PayrollEmployeeDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updatePayrollEmployee(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: UpdatePayrollEmployeeDto,
  ): Promise<PayrollEmployeeDto> {
    return this.payroll.update(admin, p.id, dto);
  }

  @Post('employees/:id/stripe-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Stripe link where the person adds their bank account or card (payroll_stripe_payouts)',
  })
  @ApiEnvelopeResponse(PayrollStripeLinkDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.VALIDATION_ERROR] })
  payrollStripeLink(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
  ): Promise<PayrollStripeLinkDto> {
    return this.payroll.stripeLink(admin, p.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Monthly total and what is paid for a period' })
  @ApiEnvelopeResponse(PayrollSummaryDto)
  payrollSummary(
    @Query() q: PayrollSummaryQueryDto,
  ): Promise<PayrollSummaryDto> {
    return this.payroll.summary(q.period);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Payments, newest first (by period / person)' })
  @ApiEnvelopeResponse(PayrollPayoutDto, { isArray: true })
  listPayrollPayouts(
    @Query() q: PayrollPayoutsQueryDto,
  ): Promise<PayrollPayoutDto[]> {
    return this.payroll.payouts(q);
  }

  @Post('payouts/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the salary of many people for a period (paid once per period)',
  })
  @ApiEnvelopeResponse(PayrollBulkResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  payPayrollBulk(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PayrollBulkPayDto,
  ): Promise<PayrollBulkResultDto> {
    return this.payroll.payBulk(admin, dto);
  }

  @Post('payouts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a payment recorded by mistake' })
  @ApiEnvelopeResponse(PayrollPayoutDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.VALIDATION_ERROR] })
  cancelPayrollPayout(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: PayrollCancelDto,
  ): Promise<PayrollPayoutDto> {
    return this.payroll.cancel(admin, p.id, dto.reason);
  }
}
