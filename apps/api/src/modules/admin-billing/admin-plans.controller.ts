import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import {
  AdminPlanResultDto,
  AdminPlansDto,
  ApplyPlanDto,
  ApplyPlanResultDto,
  CreatePlanDto,
  PlanFieldsDto,
  PlanIdParamDto,
} from './admin-plans.dto';
import { AdminPlansService } from './admin-plans.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';

/** Round 4 (25.11, С2): a save that sets a price is money. */
function setsPrice(dto: PlanFieldsDto): boolean {
  return (
    dto.amountCents !== undefined ||
    dto.compareAtCents !== undefined ||
    dto.showDiscount !== undefined
  );
}

const E = ErrorCode;

/**
 * Owner 2026-10-05: Деньги → Планы — the plan builder. Super admin only,
 * like Prices; every change writes its own audit row.
 */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/billing/plans')
export class AdminPlansController {
  constructor(
    private readonly plans: AdminPlansService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Every plan with its entitlements, price and subscribers',
  })
  @ApiEnvelopeResponse(AdminPlansDto)
  adminListPlans(): Promise<AdminPlansDto> {
    return this.plans.list();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a plan (draft unless status is given)' })
  @ApiEnvelopeResponse(AdminPlanResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.PLAN_CODE_EXISTS],
  })
  async adminCreatePlan(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreatePlanDto,
  ): Promise<AdminPlanResultDto> {
    if (setsPrice(dto)) await this.auth.assertStepUp(admin.sessionId);
    return this.plans.create(admin, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Edit a plan: texts, entitlements, price, status (subscribers keep their terms)',
  })
  @ApiEnvelopeResponse(AdminPlanResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async adminUpdatePlan(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PlanIdParamDto,
    @Body() dto: PlanFieldsDto,
  ): Promise<AdminPlanResultDto> {
    if (setsPrice(dto)) await this.auth.assertStepUp(admin.sessionId);
    return this.plans.update(admin, p.id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive: no new purchases, subscribers keep their terms',
  })
  @ApiEnvelopeResponse(AdminPlansDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.PLAN_IN_USE] })
  adminArchivePlan(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PlanIdParamDto,
  ): Promise<AdminPlansDto> {
    return this.plans.archive(admin, p.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a plan nobody ever bought' })
  @ApiEnvelopeResponse(AdminPlansDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.PLAN_IN_USE] })
  adminDeletePlan(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PlanIdParamDto,
  ): Promise<AdminPlansDto> {
    return this.plans.remove(admin, p.id);
  }

  @Post(':id/apply-to-subscribers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Give current subscribers the plan's terms as they are now",
  })
  @ApiEnvelopeResponse(ApplyPlanResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async adminApplyPlanToSubscribers(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PlanIdParamDto,
    @Body() dto: ApplyPlanDto,
  ): Promise<ApplyPlanResultDto> {
    // Round 4 (25.11, С2): changes the terms of EVERY current subscriber.
    await this.auth.assertStepUp(admin.sessionId);
    return this.plans.applyToSubscribers(admin, p.id, dto.reason);
  }
}
