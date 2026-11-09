import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsDto } from './staff-settings.dto';
import { StaffSettingsService } from './staff-settings.service';

/**
 * Staff package T1 (plan B4): the effective staff settings, read-only, for
 * the super admin. Changing them goes through the existing settings editor
 * (Настройки, `admin/config`, 2FA step-up); the dedicated page with
 * ceilings comes in T10.
 */
// flag: none admin-only read of the staff switches (super admin; every switch is off by default)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin')
@Controller('admin/staff/settings')
export class StaffSettingsController {
  constructor(private readonly staff: StaffSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Staff package switches and numbers (all off by default)',
  })
  @ApiEnvelopeResponse(StaffSettingsDto)
  async getStaffSettings(): Promise<StaffSettingsDto> {
    // Exactly the contract shape: a three-state switch shows as «on» for the
    // reader unless it stands on «Выкл» (its position lives in /admin/config).
    const { switches, numbers } = await this.staff.get();
    return { switches, numbers };
  }
}
