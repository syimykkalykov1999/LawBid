import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { ClientBadgeAdminService } from './client-badge-admin.service';
import {
  AdminClientBadgeApproveDto,
  AdminClientBadgeBulkApproveDto,
  AdminClientBadgeBulkRejectDto,
  AdminClientBadgeBulkResultDto,
  AdminClientBadgeDto,
  AdminClientBadgeIdParamDto,
  AdminClientBadgeQueryDto,
  AdminClientBadgeReasonDto,
  AdminClientBadgeRowDto,
  ClientBadgeCheckoutDto,
  ClientBadgeStateDto,
  SubmitClientBadgeDto,
} from './client-badge.dto';
import { ClientBadgeService } from './client-badge.service';

const E = ErrorCode;

/** Owner 2026-10-02: "Verify my account" for clients (gold badge, $10/mo). */
@ApiTags('client-badge')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('verification/client')
export class ClientBadgeController {
  constructor(private readonly badge: ClientBadgeService) {}

  @Get('me')
  @ApiOperation({ summary: 'My badge request, subscription and price' })
  @ApiEnvelopeResponse(ClientBadgeStateDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getMyClientBadge(
    @CurrentUser() user: RequestUser,
  ): Promise<ClientBadgeStateDto> {
    return this.badge.state(user.sub);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Send documents for review (up to 5 files)' })
  @ApiEnvelopeResponse(ClientBadgeStateDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
  })
  submitClientBadge(
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitClientBadgeDto,
  ): Promise<ClientBadgeStateDto> {
    return this.badge.submit(user.sub, dto);
  }

  @Post('checkout')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Approved: the $10/month checkout page' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiEnvelopeResponse(ClientBadgeCheckoutDto)
  @ApiErrors({
    409: [E.CONTENT_INVALID_STATE],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  startClientBadgeCheckout(
    @CurrentUser() user: RequestUser,
  ): Promise<ClientBadgeCheckoutDto> {
    return this.badge.checkout(user.sub);
  }

  @Post('cancel')
  @ApiOperation({
    summary: 'Stop renewing; the badge stays until the period ends',
  })
  @ApiEnvelopeResponse(ClientBadgeStateDto)
  @ApiErrors({ 409: [E.CONTENT_INVALID_STATE] })
  cancelClientBadge(
    @CurrentUser() user: RequestUser,
  ): Promise<ClientBadgeStateDto> {
    return this.badge.setCancel(user.sub, true);
  }

  @Post('resume')
  @ApiOperation({ summary: 'Keep renewing after a cancel' })
  @ApiEnvelopeResponse(ClientBadgeStateDto)
  @ApiErrors({ 409: [E.CONTENT_INVALID_STATE] })
  resumeClientBadge(
    @CurrentUser() user: RequestUser,
  ): Promise<ClientBadgeStateDto> {
    return this.badge.setCancel(user.sub, false);
  }
}

/** Admin panel → Verification → Client badges. */
@ApiTags('admin-client-badge')
@AdminEndpoint('super_admin', 'verifier')
@SkipAutoAudit()
@Controller('admin/client-badges')
export class AdminClientBadgeController {
  constructor(private readonly admin: ClientBadgeAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Requests, newest first (filter by status)' })
  @ApiEnvelopeResponse(AdminClientBadgeRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminClientBadges(@Query() q: AdminClientBadgeQueryDto) {
    return this.admin.list(q.status, q.cursor, q.subStatus, q.q);
  }

  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve many requests at once (skips invalid ones)',
  })
  @ApiEnvelopeResponse(AdminClientBadgeBulkResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  bulkApproveAdminClientBadges(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminClientBadgeBulkApproveDto,
  ): Promise<AdminClientBadgeBulkResultDto> {
    return this.admin.bulkApprove(admin, dto.ids, dto.free ?? false);
  }

  @Post('bulk-reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject many pending requests with one reason' })
  @ApiEnvelopeResponse(AdminClientBadgeBulkResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  bulkRejectAdminClientBadges(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminClientBadgeBulkRejectDto,
  ): Promise<AdminClientBadgeBulkResultDto> {
    return this.admin.bulkReject(admin, dto.ids, dto.reason);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One request with short-lived links to documents' })
  @ApiEnvelopeResponse(AdminClientBadgeDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getAdminClientBadge(
    @Param() p: AdminClientBadgeIdParamDto,
  ): Promise<AdminClientBadgeDto> {
    return this.admin.get(p.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve (free: true = give the badge for nothing)',
  })
  @ApiEnvelopeResponse(AdminClientBadgeDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.CONTENT_INVALID_STATE] })
  approveAdminClientBadge(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminClientBadgeIdParamDto,
    @Body() dto: AdminClientBadgeApproveDto,
  ): Promise<AdminClientBadgeDto> {
    return this.admin.approve(admin, p.id, dto.free ?? false);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending request with a reason' })
  @ApiEnvelopeResponse(AdminClientBadgeDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.CONTENT_INVALID_STATE] })
  rejectAdminClientBadge(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminClientBadgeIdParamDto,
    @Body() dto: AdminClientBadgeReasonDto,
  ): Promise<AdminClientBadgeDto> {
    return this.admin.reject(admin, p.id, dto.reason);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take the badge away and stop the subscription' })
  @ApiEnvelopeResponse(AdminClientBadgeDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.CONTENT_INVALID_STATE] })
  revokeAdminClientBadge(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminClientBadgeIdParamDto,
    @Body() dto: AdminClientBadgeReasonDto,
  ): Promise<AdminClientBadgeDto> {
    return this.admin.revoke(admin, p.id, dto.reason);
  }
}
