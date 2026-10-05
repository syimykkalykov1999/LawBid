import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { AdminClientFraudController } from './admin-client-fraud.controller';
import { AdminClientFraudService } from './admin-client-fraud.service';
import { ClientFraudService } from './client-fraud.service';

/**
 * Owner 2026-10-05: repeat accounts of blocked fraudsters
 * (docs/CLIENT_FRAUD.md) — the service only. `@Global()` because auth,
 * cases, chat, reports, privacy and the jobs read it; it imports nothing
 * (sessions, cases and e-mail are resolved lazily) so no cycle.
 */
@Global()
@Module({
  providers: [ClientFraudService],
  exports: [ClientFraudService],
})
export class ClientFraudCoreModule {}

/** Admin → Галочки → «Борьба с мошенниками» → «Клиенты». API only. */
@Module({
  imports: [ClientFraudCoreModule, AdminAccessModule, AdminUsersModule],
  controllers: [AdminClientFraudController],
  providers: [AdminClientFraudService],
})
export class ClientFraudModule {}
