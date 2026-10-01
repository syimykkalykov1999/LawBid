import {
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
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
  IsNotEmpty,
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
import { AdminEndpoint, Roles } from '../admin-auth/admin-auth.decorators';
import { AssistantContextService } from '../auth/assistant/assistant-context';
import { ASSISTANT_DUTIES, type AssistantDuty } from './assistant-duties';
import { ActivityDto, AssistantMemberDto } from './assistants.dto';
import { nameOf } from './assistants.service';

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
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
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
}

export class AdminTeamDto extends AdminTeamRowDto {
  @ApiProperty({ type: [AssistantMemberDto] }) members!: AssistantMemberDto[];
  @ApiProperty({ type: [ActivityDto], description: 'Last 100 actions.' })
  activity!: ActivityDto[];
}

@Injectable()
export class AdminTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AssistantContextService,
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

  async remove(memberId: string, reason: string): Promise<AdminTeamDto> {
    const m = await this.member(memberId);
    await this.prisma.$transaction([
      this.prisma.assistantMembership.update({
        where: { id: memberId },
        data: { status: 'removed', removed_at: new Date() },
      }),
      // The attorney sees in the Team feed that LawBid removed them.
      this.prisma.assistantActivity.create({
        data: {
          attorney_id: m.attorney_id,
          membership_id: memberId,
          action: 'admin.remove',
          summary: reason.slice(0, 300),
        },
      }),
    ]);
    if (m.assistant_user_id) await this.context.invalidate(m.assistant_user_id);
    return this.get(m.attorney_id);
  }

  async setDuties(
    memberId: string,
    duties: AssistantDuty[],
  ): Promise<AdminTeamDto> {
    const m = await this.member(memberId);
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
    const [u, sub, groups, pending, open] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: attorneyId },
        select: {
          first_name: true,
          last_name: true,
          attorney_profile: { select: { username: true } },
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
    ]);
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
      seats: sub ? (sub.plan === 'yearly' ? 6 : sub.assistant_seats) : 0,
      active: count('active'),
      invited: count('invited'),
      pendingRequests: pending,
      openTasks: open,
    };
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
  @ApiOperation({ summary: 'Remove an assistant (access ends at once)' })
  @ApiEnvelopeResponse(AdminTeamDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  removeAdminTeamMember(
    @Param() p: AdminMemberParamDto,
    @Body() dto: AdminRemoveMemberDto,
  ): Promise<AdminTeamDto> {
    return this.teams.remove(p.memberId, dto.reason);
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
