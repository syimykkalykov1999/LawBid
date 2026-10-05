import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
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
import { AdminCountriesService } from './admin-countries.service';
import {
  AddCountryRegionDto,
  BulkCountriesDto,
  BulkCountriesResultDto,
  CountriesAdminDto,
  CountryAdminDto,
  CountryCodeParamDto,
  CountryRegionAdminDto,
  CountryRegionParamDto,
  UpdateCountryDto,
  UpdateCountryRegionDto,
  UpdateCountrySettingsDto,
} from './countries.dto';

const E = ErrorCode;

/** Owner 2026-10-05 — Система → Страны (the «Локализация» right). The
 * master switch is the owner's alone. The service writes the audit rows. */
@ApiTags('admin-countries')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/countries')
export class AdminCountriesController {
  constructor(private readonly countries: AdminCountriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Every country with its switch, regions, people and readiness',
  })
  @ApiEnvelopeResponse(CountriesAdminDto)
  listAdminCountries(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<CountriesAdminDto> {
    return this.countries.list(admin);
  }

  @Patch(':code')
  @ApiOperation({
    summary:
      'Switch a country on or off (on needs at least one region). Off: no new sign-ups, profiles or cases there; people already there keep their accounts.',
  })
  @ApiEnvelopeResponse(CountryAdminDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  updateAdminCountry(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CountryCodeParamDto,
    @Body() dto: UpdateCountryDto,
  ): Promise<CountryAdminDto> {
    return this.countries.setEnabled(admin, params.code, dto.isEnabled);
  }

  @Post('bulk')
  @ApiOperation({
    summary:
      'Owner only: switch every country (or the given ones) on or off at once; countries without regions stay off',
  })
  @ApiEnvelopeResponse(BulkCountriesResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  bulkAdminCountries(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: BulkCountriesDto,
  ): Promise<BulkCountriesResultDto> {
    return this.countries.bulk(admin, dto.enabled, dto.codes);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Countries settings (waiting-list e-mails)' })
  @ApiEnvelopeResponse(CountriesAdminDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateAdminCountrySettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateCountrySettingsDto,
  ): Promise<CountriesAdminDto> {
    return this.countries.updateSettings(admin, dto.notifyWaitlist);
  }

  @Get(':code/regions')
  @ApiOperation({ summary: 'A country’s regions (states / provinces)' })
  @ApiEnvelopeResponse(CountryRegionAdminDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  listAdminCountryRegions(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CountryCodeParamDto,
  ): Promise<CountryRegionAdminDto[]> {
    return this.countries.regions(admin, params.code);
  }

  @Post(':code/regions')
  @ApiOperation({
    summary:
      'Add a region to a country (its code must be free in every country)',
  })
  @ApiEnvelopeResponse(CountryRegionAdminDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  addAdminCountryRegion(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CountryCodeParamDto,
    @Body() dto: AddCountryRegionDto,
  ): Promise<CountryRegionAdminDto> {
    return this.countries.addRegion(admin, params.code, dto);
  }

  @Patch(':code/regions/:region')
  @ApiOperation({ summary: 'Switch a region on or off' })
  @ApiEnvelopeResponse(CountryRegionAdminDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateAdminCountryRegion(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CountryRegionParamDto,
    @Body() dto: UpdateCountryRegionDto,
  ): Promise<CountryRegionAdminDto> {
    return this.countries.setRegionActive(
      admin,
      params.code,
      params.region,
      dto.isActive,
    );
  }
}
