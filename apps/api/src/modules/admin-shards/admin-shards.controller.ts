import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { MoveRefusedError } from '../../sharding/move/move-types';
import { moveView } from '../../sharding/move/move-view';
import { ShardMoveService } from '../../sharding/move/shard-move.service';
import { OrphanChecker } from '../../sharding/orphan-checker';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  ShardActionDto,
  ShardMoveDto,
  ShardsOverviewDto,
  SplitPlanDto,
  SplitPlanQueryDto,
  SplitStartDto,
} from './admin-shards.dto';

const E = ErrorCode;

/**
 * Shard-ready step 10: the «Разделить базу» button (super_admin only).
 * Preview and progress are plain reads. Starting, rollback and resume need
 * one fresh 2FA code (step-up), nothing else: the owner forbids second-admin
 * (four-eyes) approvals. Every action is an audit_log row.
 */
@ApiTags('admin-shards')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/shards')
export class AdminShardsController {
  constructor(
    private readonly moves: ShardMoveService,
    private readonly orphans: OrphanChecker,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Databases, shard distribution, recent moves' })
  @ApiEnvelopeResponse(ShardsOverviewDto)
  async overview(): Promise<ShardsOverviewDto> {
    const o = await this.moves.overview();
    return {
      databases: o.databases,
      distribution: o.distribution,
      moves: o.moves.map(moveView),
      leaseHeld: o.leaseHeld,
      orphans: (await this.orphans.last()) as unknown as Record<
        string,
        unknown
      > | null,
    };
  }

  @Get('split-plan')
  @ApiOperation({
    summary: 'Preview: which logical shards move, rows, time, readiness',
  })
  @ApiEnvelopeResponse(SplitPlanDto)
  async splitPlan(@Query() q: SplitPlanQueryDto): Promise<SplitPlanDto> {
    const p = await this.moves.splitPlan(q.toDb);
    return { ...p, readiness: { ...p.readiness } };
  }

  @Post('split')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start the split (one 2FA step-up, no second admin)',
  })
  @ApiEnvelopeResponse(ShardActionDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.FEATURE_DISABLED],
  })
  async startSplit(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: SplitStartDto,
  ): Promise<ShardActionDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const ready = await this.moves.readiness(dto.toDb);
    if (!ready.ok) {
      throw new ConflictException({
        code: E.FEATURE_DISABLED,
        message: ready.problems.join('; '),
      });
    }
    await this.log(admin, 'shards.split_requested', {
      toDb: dto.toDb,
      shards: dto.shards.length,
    });
    const started = await this.run(() =>
      this.moves.startSplit(dto.toDb, dto.shards, admin.id),
    );
    await this.log(admin, 'shards.split_started', {
      toDb: dto.toDb,
      shards: dto.shards.length,
    });
    return { ok: true, moves: started.map(moveView) };
  }

  @Get('moves/:id')
  @ApiOperation({ summary: 'Live progress of one move' })
  @ApiEnvelopeResponse(ShardMoveDto)
  async move(@Param('id', ParseUUIDPipe) id: string): Promise<ShardMoveDto> {
    const m = await this.moves.getMove(id);
    if (!m) throw new NotFoundException('move not found');
    return moveView(m);
  }

  @Post('moves/:id/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Roll a move back (step-up)' })
  @ApiEnvelopeResponse(ShardActionDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async rollbackMove(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShardActionDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const rec = await this.run(() => this.moves.rollback(id));
    await this.log(admin, 'shards.move_rolled_back', { moveId: id });
    return { ok: true, moves: [moveView(rec)] };
  }

  @Post('moves/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry a stopped move from its saved step (step-up)',
  })
  @ApiEnvelopeResponse(ShardActionDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async resumeMove(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShardActionDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.log(admin, 'shards.move_resumed', { moveId: id });
    // Runs in the background: the screen polls the move.
    void this.moves.resume(id).catch(() => undefined);
    const m = await this.moves.getMove(id);
    if (!m) throw new NotFoundException('move not found');
    return { ok: true, moves: [moveView(m)] };
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof MoveRefusedError) {
        throw new ConflictException({
          code: E.FEATURE_DISABLED,
          message: e.message,
        });
      }
      throw e;
    }
  }

  private log(
    admin: AdminActor,
    action: string,
    after: Record<string, unknown>,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'system',
      targetId: null,
      before: null,
      after: after as Record<string, string>,
      ip: admin.ip,
    });
  }
}
