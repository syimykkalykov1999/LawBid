import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { PnlService } from '../../common/pnl/pnl.service';
import type { PnlSnapshot } from '../../common/pnl/pnl.rules';
import {
  AdminEndpoint,
  SkipAutoAudit,
} from '../admin-auth/admin-auth.decorators';
import { PnlReportDto } from './admin-pnl.dto';

/**
 * Owner 2026-10-25: «Прибыль» (Деньги, super admin only). Reads ONLY the
 * stored daily snapshot; the button recounts at most once per 10 minutes.
 */
@ApiTags('admin-pnl')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/pnl')
export class AdminPnlController {
  constructor(private readonly pnl: PnlService) {}

  @Get()
  @ApiOperation({ summary: 'Profit and loss from the daily snapshot' })
  @ApiEnvelopeResponse(PnlReportDto)
  async pnlReport(): Promise<PnlReportDto> {
    return toDto(await this.pnl.read());
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recount now (max once per 10 min)' })
  @ApiEnvelopeResponse(PnlReportDto)
  async pnlRefresh(): Promise<PnlReportDto> {
    return toDto(await this.pnl.refreshFromButton());
  }
}

function toDto(
  s: { data: PnlSnapshot; computedAt: string } | null,
): PnlReportDto {
  if (!s)
    return {
      computedAt: null,
      asOf: null,
      today: null,
      week: null,
      month: null,
      weeks: [],
      byKind: [],
      vendorDataFrom: null,
    };
  return { computedAt: s.computedAt, ...s.data };
}
