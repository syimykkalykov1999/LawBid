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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  ALL_ADMIN_ROLES,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminCountryPartnersService } from './admin-country-partners.service';
import {
  AcceptCountryPartnerContractDto,
  CountryPartnerContractDto,
  CountryPartnerDetailDto,
  CountryPartnerIdParamDto,
  CountryPartnerPortalDto,
  CountryPartnerRowDto,
  CreateCountryPartnerDto,
  SetCountryPartnerPayoutsDto,
  SetCountryPartnerShareDto,
  SetCountryPartnerStatusDto,
  UpdateCountryPartnerContractDto,
  UpdateCountryPartnerDto,
} from './country-partners.dto';

const E = ErrorCode;
const MUTATION_ERRORS = {
  400: [E.VALIDATION_ERROR],
  404: [E.NOT_FOUND],
  409: [E.VALIDATION_ERROR],
};

/**
 * Owner 2026-10-06: Деньги → Партнёры стран. Super admin only (area
 * `money`). Money changes — creating a partner, the share, switching
 * payouts on, turning a disabled partner back on — need a fresh 2FA code;
 * switching off never does.
 */
@ApiTags('admin-country-partners')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/country-partners')
export class AdminCountryPartnersController {
  constructor(
    private readonly partners: AdminCountryPartnersService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every country partner' })
  @ApiEnvelopeResponse(CountryPartnerRowDto, { isArray: true })
  listCountryPartners(): Promise<CountryPartnerRowDto[]> {
    return this.partners.list();
  }

  @Get('contract')
  @ApiOperation({ summary: 'The partner contract template (current version)' })
  @ApiEnvelopeResponse(CountryPartnerContractDto)
  getCountryPartnerContract(): Promise<CountryPartnerContractDto> {
    return this.partners.contract();
  }

  @Put('contract')
  @ApiOperation({
    summary: 'Save a new contract version; every partner accepts it again',
  })
  @ApiEnvelopeResponse(CountryPartnerContractDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateCountryPartnerContract(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateCountryPartnerContractDto,
  ): Promise<CountryPartnerContractDto> {
    return this.partners.setContract(admin, dto.text);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'New country partner with their admin account (needs step-up)',
  })
  @ApiEnvelopeResponse(CountryPartnerDetailDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    ...MUTATION_ERRORS,
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.VALIDATION_ERROR, E.ADMIN_EMAIL_TAKEN],
  })
  async createCountryPartner(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateCountryPartnerDto,
  ): Promise<CountryPartnerDetailDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const created = await this.partners.create(admin, dto);
    if (dto.login || dto.password) {
      await this.auth.setCredentialsFor(admin, created.leadAdminId, {
        login: dto.login,
        password: dto.password,
      });
    }
    return created;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One partner: team, goals, monthly settlements, month so far',
  })
  @ApiEnvelopeResponse(CountryPartnerDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getCountryPartner(
    @Param() p: CountryPartnerIdParamDto,
  ): Promise<CountryPartnerDetailDto> {
    return this.partners.detail(p.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Name, contact, staff limit, dates, goals, note' })
  @ApiEnvelopeResponse(CountryPartnerDetailDto)
  @ApiErrors(MUTATION_ERRORS)
  updateCountryPartner(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: CountryPartnerIdParamDto,
    @Body() dto: UpdateCountryPartnerDto,
  ): Promise<CountryPartnerDetailDto> {
    return this.partners.update(admin, p.id, dto);
  }

  @Put(':id/share')
  @ApiOperation({ summary: 'Change the share, percent (needs step-up)' })
  @ApiEnvelopeResponse(CountryPartnerDetailDto)
  @ApiErrors({ ...MUTATION_ERRORS, 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async setCountryPartnerShare(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: CountryPartnerIdParamDto,
    @Body() dto: SetCountryPartnerShareDto,
  ): Promise<CountryPartnerDetailDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.partners.setShare(admin, p.id, dto.sharePercent);
  }

  @Put(':id/payouts')
  @ApiOperation({
    summary: 'Payouts on (needs step-up) or off (at once)',
  })
  @ApiEnvelopeResponse(CountryPartnerDetailDto)
  @ApiErrors({ ...MUTATION_ERRORS, 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async setCountryPartnerPayouts(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: CountryPartnerIdParamDto,
    @Body() dto: SetCountryPartnerPayoutsDto,
  ): Promise<CountryPartnerDetailDto> {
    if (dto.enabled) await this.auth.assertStepUp(admin.sessionId);
    return this.partners.setPayouts(admin, p.id, dto.enabled);
  }

  @Put(':id/status')
  @ApiOperation({
    summary:
      'active / paused / disabled. Disabling signs the whole team out at once; turning back on needs step-up',
  })
  @ApiEnvelopeResponse(CountryPartnerDetailDto)
  @ApiErrors({ ...MUTATION_ERRORS, 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async setCountryPartnerStatus(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: CountryPartnerIdParamDto,
    @Body() dto: SetCountryPartnerStatusDto,
  ): Promise<CountryPartnerDetailDto> {
    if (dto.status === 'active') await this.auth.assertStepUp(admin.sessionId);
    return this.partners.setStatus(admin, p.id, dto.status);
  }
}

/** Owner 2026-10-06: the partner team's own page (any member). */
@ApiTags('admin-country-partners')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/country-partner')
export class CountryPartnerPortalController {
  constructor(private readonly partners: AdminCountryPartnersService) {}

  @Get()
  @ApiOperation({
    summary: 'My partnership: goals, contract, report (lead / accountant)',
  })
  @ApiEnvelopeResponse(CountryPartnerPortalDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getCountryPartnerPortal(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<CountryPartnerPortalDto> {
    return this.partners.portal(admin);
  }

  @Post('accept-contract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The partner accepts the current contract' })
  @ApiEnvelopeResponse(CountryPartnerPortalDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
  })
  acceptCountryPartnerContract(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AcceptCountryPartnerContractDto,
  ): Promise<CountryPartnerPortalDto> {
    return this.partners.acceptContract(admin, dto.version);
  }
}
