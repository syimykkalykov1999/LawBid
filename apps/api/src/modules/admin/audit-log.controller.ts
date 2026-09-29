import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AuditLogEntryDto,
  AuditLogQueryDto,
  type AuditLogPage,
} from './admin.dto';
import { AuditLogQueryService } from './audit-log.service';

/** docs/06 §2.3 item 12 — every role; non-super_admins see their own rows. */
@ApiTags('admin-audit-log')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Audit log, newest first (cursor)' })
  @ApiEnvelopeResponse(AuditLogEntryDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  listAuditLog(
    @CurrentAdmin() actor: AdminActor,
    @Query() query: AuditLogQueryDto,
  ): Promise<AuditLogPage> {
    return this.auditLog.list(actor, query);
  }
}
