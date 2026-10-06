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
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
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
import {
  CreateTreasuryExpenseDto,
  TreasuryExpenseIdParamDto,
  TreasuryOverviewDto,
  TreasuryRunResultDto,
  UpdateTreasuryExpenseDto,
  UpdateTreasurySettingsDto,
} from './treasury.dto';
import { TreasuryService } from './treasury.service';

const E = ErrorCode;

/**
 * Owner 2026-10-05 — Деньги → «Прибыль и резерв». Area `money`: only the
 * super admin changes anything; the deputy who manages admins may look
 * (admin-permissions canAccess). The switches and the «split now» button
 * need a fresh 2FA code. Nothing here can add, choose or type a bank:
 * payouts go only to the banks in Stripe itself. Writes are audited.
 */
@ApiTags('admin-treasury')
@AdminEndpoint('super_admin', 'finance', 'moderator', 'support', 'verifier')
@SkipAutoAudit()
@Controller('admin/treasury')
export class AdminTreasuryController {
  constructor(
    private readonly treasury: TreasuryService,
    private readonly writer: AppSettingsWriter,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Stripe balance, reserve, next split, expenses, payouts',
  })
  @ApiEnvelopeResponse(TreasuryOverviewDto)
  getTreasury(): Promise<TreasuryOverviewDto> {
    return this.treasury.overview();
  }

  @Put('settings')
  @ApiOperation({
    summary: 'Auto split, payout day, buffers, pay day (needs step-up)',
  })
  @ApiEnvelopeResponse(TreasuryOverviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async updateTreasurySettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateTreasurySettingsDto,
  ): Promise<TreasuryOverviewDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.writer.write(admin.id, 'treasury.settings', {
      'treasury.auto': dto.auto,
      'treasury.payout_day': dto.payoutDay,
      'treasury.buffer_percent': dto.bufferPercent,
      'treasury.refund_buffer_usd': dto.refundBufferUsd,
      'treasury.min_profit_usd': dto.minProfitUsd,
      'treasury.payroll_auto': dto.payrollAuto,
      'treasury.payroll_day': dto.payrollDay,
      'treasury.payroll_warn_days': dto.payrollWarnDays,
    });
    return this.treasury.overview();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Split the balance now: the computed amounts only (step-up)',
  })
  @ApiEnvelopeResponse(TreasuryRunResultDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async runTreasuryNow(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<TreasuryRunResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.treasury.run('manual', admin.id);
  }

  @Post('expenses')
  @ApiOperation({ summary: 'Add a service the expense card pays monthly' })
  @ApiEnvelopeResponse(TreasuryOverviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async createTreasuryExpense(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateTreasuryExpenseDto,
  ): Promise<TreasuryOverviewDto> {
    await this.treasury.createExpense(admin.id, dto);
    return this.treasury.overview();
  }

  @Patch('expenses/:id')
  @ApiOperation({ summary: 'Change a monthly expense or switch it off' })
  @ApiEnvelopeResponse(TreasuryOverviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async updateTreasuryExpense(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TreasuryExpenseIdParamDto,
    @Body() dto: UpdateTreasuryExpenseDto,
  ): Promise<TreasuryOverviewDto> {
    await this.treasury.updateExpense(admin.id, p.id, dto);
    return this.treasury.overview();
  }

  @Delete('expenses/:id')
  @ApiOperation({ summary: 'Remove a monthly expense' })
  @ApiEnvelopeResponse(TreasuryOverviewDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async deleteTreasuryExpense(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TreasuryExpenseIdParamDto,
  ): Promise<TreasuryOverviewDto> {
    await this.treasury.deleteExpense(admin.id, p.id);
    return this.treasury.overview();
  }
}
