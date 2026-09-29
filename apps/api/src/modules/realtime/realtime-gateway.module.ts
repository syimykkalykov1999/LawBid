import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';

/** docs/05 §8.5: the Socket.IO server (API process only). */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
