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
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminApprovalsService } from '../admin-auth/admin-approvals.service';
import { AdminIdParamDto } from '../admin-cases/admin-cases.dto';
import {
  CreatePayrollAccrualDto,
  CreatePayrollEmployeeDto,
  PayrollAccrualDto,
  PayrollAccrualsQueryDto,
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
  constructor(
    private readonly payroll: AdminPayrollService,
    private readonly auth: AdminAuthService,
    private readonly approvals: AdminApprovalsService,
  ) {}

  /** Owner 2026-10-22 (maker-checker): how an approved bulk payout runs. */
  onModuleInit(): void {
    this.approvals.register({
      kind: 'payroll_bulk_payout',
      label: 'Зарплаты: выплата нескольким людям',
      route: {
        path: '/api/v1/admin/payroll/payouts/bulk',
        method: 'POST',
        roles: ['super_admin', 'finance', 'moderator', 'support', 'verifier'],
      },
      execute: (requester, payload) =>
        this.payroll.payBulk(requester, payload as PayrollBulkPayDto),
    });
  }

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
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  async payrollStripeLink(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
  ): Promise<PayrollStripeLinkDto> {
    // Owner 2026-10-22: the link decides where salary goes — step-up.
    await this.auth.assertStepUp(admin.sessionId);
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
      'Pay many people for a period: fixed salary (once per period) plus pending commissions; via Stripe its fee is taken from each payout',
  })
  @ApiEnvelopeResponse(PayrollBulkResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR, E.ADMIN_APPROVAL_PENDING],
  })
  async payPayrollBulk(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PayrollBulkPayDto,
  ): Promise<PayrollBulkResultDto> {
    // System audit #2, item 2: real Stripe transfers — fresh 2FA code.
    await this.auth.assertStepUp(admin.sessionId);
    // Item 11: from billing.dual_approval_min_cents on, a second admin
    // approves it first (409 ADMIN_APPROVAL_PENDING; nothing is paid now).
    await this.approvals.gate(admin, {
      kind: 'payroll_bulk_payout',
      payload: dto,
      amountCents: await this.payroll.estimateBulkCents(dto),
      summary: `${new Set(dto.employeeIds).size} чел., период ${dto.period}, ${dto.method ?? 'manual'}`,
    });
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

  @Get('accruals')
  @ApiOperation({
    summary: 'Commissions, bonuses and adjustments (newest first)',
  })
  @ApiEnvelopeResponse(PayrollAccrualDto, { isArray: true })
  listPayrollAccruals(
    @Query() q: PayrollAccrualsQueryDto,
  ): Promise<PayrollAccrualDto[]> {
    return this.payroll.accrualList(q);
  }

  @Post('employees/:id/accruals')
  @ApiOperation({
    summary: 'Add a bonus or adjustment, paid with the next payout',
  })
  @ApiEnvelopeResponse(PayrollAccrualDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  addPayrollAccrual(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: CreatePayrollAccrualDto,
  ): Promise<PayrollAccrualDto> {
    return this.payroll.addAccrual(admin, p.id, dto);
  }

  @Post('accruals/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take back a pending accrual' })
  @ApiEnvelopeResponse(PayrollAccrualDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.VALIDATION_ERROR] })
  cancelPayrollAccrual(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: PayrollCancelDto,
  ): Promise<PayrollAccrualDto> {
    return this.payroll.cancelAccrual(admin, p.id, dto.reason);
  }
}
