import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { SEATS_HARD_CAP } from '../billing/billing.constants';
import { getAssistantLimit } from '../billing/seat-limit';
import { EntitlementsService } from '../plans/entitlements.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AuditLogService } from '../admin-access/audit-log.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AssistantContextService } from '../auth/assistant/assistant-context';
import { ASSISTANT_DUTIES, type AssistantDuty } from './assistant-duties';
import { ActivityDto, AssistantMemberDto } from './assistants.dto';
import { nameOf } from './assistants.service';
import {
  effectiveSeats,
  findActiveGrant,
  paidSeats,
} from '../subscriptions/contract-grant.util';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminTeamsQueryDto {
  @ApiPropertyOptional({ description: 'Attorney name, @username or phone.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminTeamParamDto {
  @ApiProperty({ format: 'uuid', description: 'The attorney user id.' })
  @IsUUID('all')
  id!: string;
}

export class AdminMemberParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  memberId!: string;
}

export class AdminRemoveMemberDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminMemberDutiesDto {
  @ApiProperty({ enum: ASSISTANT_DUTIES, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(ASSISTANT_DUTIES, { each: true })
  duties!: AssistantDuty[];
}

export class AdminTeamRowDto {
  @ApiProperty({ format: 'uuid' }) attorneyId!: string;
  @ApiProperty() attorneyName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;
  @ApiProperty({ enum: ['monthly', 'yearly', 'none'] }) plan!: string;
  @ApiProperty({ type: 'integer' }) seats!: number;
  @ApiProperty({ type: 'integer' }) active!: number;
  @ApiProperty({ type: 'integer' }) invited!: number;
  @ApiProperty({ type: 'integer' }) pendingRequests!: number;
  @ApiProperty({ type: 'integer' }) openTasks!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Owner 2026-10-05: how many assistants this attorney may add.',
  })
  seatLimit!: number;
  @ApiProperty({ description: 'An admin set a personal limit.' })
  seatLimitPersonal!: boolean;
}

/** PATCH /admin/teams/:id/seat-limit — null returns to the global limit. */
export class AdminSeatLimitDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: SEATS_HARD_CAP,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SEATS_HARD_CAP)
  limit!: number | null;
}

export class AdminTeamDto extends AdminTeamRowDto {
  @ApiProperty({ type: [AssistantMemberDto] }) members!: AssistantMemberDto[];
  @ApiProperty({ type: [ActivityDto], description: 'Last 100 actions.' })
  activity!: ActivityDto[];
}

export const TEAM_AUDIT = {
  removeMember: 'admin.team.member_remove',
} as const;

@Injectable()
export class AdminTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AssistantContextService,
    private readonly audit: AuditLogService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  async list(q?: string): Promise<AdminTeamRowDto[]> {
    const term = q?.replace(/^@/, '');
    const attorneys = await this.prisma.user.findMany({
      where: {
        assistant_team: { some: { status: { not: 'removed' } } },
        ...(term
          ? {
              OR: [
                { first_name: { contains: term, mode: 'insensitive' } },
                { last_name: { contains: term, mode: 'insensitive' } },
                { phone_e164: { contains: term } },
                {
                  attorney_profile: {
                    username_lower: { contains: term.toLowerCase() },
                  },
                },
              ],
            }
          : {}),
      },
      take: 200,
      select: { id: true },
    });
    return Promise.all(attorneys.map((a) => this.row(a.id)));
  }

  async get(attorneyId: string): Promise<AdminTeamDto> {
    const row = await this.row(attorneyId);
    const members = await this.prisma.assistantMembership.findMany({
      where: { attorney_id: attorneyId },
      orderBy: { created_at: 'asc' },
      include: {
        assistant_user: { select: { first_name: true, last_name: true } },
      },
    });
    const acts = await this.prisma.assistantActivity.findMany({
      where: { attorney_id: attorneyId },
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        membership: {
          select: {
            display_name: true,
            phone_e164: true,
            assistant_user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    return {
      ...row,
      members: members.map((m) => ({
        id: m.id,
        phone: m.phone_e164,
        name: nameOf(m),
        status: m.status,
        approval: m.approval,
        duties: m.duties,
        joinedAt: m.joined_at?.toISOString() ?? null,
        createdAt: m.created_at.toISOString(),
        liabilityAcceptedAt: null,
        joinCode: null,
        joinCodeExpiresAt: null,
      })),
      activity: acts.map((x) => ({
        id: x.id,
        membershipId: x.membership_id,
        assistantName: nameOf(x.membership),
        action: x.action,
        targetType: x.target_type,
        targetId: x.target_id,
        summary: x.summary,
        createdAt: x.created_at.toISOString(),
      })),
    };
  }

  async remove(
    memberId: string,
    reason: string,
    admin: AdminActor,
  ): Promise<AdminTeamDto> {
    const m = await this.member(memberId);
    await withTxRetry(this.prisma, async (tx) => {
      await tx.assistantMembership.update({
        where: { id: memberId },
        data: { status: 'removed', removed_at: new Date() },
      });
      // The attorney sees in the Team feed that LawBid removed them.
      await tx.assistantActivity.create({
        data: {
          attorney_id: m.attorney_id,
          membership_id: memberId,
          action: 'admin.remove',
          summary: reason.slice(0, 300),
        },
      });
      // Audit 2026-10-02: who removed whom and why, with the change.
      await this.audit.record(
        {
          adminId: admin.id,
          action: TEAM_AUDIT.removeMember,
          targetType: 'assistant_membership',
          targetId: memberId,
          before: { status: m.status, duties: m.duties },
          after: { status: 'removed', attorneyId: m.attorney_id, reason },
          ip: admin.ip,
        },
        tx,
      );
    });
    if (m.assistant_user_id) await this.context.invalidate(m.assistant_user_id);
    return this.get(m.attorney_id);
  }

  async setDuties(
    memberId: string,
    duties: AssistantDuty[],
  ): Promise<AdminTeamDto> {
    const m = await this.member(memberId);
    // OQ-049: only the attorney grants access (they accept responsibility);
    // an admin may only take access away.
    const added = duties.filter((d) => !m.duties.includes(d));
    if (added.length > 0) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_LIABILITY_REQUIRED,
        message: 'Only the attorney can grant access to an assistant.',
        details: { duties: added },
      });
    }
    await this.prisma.assistantMembership.update({
      where: { id: memberId },
      data: { duties },
    });
    if (m.assistant_user_id) await this.context.invalidate(m.assistant_user_id);
    return this.get(m.attorney_id);
  }

  private async member(id: string) {
    const m = await this.prisma.assistantMembership.findUnique({
      where: { id },
    });
    if (!m) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Assistant not found.',
      });
    }
    return m;
  }

  private async row(attorneyId: string): Promise<AdminTeamRowDto> {
    const [u, sub, groups, pending, open, grant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: attorneyId },
        select: {
          first_name: true,
          last_name: true,
          attorney_profile: {
            select: { username: true, assistant_seat_limit: true },
          },
        },
      }),
      this.prisma.subscription.findUnique({
        where: { user_id: attorneyId },
        select: { plan: true, assistant_seats: true },
      }),
      this.prisma.assistantMembership.groupBy({
        by: ['status'],
        where: { attorney_id: attorneyId },
        _count: true,
      }),
      this.prisma.assistantRequest.count({
        where: { attorney_id: attorneyId, status: 'pending' },
      }),
      this.prisma.attorneyTask.count({
        where: { attorney_id: attorneyId, status: { in: ['open', 'taken'] } },
      }),
      findActiveGrant(this.prisma, attorneyId),
    ]);
    const seatLimit = await getAssistantLimit(
      this.prisma,
      attorneyId,
      this.settings,
      this.entitlements,
    );
    if (!u) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attorney not found.',
      });
    }
    const count = (s: string) =>
      groups.find((g) => g.status === s)?._count ?? 0;
    return {
      attorneyId,
      attorneyName:
        [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Attorney',
      username: u.attorney_profile?.username ?? null,
      plan: sub?.plan ?? 'none',
      // Owner 2026-10-02: max(paid seats, contract grant seats).
      seats: effectiveSeats(
        paidSeats(sub, seatLimit),
        grant?.assistant_seats ?? null,
      ),
      active: count('active'),
      invited: count('invited'),
      pendingRequests: pending,
      openTasks: open,
      seatLimit,
      seatLimitPersonal: (u.attorney_profile?.assistant_seat_limit ?? 0) > 0,
    };
  }

  /** Owner 2026-10-05: an admin sets (or clears) the attorney's own
   * assistant limit directly. */
  async setSeatLimit(
    attorneyId: string,
    limit: number | null,
    admin: AdminActor,
  ): Promise<AdminTeamDto> {
    const profile = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { assistant_seat_limit: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attorney not found.',
      });
    }
    await this.prisma.attorneyProfile.update({
      where: { user_id: attorneyId },
      data: { assistant_seat_limit: limit },
    });
    await this.entitlements?.invalidateUser(attorneyId);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.seat_limit.set',
      targetType: 'user',
      targetId: attorneyId,
      before: { assistantSeatLimit: profile.assistant_seat_limit },
      after: { assistantSeatLimit: limit },
      ip: admin.ip,
    });
    return this.get(attorneyId);
  }
}

/** Owner 2026-09-30 (OQ-048): admins see and manage attorney teams. */
@ApiTags('admin-teams')
@AdminEndpoint('super_admin', 'moderator', 'support')
@Controller('admin/teams')
export class AdminTeamsController {
  constructor(private readonly teams: AdminTeamsService) {}

  @Get()
  @ApiOperation({ summary: 'Attorneys with assistants' })
  @ApiEnvelopeResponse(AdminTeamRowDto, { isArray: true })
  listAdminTeams(@Query() q: AdminTeamsQueryDto): Promise<AdminTeamRowDto[]> {
    return this.teams.list(q.q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A team: members, duties, recent activity' })
  @ApiEnvelopeResponse(AdminTeamDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  getAdminTeam(@Param() p: AdminTeamParamDto): Promise<AdminTeamDto> {
    return this.teams.get(p.id);
  }

  @Post('members/:memberId/remove')
  @Roles('super_admin', 'moderator')
  // Audit 2026-10-02: the service writes the audit row (before/after).
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Remove an assistant (access ends at once)' })
  @ApiEnvelopeResponse(AdminTeamDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  removeAdminTeamMember(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminMemberParamDto,
    @Body() dto: AdminRemoveMemberDto,
  ): Promise<AdminTeamDto> {
    return this.teams.remove(p.memberId, dto.reason, admin);
  }

  @Patch(':id/seat-limit')
  @Roles('super_admin')
  @SkipAutoAudit()
  @ApiOperation({
    summary: "Set the attorney's own assistant limit (null = global)",
  })
  @ApiEnvelopeResponse(AdminTeamDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 404: [ErrorCode.NOT_FOUND] })
  setAdminTeamSeatLimit(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminTeamParamDto,
    @Body() dto: AdminSeatLimitDto,
  ): Promise<AdminTeamDto> {
    return this.teams.setSeatLimit(p.id, dto.limit ?? null, admin);
  }

  @Patch('members/:memberId/duties')
  @Roles('super_admin', 'moderator')
  @ApiOperation({ summary: "Change an assistant's duties" })
  @ApiEnvelopeResponse(AdminTeamDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  setAdminTeamMemberDuties(
    @Param() p: AdminMemberParamDto,
    @Body() dto: AdminMemberDutiesDto,
  ): Promise<AdminTeamDto> {
    return this.teams.setDuties(p.memberId, dto.duties);
  }
}
