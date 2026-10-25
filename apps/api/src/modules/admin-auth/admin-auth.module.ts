import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminSecurityService } from './admin-security.service';
import { AdminSessionService } from './admin-session.service';

/**
 * docs/06 §2.1–2.2 (stage 6.2): admin sign-in, the admin JWT guard, RBAC
 * and the auto-audit interceptor. Global so every module that owns an
 * `/admin/*` controller (verification, cases, i18n, admin) can use
 * @AdminEndpoint() without importing it.
 */
@Global()
@Module({
  imports: [AuthModule, AdminAccessModule],
  // Owner 2026-10-22: maker-checker approvals (money modules register
  // their kinds with AdminApprovalsService).
  controllers: [AdminAuthController, AdminApprovalsController],
  providers: [
    AdminAuthService,
    AdminApprovalsService,
    AdminSessionService,
    AdminSecurityService,
    AdminAuthGuard,
    AdminAuditInterceptor,
  ],
  // @UseGuards(AdminAuthGuard) instantiates the guard inside the host
  // module, so its dependencies (TokenService, AuditLogService) must be
  // visible there too: re-exported from this global module.
  exports: [
    AdminAuthService,
    AdminApprovalsService,
    AuthModule,
    AdminAccessModule,
    AdminSessionService,
    AdminSecurityService,
    AdminAuthGuard,
    AdminAuditInterceptor,
  ],
})
export class AdminAuthModule {}
