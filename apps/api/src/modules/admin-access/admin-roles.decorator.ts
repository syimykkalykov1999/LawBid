import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';

export const ADMIN_ROLES_KEY = 'lawbid:admin-roles';

/** Admin roles allowed on a route/controller (docs/06 §2.2 RBAC matrix).
 * Used with AdminRolesGuard; a route without it is denied. */
export const AdminRoles = (
  ...roles: AdminRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ADMIN_ROLES_KEY, roles);
