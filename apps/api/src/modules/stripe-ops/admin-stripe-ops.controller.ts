import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { DisputeService } from './dispute.service';
import {
  StripeDisputeEvidenceDto,
  StripeDisputePaymentParamDto,
  StripeDisputeSubmitResultDto,
  StripeReviewIdParamDto,
  StripeReviewItemDto,
  StripeReviewQueryDto,
  StripeReviewResolveDto,
  StripeReviewSummaryDto,
} from './stripe-ops.dto';
import { buildEvidenceFields } from './stripe-ops.helpers';
import { StripeReviewService } from './stripe-review.service';

const E = ErrorCode;

/**
 * Stripe robustness 2026-10-27: Admin → Деньги → «Проверки Stripe». One
 * queue for failed payouts and refunds, disputes, early fraud warnings,
 * disconnects and reconcile drift, with SLA clocks. Money area: super admin
 * only. Every action takes ONE fresh 2FA code (owner rule: no second admin).
 */
@ApiTags('admin-stripe-review')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/stripe-review')
export class AdminStripeOpsController {
  constructor(
    private readonly review: StripeReviewService,
    private readonly disputes: DisputeService,
    private readonly auth: AdminAuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The review queue, most urgent deadline first' })
  @ApiEnvelopeResponse(StripeReviewItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listOpen(
    @Query() q: StripeReviewQueryDto,
  ): Promise<{ items: StripeReviewItemDto[]; nextCursor: string | null }> {
    return this.review.list({ status: 'open', ...q });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Open / overdue counts and the dispute rate' })
  @ApiEnvelopeResponse(StripeReviewSummaryDto)
  async reviewSummary(): Promise<StripeReviewSummaryDto> {
    const [c, r] = await Promise.all([
      this.review.counts(),
      this.disputes.rate(),
    ]);
    return {
      ...c,
      disputes30d: r.disputes,
      payments30d: r.payments,
      disputeRatePercent: r.ratePercent,
      disputeRateLevel: r.level,
    };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an item handled (one 2FA code)' })
  @ApiEnvelopeResponse(StripeReviewItemDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  resolveReview(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StripeReviewIdParamDto,
    @Body() dto: StripeReviewResolveDto,
  ): Promise<StripeReviewItemDto> {
    return this.close(admin, p.id, 'resolved', dto.resolution);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss an item as not needing action (one 2FA code)',
  })
  @ApiEnvelopeResponse(StripeReviewItemDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  dismissReview(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StripeReviewIdParamDto,
    @Body() dto: StripeReviewResolveDto,
  ): Promise<StripeReviewItemDto> {
    return this.close(admin, p.id, 'dismissed', dto.resolution);
  }

  @Get('disputes/:paymentId/evidence')
  @ApiOperation({ summary: 'The evidence packet we would send for a dispute' })
  @ApiEnvelopeResponse(StripeDisputeEvidenceDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async disputeEvidence(
    @Param() p: StripeDisputePaymentParamDto,
  ): Promise<StripeDisputeEvidenceDto> {
    const row = await this.prisma.casePayment.findUnique({
      where: { id: p.paymentId },
      select: { dispute_evidence_status: true, dispute_due_by: true },
    });
    if (!row) throw new NotFoundException();
    const facts = await this.disputes.gatherFacts(p.paymentId);
    return {
      fields: buildEvidenceFields(facts),
      evidenceStatus: row.dispute_evidence_status ?? 'none',
      dueBy: row.dispute_due_by,
    };
  }

  @Post('disputes/:paymentId/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rebuild the evidence draft in Stripe (not submitted)',
  })
  @ApiEnvelopeResponse(StripeDisputeEvidenceDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async disputeDraft(
    @Param() p: StripeDisputePaymentParamDto,
  ): Promise<StripeDisputeEvidenceDto> {
    await this.disputes.buildDraft(p.paymentId);
    return this.disputeEvidence(p);
  }

  @Post('disputes/:paymentId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Send the evidence to the bank through Stripe (final; one 2FA code)',
  })
  @ApiEnvelopeResponse(StripeDisputeSubmitResultDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.PAYMENT_INVALID_STATE],
  })
  async disputeSubmit(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StripeDisputePaymentParamDto,
  ): Promise<StripeDisputeSubmitResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const sent = await this.disputes.submit(p.paymentId);
    await this.audit.record({
      adminId: admin.id,
      action: 'stripe_dispute_evidence_submitted',
      targetType: 'case_payment',
      targetId: p.paymentId,
      after: { disputeId: sent.id },
    });
    return { status: sent.status, submissionCount: sent.submissionCount };
  }

  private async close(
    admin: AdminActor,
    id: string,
    status: 'resolved' | 'dismissed',
    resolution: string,
  ): Promise<StripeReviewItemDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const row = await this.review.resolve(id, admin.id, status, resolution);
    if (!row) throw new NotFoundException();
    await this.audit.record({
      adminId: admin.id,
      action: `stripe_review_${status}`,
      targetType: 'stripe_review_item',
      targetId: id,
      after: { kind: row.kind, resolution },
    });
    return this.review.view(row);
  }
}
