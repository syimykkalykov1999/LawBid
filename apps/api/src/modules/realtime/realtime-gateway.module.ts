import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { AdminModule } from '../admin/admin.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { AdminRealtimeController } from './admin-realtime.controller';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { QrLoginGateway } from './qr-login.gateway';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';

/** docs/05 §8.5: the Socket.IO server (API process only). Owner
 * 2026-10-22: plus the unauthenticated `/qr` namespace for the website's
 * QR sign-in (QrLoginGateway); the Redis adapter set by RealtimeGateway
 * applies to every namespace of the server. Speed matrix 2026-11-09 (§3
 * #5): plus the admin panel's `/admin` namespace (AdminRealtimeGateway) and
 * its ticket endpoint. */
@Module({
  imports: [AuthModule, PresenceModule, AdminAuthModule, AdminModule],
  controllers: [RealtimeController, AdminRealtimeController],
  providers: [RealtimeGateway, QrLoginGateway, AdminRealtimeGateway],
})
export class RealtimeGatewayModule {}
