import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';

/**
 * Staff package: `admin/desk/ai/*` — AI mode (master switch staff.ai_enabled, off = zero AI calls).
 * Skeleton registered by T1 with the admin guard wired (AdminAuthGuard:
 * deny by default, 404 for areas outside the admin's rights / workspace).
 * No routes yet; T12 adds them behind their `staff.*_enabled` switch.
 */
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/desk/ai')
export class StaffAiController {}
