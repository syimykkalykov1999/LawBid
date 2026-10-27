import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
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
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  DeskDecisionsDto,
  DeskDecisionsQueryDto,
  DeskSettingsDto,
} from './staff-desk-read.dto';
import type { StaffNumberKey, StaffSwitchKey } from './staff-settings.defaults';
import { StaffSettingsService } from './staff-settings.service';

/** The switches a worker's desk reads. */
export const DESK_SWITCH_KEYS: readonly StaffSwitchKey[] = [
  'staff.workspaces_enabled',
  'staff.desk_enabled',
  'staff.lease_enabled',
  'staff.lease_support_enabled',
  'staff.lease_verification_enabled',
  'staff.lease_report_enabled',
  'staff.lease_appeal_enabled',
  'staff.lease_finance_enabled',
  'staff.presence_enabled',
  'staff.rating_enabled',
  'staff.worker_progress_enabled',
  'staff.appeals_enabled',
  'staff.case_appeals_enabled',
  'staff.piecework_enabled',
  'staff.head_enabled',
];

/** The numbers a worker's desk shows (timers, capacity). */
export const DESK_NUMBER_KEYS: readonly StaffNumberKey[] = [
  'staff.presence.heartbeat_sec',
  'staff.presence.ttl_sec',
  'staff.presence.active_window_sec',
  'staff.presence.grace_sec',
  'staff.lease.idle_release_sec',
  'staff.lease.warn_before_sec',
  'staff.lease.ttl_verification_min',
  'staff.lease.ttl_report_min',
  'staff.lease.ttl_appeal_min',
  'staff.lease.ttl_ticket_min',
  'staff.lease.ttl_finance_min',
  'staff.lease.capacity',
  'staff.lease.chat_capacity',
  'staff.lease.waiting_client_max',
  'staff.lease.wrapup_support_sec',
  'staff.lease.skips_per_hour',
];

const DAY_MS = 86_400_000;

/**
 * Staff package T8: two small reads for the worker's one-page desk. They sit
 * under `admin/workspace/*` (the area every signed-in admin reaches, like the
 * other personal pages), read app_config (cached) and the admin's OWN rows of
 * the nightly counters only — no live heavy query.
 */
// flag: none (reads the switches themselves; decisions answer 404 while staff.worker_progress_enabled is off)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/workspace')
export class StaffDeskReadController {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('desk-settings')
  @ApiOperation({
    summary: 'Switches and timers the one-page desk needs (whitelist)',
  })
  @ApiEnvelopeResponse(DeskSettingsDto)
  async deskSettings(): Promise<DeskSettingsDto> {
    const s = await this.staff.get();
    return {
      switches: Object.fromEntries(
        DESK_SWITCH_KEYS.map((k) => [k, s.switches[k]]),
      ),
      numbers: Object.fromEntries(
        DESK_NUMBER_KEYS.map((k) => [k, s.numbers[k]]),
      ),
    };
  }

  @Get('desk-decisions')
  @ApiOperation({
    summary: 'My own closed items per day (nightly counters), newest first',
  })
  @ApiEnvelopeResponse(DeskDecisionsDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  async deskDecisions(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: DeskDecisionsQueryDto,
  ): Promise<DeskDecisionsDto> {
    if (!(await this.staff.isOn('staff.worker_progress_enabled'))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
    const days = q.days ?? 14;
    const since = new Date(Date.now() - days * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.staffDailyStat.findMany({
      where: { admin_id: admin.id, day: { gte: since } },
      orderBy: { day: 'desc' },
      take: days,
      select: {
        day: true,
        decided: true,
        avg_handle_sec: true,
        reopened: true,
        late_sla: true,
        skips: true,
      },
    });
    return {
      days: rows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        decided: r.decided,
        avgHandleSec: r.avg_handle_sec,
        reopened: r.reopened,
        lateSla: r.late_sla,
        skips: r.skips,
      })),
      decidedTotal: rows.reduce((n, r) => n + r.decided, 0),
    };
  }
}
