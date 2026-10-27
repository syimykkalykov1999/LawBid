import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';

/**
 * Staff package: `admin/staff/rates/*` — piecework rates and the nightly accrual into payroll_accruals.
 * Skeleton registered by T1 with the admin guard wired (AdminAuthGuard:
 * deny by default, 404 for areas outside the admin's rights / workspace).
 * No routes yet; T7 adds them behind their `staff.*_enabled` switch.
 */
@ApiTags('admin-staff')
@AdminEndpoint('super_admin')
@Controller('admin/staff/rates')
export class StaffPieceworkController {}
