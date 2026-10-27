import type { Request } from 'express';
import type { RequestAdmin } from '../admin-auth/admin-auth.decorators';

/**
 * Staff package T11 (data security): what the admin guard and the admin
 * response interceptor ask of the staff-security module. The module binds
 * STAFF_SECURITY; where it is not loaded (a bare test module) the callers
 * skip every check, so the admin API behaves exactly as before.
 * Every method is a no-op while its `staff.*` switch is off.
 */
export const STAFF_SECURITY = Symbol('STAFF_SECURITY');

export type StaffMaskMode = 'none' | 'partial';

export interface StaffSecurityPort {
  /** How this admin's responses are masked (T11 masking, by workspace). */
  maskMode(admin: RequestAdmin): Promise<StaffMaskMode>;
  /**
   * Before an admin handler runs: closes exports for the mass-work
   * workspace (403 + audit) and counts opened cards for the detector.
   */
  beforeHandler(req: Request, admin: RequestAdmin): Promise<void>;
  /**
   * Right after the guard knows who the admin is: country list, device
   * pin and network-address change of the session (throws 401 / 403).
   */
  checkSession(req: Request, admin: RequestAdmin): Promise<void>;
}
