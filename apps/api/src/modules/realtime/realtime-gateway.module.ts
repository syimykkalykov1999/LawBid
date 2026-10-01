import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';

/** docs/05 §8.5: the Socket.IO server (API process only). */
@Module({
  imports: [AuthModule, PresenceModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
