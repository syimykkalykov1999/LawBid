import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import {
  PUBLIC_COMPONENTS,
  type PublicComponent,
} from '../../common/ops/status/public-status';
import { PublicStatusService } from '../../common/ops/status/public-status.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';

export class StatusIncidentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: PUBLIC_COMPONENTS })
  component!: string;
  @ApiProperty({ enum: ['degraded', 'outage', 'maintenance'] })
  kind!: string;
  @ApiProperty()
  titleRu!: string;
  @ApiProperty()
  titleEn!: string;
  @ApiProperty()
  messageRu!: string;
  @ApiProperty()
  messageEn!: string;
  @ApiProperty({ format: 'date-time' })
  startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;
}

export class StatusPageDto {
  @ApiProperty({
    description: 'false until STATUS_PAGE_BUCKET is set: nothing is published.',
  })
  publishing!: boolean;
  @ApiProperty({ type: [StatusIncidentDto] })
  incidents!: StatusIncidentDto[];
}

export class PostStatusIncidentDto {
  @ApiProperty({ enum: PUBLIC_COMPONENTS })
  @IsIn([...PUBLIC_COMPONENTS])
  component!: PublicComponent;

  @ApiProperty({ enum: ['degraded', 'outage', 'maintenance'] })
  @IsIn(['degraded', 'outage', 'maintenance'])
  kind!: 'degraded' | 'outage' | 'maintenance';

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  titleRu!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageRu?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageEn?: string;
}

/**
 * Owner 2026-10-25: Система → «Страница статуса». Super admins post and
 * resolve the incidents users see on status.lawbid.dev. Every change is
 * audited and pushed to the static page at once.
 */
@ApiTags('admin-ops')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/status-page')
export class AdminStatusPageController {
  constructor(
    private readonly status: PublicStatusService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Incidents shown on the public status page' })
  @ApiEnvelopeResponse(StatusPageDto)
  async get(): Promise<StatusPageDto> {
    return this.view();
  }

  @Post('incidents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post an incident on the public status page' })
  @ApiEnvelopeResponse(StatusPageDto)
  async post(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PostStatusIncidentDto,
  ): Promise<StatusPageDto> {
    const row = await this.status.post(dto);
    await this.log(admin, 'ops.status_incident_post', row.id, {
      component: dto.component,
      kind: dto.kind,
    });
    return this.view();
  }

  @Post('incidents/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a posted incident as resolved' })
  @ApiEnvelopeResponse(StatusPageDto)
  async resolve(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StatusPageDto> {
    await this.status.resolve(id);
    await this.log(admin, 'ops.status_incident_resolve', id, null);
    return this.view();
  }

  private async view(): Promise<StatusPageDto> {
    const rows = await this.status.listManual();
    return {
      publishing: this.status.enabled,
      incidents: rows.map((r) => {
        const t = (r.detail.title ?? {}) as { ru?: string; en?: string };
        const m = (r.detail.message ?? {}) as { ru?: string; en?: string };
        return {
          id: r.id,
          component: r.component,
          kind:
            r.severity === 'maint'
              ? 'maintenance'
              : r.severity === 'outage'
                ? 'outage'
                : 'degraded',
          titleRu: t.ru ?? r.title,
          titleEn: t.en ?? t.ru ?? r.title,
          messageRu: m.ru ?? '',
          messageEn: m.en ?? '',
          startedAt: r.openedAt.toISOString(),
          resolvedAt: r.closedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  private log(
    admin: AdminActor,
    action: string,
    targetId: string,
    after: Record<string, string> | null,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'system',
      targetId,
      before: null,
      after,
      ip: admin.ip,
    });
  }
}
