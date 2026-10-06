import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminPartnersService } from './admin-partners.service';
import {
  AdminPartnerAdjustmentDto,
  AdminPartnerCommissionRowDto,
  AdminPartnerCommissionsQueryDto,
  AdminPartnerDetailDto,
  AdminPartnerIdParamDto,
  AdminPartnerPayDto,
  AdminPartnerPayResultDto,
  AdminPartnerReasonDto,
  AdminPartnerRowDto,
  AdminPartnersQueryDto,
  AdminPartnerStatsDto,
  CreatePartnerDto,
  LinkPartnerUserDto,
  PartnerSettingsDto,
  UpdatePartnerDto,
} from './partners.dto';
import type { PartnerProgramSettings } from './partners.settings';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };
const MUTATION_ERRORS = {
  400: [E.VALIDATION_ERROR],
  404: [E.NOT_FOUND],
  409: [E.PARTNER_INVALID_STATE],
};

/** Owner 2026-10-05: partner program in the admin (money: super_admin +
 * finance write; support reads). */
@ApiTags('admin-partners')
@AdminEndpoint('super_admin', 'finance', 'support')
@Controller('admin/partners')
export class AdminPartnersController {
  constructor(private readonly partners: AdminPartnersService) {}

  @Get()
  @ApiOperation({ summary: 'Partners, newest first' })
  @ApiEnvelopeResponse(AdminPartnerRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminPartners(
    @Query() q: AdminPartnersQueryDto,
  ): Promise<Page<AdminPartnerRowDto>> {
    return this.partners.list(q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Partner program totals' })
  @ApiEnvelopeResponse(AdminPartnerStatsDto)
  getAdminPartnerStats(): Promise<AdminPartnerStatsDto> {
    return this.partners.stats();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Partner program defaults' })
  @ApiEnvelopeResponse(PartnerSettingsDto)
  getPartnerSettings(): Promise<PartnerProgramSettings> {
    return this.partners.getSettings();
  }

  @Roles('super_admin')
  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({
    summary: 'Change the partner program defaults (super admin)',
  })
  @ApiEnvelopeResponse(PartnerSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updatePartnerSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PartnerSettingsDto,
  ): Promise<PartnerProgramSettings> {
    return this.partners.updateSettings(admin, dto);
  }

  @Get('commissions')
  @ApiOperation({
    summary: 'Commissions (accruals) across partners, newest first',
  })
  @ApiEnvelopeResponse(AdminPartnerCommissionRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminPartnerCommissions(
    @Query() q: AdminPartnerCommissionsQueryDto,
  ): Promise<Page<AdminPartnerCommissionRowDto>> {
    return this.partners.listCommissions(q);
  }

  @Roles('super_admin', 'finance')
  @Get('commissions/export.csv')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Commissions as CSV (up to 50 000 rows; audited)' })
  @ApiProduces('text/csv')
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async exportAdminPartnerCommissions(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AdminPartnerCommissionsQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.partners.exportCsv(admin, q);
    const day = new Date().toISOString().slice(0, 10);
    res
      .type('text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="lawbid-partner-commissions-${day}.csv"`,
      )
      .send(csv);
  }

  @Roles('super_admin', 'finance')
  @Post('commissions/:id/approve')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Release a held commission for payout' })
  @ApiEnvelopeResponse(AdminPartnerCommissionRowDto)
  @ApiErrors(MUTATION_ERRORS)
  approveAdminPartnerCommission(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: AdminPartnerReasonDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    return this.partners.approve(admin, p.id, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post('commissions/:id/hold')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Put a commission on manual hold' })
  @ApiEnvelopeResponse(AdminPartnerCommissionRowDto)
  @ApiErrors(MUTATION_ERRORS)
  holdAdminPartnerCommission(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: AdminPartnerReasonDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    return this.partners.hold(admin, p.id, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post('commissions/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Reverse a commission (fraud, refund); a paid one becomes a deduction',
  })
  @ApiEnvelopeResponse(AdminPartnerCommissionRowDto)
  @ApiErrors(MUTATION_ERRORS)
  reverseAdminPartnerCommission(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: AdminPartnerReasonDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    return this.partners.reverse(admin, p.id, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post('commissions/:id/pay')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Mark one approved commission paid' })
  @ApiEnvelopeResponse(AdminPartnerCommissionRowDto)
  @ApiErrors(MUTATION_ERRORS)
  payAdminPartnerCommission(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: AdminPartnerPayDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    return this.partners.markPaid(admin, p.id, dto);
  }

  @Roles('super_admin', 'finance')
  @Post()
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Make a user a partner (own rates optional)' })
  @ApiEnvelopeResponse(AdminPartnerRowDto)
  @ApiErrors(MUTATION_ERRORS)
  createAdminPartner(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreatePartnerDto,
  ): Promise<AdminPartnerRowDto> {
    return this.partners.create(admin, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One partner: rates, who joined, commissions' })
  @ApiEnvelopeResponse(AdminPartnerDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminPartner(
    @Param() p: AdminPartnerIdParamDto,
  ): Promise<AdminPartnerDetailDto> {
    return this.partners.detail(p.id);
  }

  @Roles('super_admin', 'finance')
  @Patch(':id')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Change rates, rule, hold, label, status' })
  @ApiEnvelopeResponse(AdminPartnerRowDto)
  @ApiErrors(MUTATION_ERRORS)
  updateAdminPartner(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: UpdatePartnerDto,
  ): Promise<AdminPartnerRowDto> {
    return this.partners.update(admin, p.id, dto);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/link-user')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Attach a real account to a partner created without one (code and earnings move with it)',
  })
  @ApiEnvelopeResponse(AdminPartnerRowDto)
  @ApiErrors(MUTATION_ERRORS)
  linkAdminPartnerUser(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: LinkPartnerUserDto,
  ): Promise<AdminPartnerRowDto> {
    return this.partners.linkUser(admin, p.id, dto);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/adjustments')
  @SkipAutoAudit()
  @ApiOperation({
    summary: 'One-off bonus (+) or deduction (−), approved at once',
  })
  @ApiEnvelopeResponse(AdminPartnerCommissionRowDto)
  @ApiErrors(MUTATION_ERRORS)
  adjustAdminPartner(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: AdminPartnerAdjustmentDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    return this.partners.adjust(admin, p.id, dto);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary: 'Pay everything approved for the partner (one payout)',
  })
  @ApiEnvelopeResponse(AdminPartnerPayResultDto)
  @ApiErrors(MUTATION_ERRORS)
  payAdminPartner(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPartnerIdParamDto,
    @Body() dto: AdminPartnerPayDto,
  ): Promise<AdminPartnerPayResultDto> {
    return this.partners.pay(admin, p.id, dto);
  }
}
