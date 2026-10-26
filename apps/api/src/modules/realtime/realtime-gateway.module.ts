import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { AuthModule } from '../auth/auth.module';
import { QrLoginGateway } from './qr-login.gateway';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';

/** docs/05 §8.5: the Socket.IO server (API process only). Owner
 * 2026-10-22: plus the unauthenticated `/qr` namespace for the website's
 * QR sign-in (QrLoginGateway); the Redis adapter set by RealtimeGateway
 * applies to every namespace of the server. */
@Module({
  imports: [AuthModule, PresenceModule],
  controllers: [RealtimeController],
  providers: [RealtimeGateway, QrLoginGateway],
})
export class RealtimeGatewayModule {}
