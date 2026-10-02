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
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
  ALL_ADMIN_ROLES,
} from '../admin-auth/admin-auth.decorators';
import {
  ConfigEntryDto,
  ConfigKeyParamDto,
  CreateLegalDocumentDto,
  FeatureFlagAdminDto,
  FlagKeyParamDto,
  LanguageAdminDto,
  LanguageCodeParamDto,
  LegalDocumentAdminDto,
  LegalDocumentIdParamDto,
  UpdateConfigDto,
  UpdateFlagDto,
  UpdateLanguageDto,
} from './admin-config.dto';
import { AdminConfigService } from './admin-config.service';

const E = ErrorCode;

/** docs/06 §2.3 items 7–10 — super_admin only (§2.2). The service writes
 * before/after audit rows itself. */
@ApiTags('admin-config')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin')
export class AdminConfigController {
  constructor(private readonly config: AdminConfigService) {}

  @Get('feature-flags')
  @ApiOperation({ summary: 'Feature flags with the paid-service key check' })
  @ApiEnvelopeResponse(FeatureFlagAdminDto, { isArray: true })
  listFeatureFlags(): Promise<FeatureFlagAdminDto[]> {
    return this.config.listFlags();
  }

  @Patch('feature-flags/:key')
  @ApiOperation({
    summary:
      'Switch a flag / set the rollout percent (applies without a release)',
  })
  @ApiEnvelopeResponse(FeatureFlagAdminDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.FLAG_PROVIDER_KEYS_MISSING],
  })
  updateFeatureFlag(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: FlagKeyParamDto,
    @Body() dto: UpdateFlagDto,
  ): Promise<FeatureFlagAdminDto> {
    return this.config.updateFlag(admin, params.key, dto);
  }

  @Get('config')
  @ApiOperation({
    summary: 'app_config keys with schema, defaults and current values',
  })
  @ApiEnvelopeResponse(ConfigEntryDto, { isArray: true })
  listAppConfig(): Promise<ConfigEntryDto[]> {
    return this.config.listConfig();
  }

  @Put('config/:key')
  @ApiOperation({ summary: 'Set a value (validated against the key schema)' })
  @ApiEnvelopeResponse(ConfigEntryDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateAppConfig(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: ConfigKeyParamDto,
    @Body() dto: UpdateConfigDto,
  ): Promise<ConfigEntryDto> {
    return this.config.updateConfig(admin, params.key, dto.value);
  }

  @Get('i18n/languages')
  @ApiOperation({
    summary: 'All languages (active and inactive) with translation counts',
  })
  @ApiEnvelopeResponse(LanguageAdminDto, { isArray: true })
  listAdminLanguages(): Promise<LanguageAdminDto[]> {
    return this.config.listLanguages();
  }

  @Patch('i18n/languages/:code')
  @ApiOperation({ summary: 'Enable / disable a language, change its order' })
  @ApiEnvelopeResponse(LanguageAdminDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  updateAdminLanguage(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LanguageCodeParamDto,
    @Body() dto: UpdateLanguageDto,
  ): Promise<LanguageAdminDto> {
    return this.config.updateLanguage(admin, params.code, dto);
  }

  @Get('legal-documents')
  @ApiOperation({
    summary:
      'Every version of terms / privacy / disclaimer / client_contact_sharing',
  })
  @ApiEnvelopeResponse(LegalDocumentAdminDto, { isArray: true })
  listLegalDocuments(): Promise<LegalDocumentAdminDto[]> {
    return this.config.listLegalDocuments();
  }

  @Get('legal-documents/:id')
  @ApiOperation({ summary: 'One version with the full text' })
  @ApiEnvelopeResponse(LegalDocumentAdminDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getLegalDocument(
    @Param() params: LegalDocumentIdParamDto,
  ): Promise<LegalDocumentAdminDto> {
    return this.config.getLegalDocument(params.id);
  }

  @Post('legal-documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft version' })
  @ApiEnvelopeResponse(LegalDocumentAdminDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.LEGAL_DOCUMENT_INVALID_STATE],
  })
  createLegalDocument(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateLegalDocumentDto,
  ): Promise<LegalDocumentAdminDto> {
    return this.config.createLegalDocument(admin, dto);
  }

  @Post('legal-documents/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Make the version current: users re-accept on their next sign-in',
  })
  @ApiEnvelopeResponse(LegalDocumentAdminDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.LEGAL_DOCUMENT_INVALID_STATE] })
  publishLegalDocument(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalDocumentIdParamDto,
  ): Promise<LegalDocumentAdminDto> {
    return this.config.publishLegalDocument(admin, params.id);
  }
}
