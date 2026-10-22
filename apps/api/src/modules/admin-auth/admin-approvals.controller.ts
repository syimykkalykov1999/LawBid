import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from './admin-auth.decorators';
import {
  AdminApprovalDto,
  AdminApprovalIdParamDto,
  AdminApprovalRejectDto,
  AdminApprovalsCountDto,
  AdminApprovalsQueryDto,
} from './admin-approvals.dto';
import { AdminApprovalsService } from './admin-approvals.service';

const E = ErrorCode;

/**
 * Owner 2026-10-22 (system audit #2, item 11): «Требуют подтверждения».
 * Open to every admin at the guard; the service shows each admin only the
 * requests they asked for or could run themself, and writes its own audit
 * rows (requested / approved / rejected / executed / failed).
 */
@ApiTags('admin-approvals')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/approvals')
export class AdminApprovalsController {
  constructor(private readonly approvals: AdminApprovalsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Requests waiting for a second admin (or decided ones), newest first',
  })
  @ApiEnvelopeResponse(AdminApprovalDto, { isArray: true })
  listAdminApprovals(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AdminApprovalsQueryDto,
  ): Promise<AdminApprovalDto[]> {
    return this.approvals.list(admin, q.status ?? 'pending');
  }

  @Get('count')
  @ApiOperation({ summary: 'How many this admin could approve now (badge)' })
  @ApiEnvelopeResponse(AdminApprovalsCountDto)
  async countAdminApprovals(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<AdminApprovalsCountDto> {
    return {
      pending: await this.approvals.pendingCount(admin),
      limitCents: await this.approvals.limitCents(),
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve as the second admin (fresh step-up; never your own request) — the action runs now, once',
  })
  @ApiEnvelopeResponse(AdminApprovalDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED, E.ADMIN_APPROVAL_SELF],
    404: [E.NOT_FOUND],
    409: [E.ADMIN_APPROVAL_NOT_PENDING],
  })
  approveAdminApproval(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminApprovalIdParamDto,
  ): Promise<AdminApprovalDto> {
    return this.approvals.approve(admin, p.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Turn it down (or withdraw your own request); nothing runs',
  })
  @ApiEnvelopeResponse(AdminApprovalDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.ADMIN_APPROVAL_NOT_PENDING],
  })
  rejectAdminApproval(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminApprovalIdParamDto,
    @Body() dto: AdminApprovalRejectDto,
  ): Promise<AdminApprovalDto> {
    return this.approvals.reject(admin, p.id, dto.note);
  }
}
