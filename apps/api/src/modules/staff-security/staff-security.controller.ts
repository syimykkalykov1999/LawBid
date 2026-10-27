import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  RevealPiiDto,
  RevealPiiResultDto,
  StaffWatermarkDto,
} from './staff-security.dto';
import { isMassStaff, StaffSecurityService } from './staff-security.service';

/**
 * Staff package: `admin/pii/*` — data protection for staff (T11).
 *  - POST reveal: the full value of a masked phone / e-mail / document
 *    number; one audit row each, a daily limit (`staff.reveal_per_day`);
 *  - GET watermark: who the faint watermark of the panel names.
 * The guard (deny by default, 404 outside the admin's rights) runs first.
 */
// flag: none admin-only; reveal answers 404 and the watermark is off while staff.masking_enabled / staff.watermark_enabled are off (default)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@SkipAutoAudit()
@Controller('admin/pii')
export class StaffSecurityController {
  constructor(
    private readonly security: StaffSecurityService,
    private readonly staff: StaffSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('reveal')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Show one masked phone / e-mail / document number in full (audited, limited per day)',
  })
  @ApiEnvelopeResponse(RevealPiiResultDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 429: [E.STAFF_REVEAL_LIMIT] })
  reveal(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: RevealPiiDto,
  ): Promise<RevealPiiResultDto> {
    return this.security.reveal(admin, dto);
  }

  @Get('watermark')
  @ApiOperation({
    summary:
      'Whether the panel draws the faint watermark with the admin name, and its text',
  })
  @ApiEnvelopeResponse(StaffWatermarkDto)
  async watermark(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<StaffWatermarkDto> {
    const on =
      isMassStaff(admin) && (await this.staff.isOn('staff.watermark_enabled'));
    if (!on) return { enabled: false, text: '' };
    const u = await this.prisma.user.findUnique({
      where: { id: admin.id },
      select: {
        email: true,
        admin_credential: { select: { login: true } },
      },
    });
    const name = u?.admin_credential?.login ?? u?.email ?? 'admin';
    return { enabled: true, text: `${name} · ${admin.id.slice(0, 8)}` };
  }
}
