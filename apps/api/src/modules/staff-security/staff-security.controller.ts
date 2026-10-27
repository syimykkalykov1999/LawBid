import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';

/**
 * Staff package: `admin/pii/*` — data protection for staff (reveal, export block, card limit, anomalies).
 * Skeleton registered by T1 with the admin guard wired (AdminAuthGuard:
 * deny by default, 404 for areas outside the admin's rights / workspace).
 * No routes yet; T11 adds them behind their `staff.*_enabled` switch.
 */
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/pii')
export class StaffSecurityController {}
