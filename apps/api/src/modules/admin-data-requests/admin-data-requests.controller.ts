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
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Justification,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CreateDataRequestDto,
  DataPackageDto,
  DataRequestCardDto,
  DataRequestDto,
  DataRequestIdParamDto,
  PreparePackageDto,
  UpdateDataRequestStatusDto,
  type DataRequestsPage,
} from './admin-data-requests.dto';
import { AdminDataRequestsService } from './admin-data-requests.service';

const E = ErrorCode;

class DataRequestsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** docs/06 §2.3 item 11 — super_admin only (§2.2). Writes their own
 * audit rows (before/after), the package additionally data_access_log. */
@ApiTags('admin-data-requests')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/data-requests')
export class AdminDataRequestsController {
  constructor(private readonly requests: AdminDataRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Registry of government requests, newest first' })
  @ApiEnvelopeResponse(DataRequestDto, { isArray: true })
  listDataRequests(
    @Query() query: DataRequestsQueryDto,
  ): Promise<DataRequestsPage> {
    return this.requests.list(query.cursor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a subpoena / court order' })
  @ApiEnvelopeResponse(DataRequestDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  createDataRequest(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateDataRequestDto,
  ): Promise<DataRequestDto> {
    return this.requests.create(admin, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Request with its data_access_log' })
  @ApiEnvelopeResponse(DataRequestCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getDataRequest(
    @Param() params: DataRequestIdParamDto,
  ): Promise<DataRequestCardDto> {
    return this.requests.card(params.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'received → in_progress → fulfilled | rejected' })
  @ApiEnvelopeResponse(DataRequestDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  setDataRequestStatus(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: DataRequestIdParamDto,
    @Body() dto: UpdateDataRequestStatusDto,
  ): Promise<DataRequestDto> {
    return this.requests.setStatus(admin, params.id, dto);
  }

  @Post(':id/package')
  @HttpCode(HttpStatus.OK)
  @Justification()
  @ApiOperation({
    summary:
      'Prepare the data package within the scope (X-Justification; every entity → data_access_log)',
  })
  @ApiEnvelopeResponse(DataPackageDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  prepareDataPackage(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: DataRequestIdParamDto,
    @Body() dto: PreparePackageDto,
  ): Promise<DataPackageDto> {
    return this.requests.preparePackage(admin, params.id, dto);
  }
}
